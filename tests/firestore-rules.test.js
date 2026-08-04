// Tests des règles de sécurité Firestore (firestore.rules) contre l'émulateur.
// Lancer via `npm run test:rules` (démarre l'émulateur automatiquement) — ne PAS lancer avec
// `node --test` directement, ces tests ont besoin d'un émulateur Firestore actif sur le port 8080.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs
} from 'firebase/firestore';

const SUPER_ADMIN_EMAIL = 'mahdiou.diallo@gmail.com';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'gestion-commerciale-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function dbSuperAdmin() {
  return testEnv.authenticatedContext('uid-super-admin', { email: SUPER_ADMIN_EMAIL }).firestore();
}
function dbUser(uid, email) {
  return testEnv.authenticatedContext(uid, { email: email || `${uid}@test.com` }).firestore();
}
function dbAnon() {
  return testEnv.unauthenticatedContext().firestore();
}
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}
// Crée une boutique avec un membre de rôle donné dans utilisateurs/ ET son pointeur membres/.
async function seedMembre(boutiqueId, uid, role) {
  await seed(async (db) => {
    await setDoc(doc(db, 'boutiques', boutiqueId, 'utilisateurs', uid), { role, nom: uid, email: `${uid}@test.com` });
    await setDoc(doc(db, 'membres', uid), { boutiqueId, role });
  });
}

// ---------- config ----------
test('config: lecture publique, écriture réservée au super-admin', async () => {
  await seed(db => setDoc(doc(db, 'config', 'tarifs'), { prix: 100 }));
  await assertSucceeds(getDoc(doc(dbAnon(), 'config', 'tarifs')));
  await assertFails(setDoc(doc(dbUser('u1'), 'config', 'tarifs'), { prix: 200 }));
  await assertSucceeds(setDoc(doc(dbSuperAdmin(), 'config', 'tarifs'), { prix: 200 }));
});

// ---------- connexions ----------
test('connexions: création de sa propre entrée uniquement', async () => {
  await assertSucceeds(setDoc(doc(dbUser('u1'), 'connexions', 'c1'), { uid: 'u1', email: 'u1@test.com', dateConnexion: '2026-01-01' }));
  await assertFails(setDoc(doc(dbUser('u1'), 'connexions', 'c2'), { uid: 'u2', email: 'u2@test.com', dateConnexion: '2026-01-01' }));
});
test('connexions: lecture réservée au super-admin', async () => {
  await seed(db => setDoc(doc(db, 'connexions', 'c1'), { uid: 'u1', email: 'u1@test.com', dateConnexion: '2026-01-01' }));
  await assertFails(getDoc(doc(dbUser('u1'), 'connexions', 'c1')));
  await assertSucceeds(getDoc(doc(dbSuperAdmin(), 'connexions', 'c1')));
});
test('connexions: on peut mettre à jour son propre ping mais pas les champs identitaires', async () => {
  await seed(db => setDoc(doc(db, 'connexions', 'c1'), { uid: 'u1', email: 'u1@test.com', boutiqueId: 'b1', role: 'Vendeur', dateConnexion: '2026-01-01' }));
  await assertSucceeds(updateDoc(doc(dbUser('u1'), 'connexions', 'c1'), { dernierPing: '2026-01-02' }));
  await assertFails(updateDoc(doc(dbUser('u1'), 'connexions', 'c1'), { role: 'Propriétaire' }));
  await assertFails(updateDoc(doc(dbUser('u2'), 'connexions', 'c1'), { dernierPing: '2026-01-02' }));
});
test('connexions: suppression réservée au super-admin', async () => {
  await seed(db => setDoc(doc(db, 'connexions', 'c1'), { uid: 'u1' }));
  await assertFails(deleteDoc(doc(dbUser('u1'), 'connexions', 'c1')));
  await assertSucceeds(deleteDoc(doc(dbSuperAdmin(), 'connexions', 'c1')));
});

// ---------- journalAdmin ----------
test('journalAdmin: lecture/création réservées au super-admin, jamais de modification/suppression', async () => {
  await assertFails(setDoc(doc(dbUser('u1'), 'journalAdmin', 'j1'), { action: 'test' }));
  await assertSucceeds(setDoc(doc(dbSuperAdmin(), 'journalAdmin', 'j1'), { action: 'test' }));
  await assertFails(getDoc(doc(dbUser('u1'), 'journalAdmin', 'j1')));
  await assertSucceeds(getDoc(doc(dbSuperAdmin(), 'journalAdmin', 'j1')));
  await assertFails(updateDoc(doc(dbSuperAdmin(), 'journalAdmin', 'j1'), { action: 'modifie' }));
  await assertFails(deleteDoc(doc(dbSuperAdmin(), 'journalAdmin', 'j1')));
});

