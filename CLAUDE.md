# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) quand il travaille sur le code de ce dépôt.

## Ce que c'est

"Gestion Commerciale" — une application web de gestion commerciale multi-boutiques en français
(ventes, stock, achats, clients, fournisseurs, production, finance, rapports) pour les petits
commerces en Guinée. Basée sur Firebase (Auth + Firestore), déployée sur Firebase Hosting à
`esig-gn.com` / `gestion-commerciale-gn.web.app`. Aucun outil de build : le navigateur charge des
modules ES natifs directement, et le SDK Firebase lui-même est importé directement depuis des URLs
CDN `https://www.gstatic.com/firebasejs/12.15.0/...` dans les fichiers source — pas de bundler, pas
d'étape d'installation npm pour l'appli elle-même. `npm`/`package.json` dans ce dépôt n'existe que
pour la suite de tests et les scripts d'administration.

## Commandes

- Lancer les tests unitaires (business-logic/i18n/helpers) : `npm test` (le testeur intégré de
  Node, `node --test`, zéro dépendance externe)
- Lancer un seul fichier de test : `node --test tests/business-logic.test.js`
- Lancer les tests des règles Firestore (`firestore.rules`) : `npm run test:rules` — démarre
  automatiquement l'émulateur Firestore (`firebase emulators:exec`) et y exécute
  `tests/firestore-rules.test.js` via `@firebase/rules-unit-testing`. Nécessite Java (JRE) installé
  et sur le PATH — c'est le seul outil de ce dépôt qui en a besoin. Ces tests couvrent chaque bloc
  de règle (`config`, `connexions`, `journalAdmin`, `membres`, `boutiques` racine +
  `champsAbonnement`, `utilisateurs`, `depenses`, `clients`, `fournisseurs`, `journalAudit`) et,
  surtout, la règle générique catch-all et sa liste d'exclusion — voir le piège documenté plus bas.
  À relancer systématiquement après toute modification de `firestore.rules`, avant de déployer.
