// Point d'entrée : importer auth.js suffit à charger tout le graphe de modules
// et à enregistrer l'écouteur onAuthStateChanged qui démarre l'application.
import './auth.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