// ---------- membres/{uid} ----------
test('membres: lecture réservée au propriétaire du pointeur (même pas le super-admin)', async () => {
  await seed(db => setDoc(doc(db, 'membres', 'u1'), { boutiqueId: 'b1', role: 'Propriétaire' }));
  await assertSucceeds(getDoc(doc(dbUser('u1'), 'membres', 'u1')));
  await assertFails(getDoc(doc(dbUser('u2'), 'membres', 'u1')));
  await assertFails(getDoc(doc(dbSuperAdmin(), 'membres', 'u1')));
});
test('membres: on peut créer son propre pointeur librement', async () => {
  await assertSucceeds(setDoc(doc(dbUser('u1'), 'membres', 'u1'), { boutiqueId: 'b1', role: 'Propriétaire' }));
});
test('membres: un Propriétaire peut créer le pointeur d\'un utilisateur de sa boutique', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await assertSucceeds(setDoc(doc(dbUser('proprio'), 'membres', 'employe1'), { boutiqueId: 'b1', role: 'Vendeur' }));
});
test('membres: un Vendeur ne peut pas créer le pointeur d\'un autre utilisateur', async () => {
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await assertFails(setDoc(doc(dbUser('vendeur1'), 'membres', 'employe2'), { boutiqueId: 'b1', role: 'Vendeur' }));
});
test('membres: suppression par le Propriétaire de la boutique ou le super-admin', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seed(db => setDoc(doc(db, 'membres', 'employe1'), { boutiqueId: 'b1', role: 'Vendeur' }));
  await assertFails(deleteDoc(doc(dbUser('employe1'), 'membres', 'employe1')));
  await assertSucceeds(deleteDoc(doc(dbUser('proprio'), 'membres', 'employe1')));
});

// ---------- boutiques/{boutiqueId} (doc racine) ----------
test('boutiques (racine): lecture réservée aux membres et au super-admin', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seed(db => setDoc(doc(db, 'boutiques', 'b1'), { nom: 'Ma Boutique', plan: 'gratuit' }));
  await assertSucceeds(getDoc(doc(dbUser('proprio'), 'boutiques', 'b1')));
  await assertSucceeds(getDoc(doc(dbSuperAdmin(), 'boutiques', 'b1')));
  await assertFails(getDoc(doc(dbUser('etranger'), 'boutiques', 'b1')));
});
test('boutiques (racine): création par soi-même limitée au plan gratuit, sans champs d\'abonnement', async () => {
  await assertSucceeds(setDoc(doc(dbUser('nouvelle-boutique'), 'boutiques', 'nouvelle-boutique'), { nom: 'Test', plan: 'gratuit' }));
  await assertFails(setDoc(doc(dbUser('autre-boutique'), 'boutiques', 'autre-boutique'), { nom: 'Test', plan: 'pro' }));
  await assertFails(setDoc(doc(dbUser('autre-boutique2'), 'boutiques', 'autre-boutique2'), { nom: 'Test', dateExpirationAbonnement: '2027-01-01' }));
});
test('boutiques (racine): le Propriétaire ne peut pas modifier les champs d\'abonnement lui-même', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seed(db => setDoc(doc(db, 'boutiques', 'b1'), { nom: 'Ma Boutique', plan: 'gratuit' }));
  await assertSucceeds(updateDoc(doc(dbUser('proprio'), 'boutiques', 'b1'), { nom: 'Nouveau nom' }));
  await assertFails(updateDoc(doc(dbUser('proprio'), 'boutiques', 'b1'), { plan: 'entreprise' }));
  await assertSucceeds(updateDoc(doc(dbSuperAdmin(), 'boutiques', 'b1'), { plan: 'entreprise' }));
});
test('boutiques (racine): suppression réservée au super-admin', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seed(db => setDoc(doc(db, 'boutiques', 'b1'), { nom: 'Ma Boutique' }));
  await assertFails(deleteDoc(doc(dbUser('proprio'), 'boutiques', 'b1')));
  await assertSucceeds(deleteDoc(doc(dbSuperAdmin(), 'boutiques', 'b1')));
});

