#!/usr/bin/env node
// Réinitialise la boutique "Entreprise TEST" à un jeu de données propre et réaliste,
// avant une démonstration à un prospect. Ne touche jamais aux comptes (utilisateurs/membres)
// ni à l'abonnement (plan/dateExpirationAbonnement) — seulement aux données métier.
//
// Utilisation : npm run reset-demo
// Nécessite d'être connecté via `firebase login` (utilise le jeton du CLI, comme
// les autres scripts d'administration de ce projet).

const fs = require('fs');
const os = require('os');
const path = require('path');

// Jetons OAuth publics du client "installed app" de firebase-tools (embarqués en clair
// dans son code source open-source) — on les réutilise pour rafraîchir, avec le
// refresh_token que `firebase login` a déjà stocké localement, un jeton d'accès Firestore.
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken() {
  const cheminConfig = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cheminConfig)) {
    throw new Error(`Fichier de connexion firebase introuvable (${cheminConfig}). Lance d'abord: firebase login`);
  }
  const config = JSON.parse(fs.readFileSync(cheminConfig, 'utf8'));
  const refreshToken = config.tokens && config.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error("Aucun refresh_token trouvé. Lance d'abord: firebase login");
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Rafraîchissement du jeton échoué (${r.status}): ${await r.text()}`);
  const data = await r.json();
  return data.access_token;
}

const PROJECT_ID = 'gestion-commerciale-gn';
const BOUTIQUE_ID = 'NrS1b0tu11RM6mSsYrYxyJNqqhZ2'; // Entreprise TEST
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Collections métier réinitialisées à chaque exécution. On ne touche jamais à
// 'utilisateurs' (comptes de connexion) ni au document racine de la boutique.
const COLLECTIONS_A_VIDER = [
  'produits', 'ventes', 'achats', 'depenses', 'clients', 'paiements',
  'fournisseurs', 'paiementsFournisseurs', 'productions', 'retours', 'journalAudit',
];

const EMPLOYES = {
  proprietaire: { id: 'NrS1b0tu11RM6mSsYrYxyJNqqhZ2', nom: 'Admin TEST' },
  gerant:       { id: '5wBDisXVInQlLhVVo7RDi5GaSRb2', nom: 'Gerant TEST' },
  vendeur:      { id: 'rYJb48KUnfYScWLmY9QMe1w08y93', nom: 'Vendeur TEST' },
};

function ilYA(joursAvant, heure = 12, minute = 0) {
  const d = new Date();
  d.setUTCHours(heure, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() - joursAvant);
  return d;
}
const dateISO = (d) => d.toISOString().slice(0, 10);
const dateHeureISO = (d) => d.toISOString();

// --- Conversion valeurs JS -> format typé de l'API REST Firestore ---
function versValeurFirestore(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(versValeurFirestore) } };
  if (typeof v === 'object') return { mapValue: { fields: versChamps(v) } };
  throw new Error('Type non supporté pour Firestore: ' + typeof v);
}
function versChamps(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[k] = versValeurFirestore(val);
  }
  return fields;
}

async function requeteFirestore(token, methode, chemin, corps) {
  const r = await fetch(`${BASE_URL}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!r.ok) {
    const texte = await r.text();
    throw new Error(`${methode} ${chemin} -> ${r.status}: ${texte}`);
  }
  return r.status === 204 ? null : r.json();
}

async function listerDocuments(token, nomCollection) {
  const noms = [];
  let pageToken;
  do {
    const qs = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
    const rep = await requeteFirestore(token, 'GET', `/boutiques/${BOUTIQUE_ID}/${nomCollection}?${qs}`);
    (rep.documents || []).forEach((d) => noms.push(d.name));
    pageToken = rep.nextPageToken;
  } while (pageToken);
  return noms;
}

async function viderCollection(token, nomCollection) {
  const noms = await listerDocuments(token, nomCollection);
  await Promise.all(noms.map((nomComplet) => {
    const chemin = '/' + nomComplet.split('/documents/')[1];
    return requeteFirestore(token, 'DELETE', chemin);
  }));
  return noms.length;
}

