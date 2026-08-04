// Suivi d'erreurs en production (Sentry). Le SDK est chargé en <script defer> depuis le CDN de
// Sentry dans index.html (avant ce module — les scripts <script defer> et <script type="module">
// s'exécutent dans le même ordre relatif que leur position dans le document), donc `window.Sentry`
// est déjà disponible ici. Jamais activé en local ni pendant les tests e2e (paramètre ?e2e=1, voir
// la bascule vers les émulateurs dans firebase-config.js) pour ne pas polluer les rapports avec du
// bruit de développement/test.
const ACTIF = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
  && new URLSearchParams(location.search).get('e2e') !== '1'
  && !!window.Sentry;

if(ACTIF){
  window.Sentry.init({
    dsn: 'https://ea616b83d612e910bc7b231bb72f4a34@o4511850085810176.ingest.de.sentry.io/4511850106519632',
    // La plupart des écritures Firestore de l'appli échouent en silence (setDoc(...).catch(e=>
    // console.error(...))) — sans ça, aucune de ces erreurs ne remonterait jamais.
    integrations: [window.Sentry.captureConsoleIntegration({ levels: ['error'] })],
    tracesSampleRate: 0, // suivi des erreurs uniquement, pas de suivi de performance pour l'instant
  });
}

// Associe l'e-mail du compte connecté aux erreurs rapportées, pour savoir quelle boutique est
// touchée sans avoir à le redemander au client. Appelé depuis auth.js à chaque changement de
// session (connexion, déconnexion → email à null).
export function definirUtilisateurSentry(email){
  if(ACTIF) window.Sentry.setUser(email ? { email } : null);
}
