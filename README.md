# Gestion Commerciale

Application web de gestion commerciale multi-boutiques en français (ventes, stock, achats,
clients, fournisseurs, production, finance, rapports) pour les petits commerces en Guinée.

Déployée sur `esig-gn.com` / `gestion-commerciale-gn.web.app`.

## Stack technique

### Langage & runtime
- **JavaScript (ES2020+)** — code source natif, aucune transpilation (pas de TypeScript, pas de Babel)
- **Modules ES natifs** (`<script type="module">`) chargés directement par le navigateur — **aucun bundler** (pas de Webpack/Vite/esbuild)
- **Node.js** — utilisé uniquement côté outillage (tests, scripts d'admin), jamais en production/runtime de l'app elle-même

### Frontend
- **HTML/CSS/JS "vanilla"** — pas de framework UI (pas de React, Vue, Angular, Svelte)
- Rendu par génération de chaînes HTML (template strings) + réconciliation manuelle du DOM (`render()`/`renderContent()` dans `app-shell.js`)
- **CSS** pur avec variables CSS custom, media queries pour le responsive/mobile
- **Service Worker** (`sw.js`) — passe-plat réseau simple, sans mise en cache
- i18n maison (`i18n.js`) — dictionnaire `DICO` fr/en/pt, pas de librairie externe

### Backend / Infrastructure (Backend-as-a-Service)
- **Firebase** (Google) comme backend complet :
  - **Firebase Authentication** — gestion des comptes/connexions
  - **Cloud Firestore** — base de données NoSQL (temps réel via `onSnapshot`)
  - **Firebase Hosting** — hébergement statique
  - **Firestore Security Rules** — logique d'autorisation déclarative côté serveur (`firestore.rules`)
- **SDK Firebase v12.15.0** — importé directement depuis les URLs CDN `gstatic.com` (pas installé via npm pour l'app)

### Base de données
- **Cloud Firestore** — NoSQL orientée documents (pas de SQL/relationnel)
- Modèle multi-tenant : `boutiques/{boutiqueId}` + sous-collections (`produits`, `ventes`, `achats`, `clients`, `fournisseurs`, etc.)

### Outillage / Tests / Scripts (pas dans l'app en prod)
- **npm / package.json** — uniquement pour les tests et scripts d'admin
- **`node --test`** — testeur intégré à Node.js pour les tests unitaires (`npm test`)
- **`@firebase/rules-unit-testing`** + **émulateur Firestore** — tests des règles de sécurité
  (`npm run test:rules`), nécessite Java (JRE) installé
- **Playwright** + **émulateurs Hosting/Firestore/Auth** — tests end-to-end dans un vrai navigateur
  (`npm run test:e2e`)
- **Firebase CLI** (`firebase deploy`, `firebase emulators:start`) — déploiement et prévisualisation locale
- Script Node (`reset-demo.cjs`) utilisant l'API REST Firestore directement
- **Python + reportlab** — génération des flyers marketing PDF (dossier `marketing/`)

### API / intégrations externes
- **WhatsApp** (lien `wa.me`) — bouton support pour le plan Entreprise
- Aucune API de paiement intégrée (gestion des abonnements 100% manuelle par le super-admin)

Voir [CLAUDE.md](CLAUDE.md) pour les détails d'architecture, les commandes de développement et les
pièges connus.