async function creerDocument(token, nomCollection, data) {
  await requeteFirestore(token, 'POST', `/boutiques/${BOUTIQUE_ID}/${nomCollection}`, { fields: versChamps(data) });
}

// --- Jeu de données de démonstration (électronique / téléphonie, Conakry) ---

const PRODUITS = [
  { numero: 'TEL-001', nom: 'Samsung Galaxy A15', categorie: 'Téléphones', type: 'fini', stock: 12, prix_achat: 850000, prix_vente: 980000, seuil: 5 },
  { numero: 'TEL-002', nom: 'Samsung Galaxy A05', categorie: 'Téléphones', type: 'fini', stock: 8, prix_achat: 650000, prix_vente: 780000, seuil: 5 },
  { numero: 'TEL-003', nom: 'iPhone 13 (reconditionné)', categorie: 'Téléphones', type: 'fini', stock: 4, prix_achat: 2200000, prix_vente: 2650000, seuil: 3 },
  { numero: 'TEL-004', nom: 'Tecno Spark 20', categorie: 'Téléphones', type: 'fini', stock: 15, prix_achat: 700000, prix_vente: 850000, seuil: 6 },
  { numero: 'TEL-005', nom: 'Infinix Hot 40', categorie: 'Téléphones', type: 'fini', stock: 10, prix_achat: 720000, prix_vente: 870000, seuil: 5 },
  { numero: 'TAB-001', nom: 'Tablette Samsung A9', categorie: 'Tablettes', type: 'fini', stock: 5, prix_achat: 950000, prix_vente: 1150000, seuil: 3 },
  { numero: 'AUD-001', nom: 'Enceinte Bluetooth portable', categorie: 'Audio', type: 'fini', stock: 9, prix_achat: 120000, prix_vente: 210000, seuil: 5 },
  { numero: 'ACC-001', nom: 'Chargeur rapide Type-C', categorie: 'Accessoires', type: 'fini', stock: 45, prix_achat: 35000, prix_vente: 60000, seuil: 15 },
  { numero: 'ACC-002', nom: 'Écouteurs Bluetooth', categorie: 'Accessoires', type: 'fini', stock: 25, prix_achat: 45000, prix_vente: 85000, seuil: 10 },
  { numero: 'ACC-003', nom: 'Coque de protection universelle', categorie: 'Accessoires', type: 'fini', stock: 55, prix_achat: 15000, prix_vente: 35000, seuil: 20 },
  { numero: 'ACC-004', nom: 'Power bank 10000mAh', categorie: 'Accessoires', type: 'fini', stock: 18, prix_achat: 90000, prix_vente: 150000, seuil: 8 },
  { numero: 'ACC-005', nom: 'Carte mémoire 64GB', categorie: 'Accessoires', type: 'fini', stock: 30, prix_achat: 40000, prix_vente: 70000, seuil: 10 },
  { numero: 'ACC-006', nom: 'Verre trempé (protection écran)', categorie: 'Accessoires', type: 'fini', stock: 6, prix_achat: 8000, prix_vente: 20000, seuil: 20 },
];

const CLIENTS = [
  { nom: 'Mamadou Bah', telephone: '622 12 34 56', adresse: 'Ratoma, Conakry', notes: '' },
  { nom: 'Aissatou Diallo', telephone: '620 45 67 89', adresse: 'Kaloum, Conakry', notes: '' },
  { nom: 'Fatoumata Camara', telephone: '655 98 76 54', adresse: 'Dixinn, Conakry', notes: '' },
  { nom: 'Ibrahima Sow', telephone: '664 33 22 11', adresse: 'Matam, Conakry', notes: '' },
];

const FOURNISSEURS = [
  { nom: 'Import Phone Guinée', telephone: '622 11 22 33', adresse: 'Madina, Conakry', notes: '' },
  { nom: 'Africa Tech Distribution', telephone: '655 44 55 66', adresse: 'Kaloum, Conakry', notes: '' },
  { nom: 'Accessoires Plus SARL', telephone: '664 77 88 99', adresse: 'Matam, Conakry', notes: '' },
];

function choisir(liste) { return liste[Math.floor(Math.random() * liste.length)]; }