// ---------- boutiques/{id}/utilisateurs ----------
test('utilisateurs: un Propriétaire peut ajouter/changer un rôle Gérant ou Vendeur', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await assertSucceeds(setDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'utilisateurs', 'employe1'), { role: 'Vendeur', nom: 'Employé 1' }));
  await assertFails(setDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'utilisateurs', 'employe2'), { role: 'RoleInvalide', nom: 'X' }));
});
test('utilisateurs: un Vendeur ne peut pas ajouter d\'utilisateur', async () => {
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await assertFails(setDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'utilisateurs', 'employe2'), { role: 'Vendeur', nom: 'X' }));
});
test('utilisateurs: migration historique — un compte peut s\'auto-déclarer Propriétaire de sa propre boutique historique', async () => {
  // Le rôle doit être Propriétaire dès la création : un compte ne peut pas se déclarer Vendeur
  // via cette exception de migration (elle n'existe que pour promouvoir un ancien compte au rôle
  // Propriétaire, pas pour créer n'importe quel rôle).
  await assertFails(setDoc(doc(dbUser('ancien-uid'), 'boutiques', 'ancien-uid', 'utilisateurs', 'ancien-uid'), { role: 'Vendeur', nom: 'Ancien' }));
  await assertSucceeds(setDoc(doc(dbUser('ancien-uid'), 'boutiques', 'ancien-uid', 'utilisateurs', 'ancien-uid'), { role: 'Propriétaire', nom: 'Ancien' }));
});
test('utilisateurs: suppression par le Propriétaire ou le super-admin', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'utilisateurs', 'employe1'), { role: 'Vendeur', nom: 'E1' }));
  await assertFails(deleteDoc(doc(dbUser('employe1'), 'boutiques', 'b1', 'utilisateurs', 'employe1')));
  await assertSucceeds(deleteDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'utilisateurs', 'employe1')));
});

// ---------- depenses ----------
test('depenses: accessibles aux membres non-Vendeur, interdites au Vendeur', async () => {
  await seedMembre('b1', 'gerant1', 'Gérant');
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await assertSucceeds(setDoc(doc(dbUser('gerant1'), 'boutiques', 'b1', 'depenses', 'd1'), { montant: 100 }));
  await assertFails(setDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'depenses', 'd2'), { montant: 100 }));
  await assertFails(getDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'depenses', 'd1')));
});
test('depenses: le super-admin peut lire et supprimer (purge de boutique) mais pas créer', async () => {
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'depenses', 'd1'), { montant: 100 }));
  await assertSucceeds(getDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'depenses', 'd1')));
  await assertFails(setDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'depenses', 'd2'), { montant: 1 }));
  await assertSucceeds(deleteDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'depenses', 'd1')));
});

// ---------- clients ----------
test('clients: tout membre peut créer/lire/modifier, seul le Propriétaire peut supprimer', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await assertSucceeds(setDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'clients', 'c1'), { nom: 'Client 1' }));
  await assertSucceeds(updateDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'clients', 'c1'), { nom: 'Client 1 modifié' }));
  await assertFails(deleteDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'clients', 'c1')));
  await assertSucceeds(deleteDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'clients', 'c1')));
});
test('clients: le super-admin peut aussi supprimer (purge de boutique)', async () => {
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'clients', 'c1'), { nom: 'Client 1' }));
  await assertSucceeds(deleteDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'clients', 'c1')));
});

// ---------- fournisseurs ----------
test('fournisseurs: tout membre peut créer/lire/modifier, seul le Propriétaire peut supprimer', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seedMembre('b1', 'gerant1', 'Gérant');
  await assertSucceeds(setDoc(doc(dbUser('gerant1'), 'boutiques', 'b1', 'fournisseurs', 'f1'), { nom: 'Fournisseur 1' }));
  await assertFails(deleteDoc(doc(dbUser('gerant1'), 'boutiques', 'b1', 'fournisseurs', 'f1')));
  await assertSucceeds(deleteDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'fournisseurs', 'f1')));
});

