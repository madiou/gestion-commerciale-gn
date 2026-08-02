import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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