function genererVentes(clientsAvecId, produits) {
  const employesRotation = [EMPLOYES.vendeur, EMPLOYES.vendeur, EMPLOYES.gerant, EMPLOYES.vendeur, EMPLOYES.proprietaire];
  const ventes = [];
  let compteur = 1;
  for (let jour = 29; jour >= 0; jour--) {
    const nbVentesDuJour = jour === 0 ? 2 : (Math.random() < 0.85 ? 1 + Math.floor(Math.random() * 3) : 0);
    for (let i = 0; i < nbVentesDuJour; i++) {
      const heure = 8 + Math.floor(Math.random() * 10);
      const minute = Math.floor(Math.random() * 60);
      const d = ilYA(jour, heure, minute);
      const nbLignes = 1 + (Math.random() < 0.3 ? 1 : 0);
      const lignes = [];
      for (let l = 0; l < nbLignes; l++) {
        const p = choisir(produits);
        const qte = 1 + (Math.random() < 0.2 ? 1 : 0);
        lignes.push({ produitId: p.__id, numero: p.numero, nom: p.nom, qte, prix_vente: p.prix_vente, cout: p.prix_achat });
      }
      const total = lignes.reduce((s, l) => s + l.qte * l.prix_vente, 0);
      const employe = choisir(employesRotation);
      const clientNomme = Math.random() < 0.4 ? choisir(clientsAvecId) : null;
      const roll = Math.random();
      let paiement, montantCredit, referenceMobileMoney;
      if (clientNomme && roll < 0.25) { paiement = 'Crédit client'; montantCredit = total; }
      else if (roll < 0.65) { paiement = 'Espèces'; }
      else { paiement = 'Mobile money'; referenceMobileMoney = 'MM' + Math.floor(100000 + Math.random() * 900000); }

      ventes.push({
        numeroRecu: 'REC-' + String(compteur++).padStart(6, '0'),
        date: dateISO(d),
        dateHeure: dateHeureISO(d),
        client: clientNomme ? clientNomme.nom : 'Client comptant',
        clientId: clientNomme ? clientNomme.__id : null,
        lignes,
        total,
        paiement,
        montantCredit,
        referenceMobileMoney,
        employeId: employe.id,
        employeNom: employe.nom,
      });
    }
  }
  return ventes;
}

function genererAchats(fournisseursAvecId, produits) {
  const achats = [];
  const joursAchats = [25, 20, 16, 11, 6, 2];
  joursAchats.forEach((jour, i) => {
    const d = ilYA(jour, 9, 30);
    const f = fournisseursAvecId[i % fournisseursAvecId.length];
    const p = choisir(produits);
    const qte = 3 + Math.floor(Math.random() * 8);
    const total = qte * p.prix_achat;
    const paye = i % 3 === 0 ? Math.round(total * 0.5) : total;
    achats.push({
      date: dateISO(d),
      dateHeure: dateHeureISO(d),
      fournisseur: f.nom,
      fournisseurId: f.__id,
      paiement: paye < total ? 'Dette fournisseur' : 'Espèces',
      montantPaye: paye,
      lignes: [{ produitId: p.__id, numero: p.numero, nom: p.nom, qte, prix_achat: p.prix_achat }],
      total,
      employeId: EMPLOYES.proprietaire.id,
      employeNom: EMPLOYES.proprietaire.nom,
    });
  });
  return achats;
}

function genererDepenses() {
  const items = [
    { libelle: 'Loyer boutique', montant: 500000, jour: 28 },
    { libelle: 'Électricité', montant: 120000, jour: 20 },
    { libelle: 'Transport marchandises', montant: 80000, jour: 14 },
    { libelle: 'Internet / Mobile Money frais', montant: 45000, jour: 9 },
    { libelle: "Entretien local", montant: 35000, jour: 3 },
  ];
  return items.map((it) => ({
    date: dateISO(ilYA(it.jour, 10, 0)),
    libelle: it.libelle,
    montant: it.montant,
    employeId: EMPLOYES.proprietaire.id,
    employeNom: EMPLOYES.proprietaire.nom,
  }));
}