// ---------- journalAudit ----------
test('journalAudit: append-only (même pour le Propriétaire), lecture réservée au Propriétaire (et au super-admin)', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await assertSucceeds(setDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'journalAudit', 'j1'), { action: 'suppression' }));
  await assertFails(getDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'journalAudit', 'j1')));
  await assertSucceeds(getDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'journalAudit', 'j1')));
  await assertFails(updateDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'journalAudit', 'j1'), { action: 'modifie' }));
  await assertFails(deleteDoc(doc(dbUser('proprio'), 'boutiques', 'b1', 'journalAudit', 'j1')));
});
test('journalAudit: le super-admin peut le supprimer (purge lors d\'une suppression de boutique), mais pas le modifier', async () => {
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'journalAudit', 'j1'), { action: 'suppression' }));
  await assertFails(updateDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'journalAudit', 'j1'), { action: 'modifie' }));
  await assertSucceeds(deleteDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'journalAudit', 'j1')));
});

// ---------- règle générique (catch-all) ----------
test('catch-all: un membre a accès aux autres sous-collections (ex. produits)', async () => {
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await assertSucceeds(setDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'produits', 'p1'), { nom: 'Produit 1' }));
  await assertSucceeds(getDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'produits', 'p1')));
});
test('catch-all: un non-membre n\'a accès à aucune sous-collection', async () => {
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'produits', 'p1'), { nom: 'Produit 1' }));
  await assertFails(getDoc(doc(dbUser('etranger'), 'boutiques', 'b1', 'produits', 'p1')));
});
test('catch-all: le super-admin (non-membre) peut lire et supprimer (purge) mais pas écrire dans les sous-collections métier', async () => {
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'produits', 'p1'), { nom: 'Produit 1' }));
  // Lecture ouverte uniquement pour que supprimerBoutiqueCascade() (view-admin.js) puisse LISTER
  // les documents avant de les supprimer un à un — jamais utilisée ailleurs dans l'interface.
  await assertSucceeds(getDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'produits', 'p1')));
  await assertFails(setDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'produits', 'p2'), { nom: 'Produit 2' }));
  await assertSucceeds(deleteDoc(doc(dbSuperAdmin(), 'boutiques', 'b1', 'produits', 'p1')));
});
test('catch-all: la liste d\'exclusion protège bien clients/fournisseurs/depenses/utilisateurs/journalAudit d\'un contournement', async () => {
  // Piège documenté dans CLAUDE.md : si un nom de collection protégée disparaissait de la liste
  // d'exclusion du catch-all, cette règle générique permettrait à un Vendeur de supprimer un
  // client — ce test échouerait alors silencieusement en "succès" au lieu d'échouer.
  await seedMembre('b1', 'vendeur1', 'Vendeur');
  await seed(db => setDoc(doc(db, 'boutiques', 'b1', 'clients', 'c1'), { nom: 'Client 1' }));
  await assertFails(deleteDoc(doc(dbUser('vendeur1'), 'boutiques', 'b1', 'clients', 'c1')));
});

// ---------- suppression complète d'une boutique (supprimerBoutiqueCascade, view-admin.js) ----------
test('suppression de boutique: le super-admin peut purger toutes les sous-collections puis la boutique elle-même', async () => {
  await seedMembre('b1', 'proprio', 'Propriétaire');
  await seed(db => Promise.all([
    setDoc(doc(db, 'boutiques', 'b1', 'produits', 'p1'), { nom: 'P1' }),
    setDoc(doc(db, 'boutiques', 'b1', 'ventes', 'v1'), { total: 10 }),
    setDoc(doc(db, 'boutiques', 'b1', 'clients', 'c1'), { nom: 'C1' }),
    setDoc(doc(db, 'boutiques', 'b1', 'fournisseurs', 'f1'), { nom: 'F1' }),
    setDoc(doc(db, 'boutiques', 'b1', 'depenses', 'd1'), { montant: 5 }),
    setDoc(doc(db, 'boutiques', 'b1', 'journalAudit', 'j1'), { action: 'x' }),
    setDoc(doc(db, 'membres', 'proprio'), { boutiqueId: 'b1', role: 'Propriétaire' })
  ]));
  const admin = dbSuperAdmin();
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'produits', 'p1')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'ventes', 'v1')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'clients', 'c1')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'fournisseurs', 'f1')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'depenses', 'd1')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'journalAudit', 'j1')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1', 'utilisateurs', 'proprio')));
  await assertSucceeds(deleteDoc(doc(admin, 'membres', 'proprio')));
  await assertSucceeds(deleteDoc(doc(admin, 'boutiques', 'b1')));
});
