// Prépare les données de test dans les émulateurs Auth + Firestore avant de lancer les specs
// Playwright : un compte Propriétaire de démonstration, sa boutique, et un produit en stock.
// S'exécute une seule fois pour toute la suite (voir `globalSetup` dans playwright.config.js).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PRODUIT_NOM } from './demo-data.js';

const PROJECT_ID = 'gestion-commerciale-gn'; // doit correspondre au projectId de firebase-config.js
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

// Crée le compte via l'API REST de l'émulateur Auth (pas besoin du SDK client côté Node).
// Idempotent : si le compte existe déjà (relance locale sans redémarrer l'émulateur), on
// récupère simplement son uid via une connexion au lieu d'échouer.
async function creerOuRecupererCompte(email, password) {
  const signUp = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const signUpData = await signUp.json();
  if (!signUpData.error) return signUpData.localId;

  if (signUpData.error.message === 'EMAIL_EXISTS') {
    const signIn = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const signInData = await signIn.json();
    if (signInData.error) throw new Error('global-setup: impossible de récupérer le compte démo — ' + JSON.stringify(signInData.error));
    return signInData.localId;
  }
  throw new Error('global-setup: échec de création du compte démo — ' + JSON.stringify(signUpData.error));
}

export default async function globalSetup() {
  const uid = await creerOuRecupererCompte(DEMO_EMAIL, DEMO_PASSWORD);

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const maintenant = new Date().toISOString();
    await setDoc(doc(db, 'boutiques', uid), {
      existe: true, plan: 'gratuit', nomBoutique: 'Boutique E2E',
      emailProprietaire: DEMO_EMAIL, dateCreation: maintenant
    });
    await setDoc(doc(db, 'boutiques', uid, 'utilisateurs', uid), {
      nom: 'Propriétaire E2E', email: DEMO_EMAIL, role: 'Propriétaire', dateAjout: maintenant
    });
    await setDoc(doc(db, 'membres', uid), { boutiqueId: uid, role: 'Propriétaire', email: DEMO_EMAIL });
    await setDoc(doc(db, 'boutiques', uid, 'produits', 'produit-e2e'), {
      nom: DEMO_PRODUIT_NOM, numero: 'E2E-001', type: 'fini',
      prix_vente: 10000, prix_achat: 5000, stock: 50
    });
  });

  await testEnv.cleanup();
}