async function main() {
  console.log('Connexion...');
  const token = await getAccessToken();
  const accessToken = typeof token === 'string' ? token : token.access_token;

  console.log('Nettoyage des données existantes...');
  for (const coll of COLLECTIONS_A_VIDER) {
    const n = await viderCollection(accessToken, coll);
    console.log(`  ${coll}: ${n} document(s) supprimé(s)`);
  }

  console.log('Recréation des produits...');
  const produitsAvecId = [];
  for (const p of PRODUITS) {
    const id = 'p_' + p.numero.toLowerCase().replace(/[^a-z0-9]/g, '');
    await requeteFirestore(accessToken, 'PATCH', `/boutiques/${BOUTIQUE_ID}/produits/${id}`, { fields: versChamps({ ...p, dateAjout: dateHeureISO(ilYA(90)) }) });
    produitsAvecId.push({ ...p, __id: id });
  }

  console.log('Recréation des clients...');
  const clientsAvecId = [];
  for (const c of CLIENTS) {
    const id = 'c_' + c.nom.toLowerCase().replace(/[^a-z0-9]/g, '');
    await requeteFirestore(accessToken, 'PATCH', `/boutiques/${BOUTIQUE_ID}/clients/${id}`, { fields: versChamps({ ...c, date_inscription: dateISO(ilYA(60)) }) });
    clientsAvecId.push({ ...c, __id: id });
  }

  console.log('Recréation des fournisseurs...');
  const fournisseursAvecId = [];
  for (const f of FOURNISSEURS) {
    const id = 'f_' + f.nom.toLowerCase().replace(/[^a-z0-9]/g, '');
    await requeteFirestore(accessToken, 'PATCH', `/boutiques/${BOUTIQUE_ID}/fournisseurs/${id}`, { fields: versChamps({ ...f, dateAjout: dateHeureISO(ilYA(90)) }) });
    fournisseursAvecId.push({ ...f, __id: id });
  }

  console.log('Génération des ventes (30 derniers jours)...');
  const ventes = genererVentes(clientsAvecId, produitsAvecId);
  await Promise.all(ventes.map((v) => creerDocument(accessToken, 'ventes', v)));
  console.log(`  ${ventes.length} vente(s) créée(s)`);

  console.log('Génération des achats...');
  const achats = genererAchats(fournisseursAvecId, produitsAvecId);
  await Promise.all(achats.map((a) => creerDocument(accessToken, 'achats', a)));
  console.log(`  ${achats.length} achat(s) créé(s)`);

  console.log('Génération des dépenses...');
  const depenses = genererDepenses();
  await Promise.all(depenses.map((d) => creerDocument(accessToken, 'depenses', d)));
  console.log(`  ${depenses.length} dépense(s) créée(s)`);

  // Un paiement partiel de crédit client, et un paiement partiel de dette fournisseur,
  // pour que les vues Clients/Fournisseurs ne soient pas juste "tout ou rien".
  const clientCredit = clientsAvecId.find((c) => c.nom === 'Ibrahima Sow');
  if (clientCredit) {
    await creerDocument(accessToken, 'paiements', {
      clientId: clientCredit.__id, clientNom: clientCredit.nom, montant: 50000,
      date: dateISO(ilYA(4)), dateHeure: dateHeureISO(ilYA(4, 15, 20)),
      employeId: EMPLOYES.proprietaire.id, employeNom: EMPLOYES.proprietaire.nom,
    });
  }
  const fournisseurDette = fournisseursAvecId.find((f) => f.nom === 'Import Phone Guinée');
  if (fournisseurDette) {
    await creerDocument(accessToken, 'paiementsFournisseurs', {
      fournisseurId: fournisseurDette.__id, fournisseurNom: fournisseurDette.nom, montant: 200000,
      date: dateISO(ilYA(5)), dateHeure: dateHeureISO(ilYA(5, 11, 0)),
      employeId: EMPLOYES.proprietaire.id, employeNom: EMPLOYES.proprietaire.nom,
    });
  }

  console.log('\nTerminé — Entreprise TEST réinitialisée avec des données fraîches.');
}

main().catch((e) => {
  console.error('Échec de la réinitialisation :', e.message);
  process.exit(1);
});