- Lancer tout (unitaires + règles) : `npm run test:all`
- Prévisualisation locale : `firebase emulators:start --only hosting` (sert `public/` sur
  `localhost:5000` ; config aussi dans `.claude/launch.json` pour l'outil de serveur de dev)
- Déployer uniquement l'hébergement : `firebase deploy --only hosting`
- Déployer hébergement + règles Firestore ensemble (dès que `firestore.rules` a changé) :
  `firebase deploy --only firestore:rules,hosting`
- Réinitialiser la boutique de démo "Entreprise TEST" avec des données fraîches avant une démo en
  direct : `npm run reset-demo` (vide et recharge les collections métier de cette boutique via
  l'API REST Firestore + le jeton de rafraîchissement local de `firebase login` — voir le
  commentaire en tête du script pour le détail de l'authentification)
- Vérifier la syntaxe d'un seul fichier sans l'exécuter : `node --check public/js/<fichier>.js`

Il n'y a ni étape de build ni de lint — les modifications dans `public/` prennent effet directement
au prochain chargement de page / déploiement.

## Architecture

### Pas de bundler — le déploiement est une simple copie de fichiers

`public/` est déployé sur Firebase Hosting tel quel (`hosting.public` dans `firebase.json`). Chaque
fichier JS est chargé comme un graphe natif de `<script type="module">` démarrant depuis
`public/js/main.js`, qui fait `import './auth.js'` (cet import à effet de bord suffit à charger
tout le graphe de modules et à enregistrer `onAuthStateChanged`) et enregistre en plus
`public/sw.js`. Le service worker est volontairement un simple passe-plat réseau sans logique de
cache — une version précédente avec mise en cache provoquait des blocages sur Safari/iOS, donc ne
pas réintroduire de cache-au-fetch là-dedans sans tester sur un vrai Safari iOS d'abord. Firebase
Hosting est configuré avec `Cache-Control: no-cache, max-age=0, must-revalidate` sur **tous** les
fichiers (`firebase.json`) — ajouté volontairement après un incident réel où le cache par défaut
d'une heure rendait les correctifs déployés invisibles pour les utilisateurs ; ne pas
retirer/assouplir sans raison claire.

### Graphe de modules et le motif de dépendance circulaire

`app-shell.js` est le point central : il importe depuis presque tous les fichiers `view-*.js` et
pilote `render()`/`renderContent()`. Plusieurs fichiers `view-*.js` importent en retour depuis
`app-shell.js` (par ex. `renderContent`, `money`, `enregistrerAudit`). Cette circularité est
volontaire et sans danger dans ce code base car tout est déclaration de fonction (hissée) au niveau
racine du module, pas des valeurs lues au moment de l'import — si tu introduis un `const`/`let` au
niveau racine lu immédiatement par un autre module du cycle, tu peux casser ça. `i18n.js` et
`business-logic.js` sont volontairement gardés sans dépendance (aucun import depuis
`app-shell.js`/`auth.js`) précisément pour rester testables unitairement sous Node sans mocker
Firebase ; le `setLangue(lang, onChange)` de `i18n.js` prend le callback de re-rendu en paramètre
au lieu d'importer `render` directement, pour la même raison.

### État et authentification

- `state.js` exporte un unique objet `state` mutable et partagé (`state.produits = [...]`, jamais
  réassigné) contenant toutes les données synchronisées depuis Firestore pour la boutique
  courante, plus `LIMITES_PLAN` (les 4 paliers d'abonnement et leurs limites chiffrées) et
  `SUPER_ADMIN_EMAIL`.
- `auth.js` possède l'identité de session (`currentUser`, `currentBoutiqueId`, `currentRole`,
  `currentView`) et `subscribeAll(boutiqueId)`, qui ouvre un écouteur `onSnapshot` par
  sous-collection Firestore et appelle `render()` à chaque changement — toute l'interface se
  re-rend de façon réactive à chaque changement de donnée distant, pas seulement lors d'une action
  locale de l'utilisateur. À cause de ça, ne pas compter sur un état du DOM qui survit entre deux
  rendus sauf s'il est réappliqué par la fonction `wire*()` à chaque fois, et éviter d'attacher des
  écouteurs à des nœuds persistants comme `document` dans du code qui s'exécute à chaque rendu
  (les attacher une seule fois au chargement du module / au niveau racine à la place, sinon ils
  s'empilent — voir le gestionnaire Ctrl+K dans `app-shell.js` pour le modèle à suivre).
- Les rôles sont `'Propriétaire' | 'Gérant' | 'Vendeur'`, vérifiés au cas par cas via des
  comparaisons de `currentRole` à la fois dans l'interface (quels boutons/éléments de nav
  s'affichent) et dans `firestore.rules` (quelles écritures sont réellement permises) — une
  restriction d'interface n'est pas une barrière de sécurité en soi ; c'est la règle Firestore
  correspondante qui l'impose réellement.

### Modèle de données Firestore

Multi-boutiques : chaque boutique est `boutiques/{boutiqueId}` avec des sous-collections
(`produits`, `ventes`, `achats`, `depenses`, `clients`, `utilisateurs`, `paiements`,
`fournisseurs`, `paiementsFournisseurs`, `productions`, `retours`, `journalAudit`).
`membres/{uid}` est un pointeur par compte vers `{ boutiqueId, role }`, consulté à chaque
connexion pour aiguiller l'utilisateur. Un document racine séparé `boutiques/{id}` porte les
paramètres de la boutique + les champs d'abonnement (`plan`, `dateExpirationAbonnement`,
`historiquePaiements`).

Piège à connaître dans `firestore.rules` avant d'y toucher : il y a une règle générique
`match /{collectionPath}/{docId}` pour les sous-collections sans règle dédiée. Firestore évalue
**toutes** les règles `match` qui correspondent à un chemin et autorise la requête si **une seule**
d'entre elles l'autorise (ce n'est pas "la plus précise gagne") — donc la règle générique exclut
explicitement `['clients','depenses','utilisateurs','journalAudit']` par leur nom pour éviter
d'annuler silencieusement leurs règles dédiées plus strictes. Garder cette liste d'exclusion à jour
si une nouvelle sous-collection avec sa propre règle restreinte est ajoutée.

`journalAudit` est en ajout seul par règle (`allow update, delete: if false`) et actuellement
réservé au Propriétaire en lecture ; les entrées sont écrites côté client via
`enregistrerAudit()` dans `app-shell.js` pour les suppressions, créations, remboursements et
modifications manuelles de stock — ça ne couvre pas toutes les mutations de l'appli, seulement
celles explicitement instrumentées.

### Abonnements/plans

Quatre paliers (`gratuit`, `standard`, `pro`, `entreprise`) définis dans `LIMITES_PLAN` de
`state.js` (limites chiffrées uniquement — aucune fonctionnalité verrouillée par plan). Une valeur
historique `'payant'` peut encore exister sur des boutiques abonnées avant l'introduction des 4
paliers ; `LIMITES_PLAN.payant` et les fonctions `libellePlan()`/`PLANS_PAYANTS` dans
`app-shell.js`/`view-admin.js` la traitent comme équivalente à illimité pour qu'une boutique déjà
payante ne régresse pas. Le panneau super-admin (`view-admin.js`, réservé à `SUPER_ADMIN_EMAIL`)
est le seul moyen de changer le plan/l'expiration d'une boutique — il n'y a pas de parcours de
paiement intégré, c'est géré manuellement.

### i18n

`i18n.js` exporte un objet `DICO` avec des clés `fr`/`en` et une fonction de lookup `t(key)` ;
`langue` est persistée dans `localStorage`. Toutes les chaînes de l'interface passent par `t()` —
pas de fichier de chaînes par composant. En ajoutant une chaîne, ajouter les entrées `fr` et `en`
dans la même modification, sinon l'interface en anglais affichera la clé brute.

### Tests

Seuls les modules sans dépendance (`helpers.js`, `i18n.js`, `business-logic.js`) sont testables
unitairement sous Node tels quels — tout le reste importe transitivement le SDK Firebase depuis une
URL CDN, que le chargeur de modules de Node ne peut pas résoudre. `tests/setup.js` fournit un
polyfill de `localStorage` pour `i18n.js`. En ajoutant des fonctions de logique métier pure, les
mettre dans `business-logic.js` (pas `app-shell.js`) précisément pour qu'elles restent testables ;
les autres fichiers de vue les ré-exportent depuis `business-logic.js` plutôt que de dupliquer la
logique.

`tests/firestore-rules.test.js` teste `firestore.rules` séparément, contre un véritable émulateur
Firestore (`npm run test:rules`, voir Commandes ci-dessus) plutôt que sous Node directement, car les
règles de sécurité ne peuvent être évaluées que par le moteur Firestore lui-même. Chaque contexte
utilisateur est simulé via `testEnv.authenticatedContext(uid, { email })` /
`unauthenticatedContext()`, et les données de préparation (seed) contournent les règles via
`testEnv.withSecurityRulesDisabled()`. En modifiant `firestore.rules`, mettre à jour ce fichier de
tests dans la même modification — c'est la seule protection automatisée contre une régression du
piège du catch-all (voir Modèle de données Firestore ci-dessus) ou contre l'ouverture accidentelle
d'un accès qui ne devrait pas exister (ex. le super-admin n'a délibérément accès à aucune
sous-collection métier d'une boutique, seulement au document racine et à `utilisateurs/` — un test
le vérifie explicitement).
