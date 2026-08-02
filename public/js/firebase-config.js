import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentSingleTabManager } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// TODO: Remplace par ta propre configuration si tu utilises ce fichier ailleurs
export const firebaseConfig = {
  apiKey: "AIzaSyAbtfcjgUKDRSShv2hzQpZi25ZaQ0Es4tY",
  authDomain: "gestion-commerciale-gn.firebaseapp.com",
  projectId: "gestion-commerciale-gn",
  storageBucket: "gestion-commerciale-gn.firebasestorage.app",
  messagingSenderId: "965111096354",
  appId: "1:965111096354:web:e13983a8aa5fb968bcd67b"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

// Bascule vers les émulateurs Auth/Firestore uniquement quand la page est chargée avec
// `?e2e=1` (voir tests/e2e/playwright.config.js) — jamais en fonction du seul hostname, pour ne
// pas casser la prévisualisation locale documentée dans CLAUDE.md (`firebase emulators:start
// --only hosting`), qui doit continuer à pointer vers les vraies données de production.
if(new URLSearchParams(location.search).get('e2e') === '1'){
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
