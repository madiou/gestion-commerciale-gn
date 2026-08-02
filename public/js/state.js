export const SUPER_ADMIN_EMAIL = 'mahdiou.diallo@gmail.com';

// Les 4 plans d'abonnement et leurs limites. Infinity = aucune limite.
// 'gratuit' est le seul plan sans date d'expiration manuelle : il expire tout seul
// après DUREE_ESSAI_GRATUIT_MOIS (voir essaiGratuitExpire() dans business-logic.js).
// Les 3 autres sont gérés manuellement par le super-admin (voir view-admin.js) avec une
// date d'expiration.
// - rolesAutorises : si présent, seuls ces rôles peuvent être choisis pour un compte ajouté.
// - maxParRole : si présent, plafond strict par rôle (indépendant du total 'utilisateurs').
export const ORDRE_PLANS = ['gratuit', 'standard', 'pro', 'entreprise'];
export const DUREE_ESSAI_GRATUIT_MOIS = 6;
export const LIMITES_PLAN = {
  // 1 Propriétaire + 1 compte supplémentaire, obligatoirement Vendeur (pas de Gérant en gratuit).
  gratuit:    { produits: 30,       ventesMois: 300,      utilisateurs: 2,       rolesAutorises: ['Vendeur'] },
  standard:   { produits: Infinity, ventesMois: Infinity, utilisateurs: 3 },
  // 1 Propriétaire + jusqu'à 1 Gérant + jusqu'à 2 Vendeurs (4 comptes au total, imposé par rôle).
  pro:        { produits: Infinity, ventesMois: Infinity, maxParRole: { 'Gérant': 1, 'Vendeur': 2 } },
  entreprise: { produits: Infinity, ventesMois: Infinity, utilisateurs: Infinity },
  // Valeur historique d'avant les 4 plans (boutiques déjà passées en payant avant ce changement).
  // Traitée comme illimité pour ne jamais faire régresser une boutique déjà payante.
  payant:     { produits: Infinity, ventesMois: Infinity, utilisateurs: Infinity },
};
export function limitesDuPlan(plan){
  return LIMITES_PLAN[plan] || LIMITES_PLAN.gratuit;
}
// Conservées pour compatibilité : équivalent aux limites du plan gratuit.
export const LIMITE_PRODUITS_GRATUIT = LIMITES_PLAN.gratuit.produits;
export const LIMITE_VENTES_MOIS_GRATUIT = LIMITES_PLAN.gratuit.ventesMois;

// Données de la boutique courante, synchronisées depuis Firestore (voir auth.js: subscribeAll).
// C'est un objet unique et partagé : les autres modules mutent ses propriétés directement
// (state.produits = [...]) plutôt que de réassigner la variable elle-même.
export const state = {
  produits:[], ventes:[], achats:[], depenses:[], clients:[], utilisateurs:[], paiements:[],
  fournisseurs:[], paiementsFournisseurs:[], productions:[], retours:[], journalAudit:[],
  plan:'gratuit', nomBoutique:'', adresseBoutique:'', telephoneBoutique:'', logoBase64:'',
  dateExpirationAbonnement: null, dateCreation: null
};
