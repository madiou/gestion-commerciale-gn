// Fonctions de calcul pures (aucune dépendance au DOM ni à Firebase) afin de
// pouvoir être testées isolément. Les autres modules ré-exportent depuis ici
// pour ne pas casser leurs propres importateurs. Signatures inchangées par
// rapport au code d'origine : `state` reste le même objet partagé mutable
// (les tests peuvent le manipuler directement, voir tests/).
import { t } from './i18n.js';
import { state, limitesDuPlan, DUREE_ESSAI_GRATUIT_MOIS } from './state.js';

export function statutStock(p){ if(p.stock <= (p.seuil||15)*0.5) return 'bas'; if(p.stock <= (p.seuil||15)) return 'moy'; return 'ok'; }
export function tagStatut(s){ if(s==='bas') return '<span class="tag bas">Bas</span>'; if(s==='moy') return '<span class="tag moy">Moyen</span>'; return '<span class="tag ok">OK</span>'; }

export function creditClient(client){
  const ventesConcernees = state.ventes.filter(v=>v.paiement==='Crédit client' && (v.clientId===client.id || v.client===client.nom));
  const du = ventesConcernees.reduce((s,v)=>{
    const credit = v.montantCredit !== undefined ? v.montantCredit : v.total;
    return s + credit;
  }, 0);
  const paye = state.paiements.filter(p=>p.clientId===client.id).reduce((s,p)=>s+p.montant,0);
  const retourneSurCredit = state.retours.filter(r=>r.clientId===client.id || r.client===client.nom).reduce((s,r)=>s+(r.montantAnnuleCredit||0),0);
  return Math.max(0, du - paye - retourneSurCredit);
}

// Solde signé avec un fournisseur : positif = la boutique doit encore au fournisseur (dette),
// négatif = la boutique a versé plus qu'elle ne doit (avance/accompte disponible pour un futur
// achat), zéro = à jour. Un paiement au fournisseur (paiementsFournisseurs) qui dépasse la dette
// des achats en cours fait donc naturellement passer ce solde en négatif plutôt que de « perdre »
// le trop-versé — voir detteFournisseur()/avanceFournisseur() ci-dessous pour les vues positives.
export function soldeFournisseur(f){
  const achatsConcernes = state.achats.filter(a=>a.paiement==='Dette fournisseur' && (a.fournisseurId===f.id || a.fournisseur===f.nom));
  const du = achatsConcernes.reduce((s,a)=>{
    const paye = a.montantPaye !== undefined ? a.montantPaye : 0;
    return s + Math.max(0, a.total - paye);
  }, 0);
  const paye = state.paiementsFournisseurs.filter(p=>p.fournisseurId===f.id).reduce((s,p)=>s+p.montant,0);
  return du - paye;
}
// Montant que la boutique doit encore au fournisseur (0 si à jour ou en avance).
export function detteFournisseur(f){ return Math.max(0, soldeFournisseur(f)); }
// Montant déjà versé au fournisseur en trop / par anticipation (accompte avant réception de
// marchandise), disponible pour couvrir un futur achat. 0 si aucune avance.
export function avanceFournisseur(f){ return Math.max(0, -soldeFournisseur(f)); }

export function resumeArticles(lignes){
  if(!lignes || lignes.length===0) return '';
  const noms = lignes.map(l=>l.nom);
  if(noms.length<=2) return noms.join(', ');
  return `${noms.slice(0,2).join(', ')} +${noms.length-2} ${t('articles')}`;
}

// Date de fin de l'essai gratuit (6 mois après la création de la boutique), au format YYYY-MM-DD.
// Renvoie null si aucune date de création n'est connue (boutiques créées avant l'introduction
// de cette règle : non bloquées rétroactivement, voir essaiGratuitExpire()).
export function dateFinEssaiGratuit(dateCreationISO){
  if(!dateCreationISO) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateCreationISO);
  if(!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1 + DUREE_ESSAI_GRATUIT_MOIS, +m[3]));
  return d.toISOString().slice(0,10);
}
export function essaiGratuitExpire(dateCreationISO, maintenant = new Date()){
  const fin = dateFinEssaiGratuit(dateCreationISO);
  if(!fin) return false;
  return maintenant > new Date(fin+'T23:59:59');
}

export function compterUtilisateursParRole(utilisateurs){
  return (utilisateurs||[]).reduce((acc,u)=>{ acc[u.role] = (acc[u.role]||0) + 1; return acc; }, {});
}

// Rôles encore assignables à un compte, compte tenu des limites du plan.
// `idExclu` : lors d'un changement de rôle d'un utilisateur existant, exclut ce compte du
// décompte pour qu'il puisse conserver son propre rôle actuel sans se bloquer lui-même.
export function rolesDisponibles(plan, utilisateursActuels, idExclu){
  const consideres = idExclu ? (utilisateursActuels||[]).filter(u=>u.id!==idExclu) : (utilisateursActuels||[]);
  const limites = limitesDuPlan(plan);
  if(limites.rolesAutorises){
    if(isFinite(limites.utilisateurs) && consideres.length >= limites.utilisateurs) return [];
    return limites.rolesAutorises;
  }
  if(limites.maxParRole){
    const compte = compterUtilisateursParRole(consideres);
    return Object.keys(limites.maxParRole).filter(role => (compte[role]||0) < limites.maxParRole[role]);
  }
  if(isFinite(limites.utilisateurs) && consideres.length >= limites.utilisateurs) return [];
  return ['Gérant', 'Vendeur'];
}

// Durée en secondes entre deux dates ISO (jamais négative : une horloge cliente en retard
// ou un ping arrivé avant la date de connexion ne doit pas produire une durée absurde).
export function calculerDureeSecondes(debutISO, finISO){
  if(!debutISO || !finISO) return null;
  const debut = new Date(debutISO), fin = new Date(finISO);
  if(isNaN(debut.getTime()) || isNaN(fin.getTime())) return null;
  return Math.max(0, Math.round((fin - debut) / 1000));
}
// Formate une durée en secondes en texte lisible ("2h 14min", "45min", "moins d'une minute").
export function formatDureeSecondes(sec){
  if(sec===null || sec===undefined || isNaN(sec)) return '—';
  if(sec < 60) return t('duree_moins_1_min');
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if(h === 0) return `${min} min`;
  return `${h} h ${min} min`;
}

// Différence en jours calendaires (UTC, indépendante de l'heure du jour) entre maintenant et une
// date YYYY-MM-DD. Négatif si la date est déjà passée. Utilisé pour les alertes de renouvellement
// / fin d'essai du super-admin.
export function joursRestants(dateISO, maintenant = new Date()){
  if(!dateISO) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateISO);
  if(!m) return null;
  const cible = Date.UTC(+m[1], +m[2]-1, +m[3]);
  const debutAujourdhui = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  return Math.round((cible - debutAujourdhui) / (1000*60*60*24));
}

// Analyseur CSV minimal (pas de dépendance externe) : gère les champs entre guillemets pouvant
// contenir des virgules ou des guillemets échappés (""), et les fins de ligne \n/\r\n. Renvoie les
// lignes de données sous forme d'objets indexés par en-tête (en minuscules, espaces conservés
// tels quels côté valeurs). La première ligne non vide est toujours traitée comme l'en-tête.
export function parseCSV(texte){
  if(!texte) return { entetes: [], lignes: [] };
  const propre = texte.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Délimiteur détecté sur l'en-tête (virgule ou point-virgule) : Excel en paramètres régionaux
  // francophones exporte/attend du CSV séparé par point-virgule (la virgule étant déjà le
  // séparateur décimal) — sans cette détection, un fichier ouvert directement depuis l'explorateur
  // s'affiche en une seule colonne avec les virgules encore visibles dans le texte.
  const finEntete = propre.indexOf('\n');
  const ligneEntete = finEntete === -1 ? propre : propre.slice(0, finEntete);
  const nbPointVirgules = (ligneEntete.match(/;/g)||[]).length;
  const nbVirgules = (ligneEntete.match(/,/g)||[]).length;
  const delimiteur = nbPointVirgules > nbVirgules ? ';' : ',';
  const enregistrements = [];
  let ligneCourante = [], champ = '', dansGuillemets = false;
  for(let i=0; i<propre.length; i++){
    const c = propre[i];
    if(dansGuillemets){
      if(c === '"'){
        if(propre[i+1] === '"'){ champ += '"'; i++; }
        else dansGuillemets = false;
      } else champ += c;
    } else if(c === '"'){
      dansGuillemets = true;
    } else if(c === delimiteur){
      ligneCourante.push(champ); champ = '';
    } else if(c === '\n'){
      ligneCourante.push(champ); enregistrements.push(ligneCourante); ligneCourante = []; champ = '';
    } else {
      champ += c;
    }
  }
  if(champ.length || ligneCourante.length){ ligneCourante.push(champ); enregistrements.push(ligneCourante); }
  const nonVides = enregistrements.filter(l => l.some(v => v.trim() !== ''));
  if(nonVides.length === 0) return { entetes: [], lignes: [] };
  const entetes = nonVides[0].map(h => h.trim().toLowerCase());
  const lignes = nonVides.slice(1).map(valeurs => {
    const obj = {};
    entetes.forEach((e,i) => { obj[e] = (valeurs[i] !== undefined ? valeurs[i] : '').trim(); });
    return obj;
  });
  return { entetes, lignes };
}

const versNombre = (v, defaut) => {
  if(v === undefined || v === null || String(v).trim() === '') return defaut;
  const n = parseFloat(String(v).replace(/\s/g,'').replace(',', '.'));
  return isNaN(n) ? defaut : n;
};

// Séparées par point-virgule : c'est le délimiteur qu'Excel en paramètres régionaux francophones
// utilise pour ouvrir/enregistrer un CSV directement (voir la note dans parseCSV ci-dessus).
export const MODELE_CSV_PRODUITS = 'numero;nom;categorie;type;stock;prix_achat;prix_vente;seuil\nP-001;Exemple T-shirt;Vêtements;produit_fini;20;50000;80000;5\n';
export const MODELE_CSV_CLIENTS = 'nom;telephone;adresse;notes;date_inscription\nExemple Client;622000000;Kaloum Conakry;Client fidèle;2026-01-15\n';

// Valide et convertit les lignes CSV brutes (issues de parseCSV) en objets produits prêts à
// enregistrer. Colonnes attendues : numero, nom, categorie, type (produit_fini|matiere_premiere),
// stock, prix_achat, prix_vente, seuil. `nom` est requis ; `prix_vente` n'est requis que pour un
// produit fini (une matière première n'a pas de prix de vente dans l'appli).
export function validerLignesProduits(lignes){
  const valides = [], erreurs = [];
  (lignes||[]).forEach((l, i) => {
    const numeroLigne = i + 2;
    const nom = (l['nom']||'').trim();
    if(!nom){ erreurs.push({ ligne: numeroLigne, raison: 'nom manquant' }); return; }
    const typeBrut = (l['type']||'produit_fini').trim().toLowerCase();
    const estMatierePremiere = ['matiere_premiere','matière première','mp'].includes(typeBrut);
    let prixVente = 0;
    if(!estMatierePremiere){
      prixVente = versNombre(l['prix_vente'], null);
      if(prixVente===null || prixVente<=0){ erreurs.push({ ligne: numeroLigne, raison: `prix_vente invalide pour "${nom}"` }); return; }
    }
    valides.push({
      numero: (l['numero']||'').trim(),
      nom,
      categorie: (l['categorie']||'').trim(),
      type: estMatierePremiere ? 'matiere_premiere' : 'fini',
      stock: Math.max(0, Math.round(versNombre(l['stock'], 0))),
      prix_achat: Math.max(0, Math.round(versNombre(l['prix_achat'], 0))),
      prix_vente: Math.max(0, Math.round(prixVente)),
      seuil: Math.max(0, Math.round(versNombre(l['seuil'], 15))),
    });
  });
  return { valides, erreurs };
}

// Idem pour les clients. Colonnes attendues : nom, telephone, adresse, notes, date_inscription.
// Seul `nom` est requis ; date_inscription est renvoyée telle quelle (null si absente), l'appelant
// applique la date du jour par défaut au moment de l'enregistrement.
export function validerLignesClients(lignes){
  const valides = [], erreurs = [];
  (lignes||[]).forEach((l, i) => {
    const numeroLigne = i + 2;
    const nom = (l['nom']||'').trim();
    if(!nom){ erreurs.push({ ligne: numeroLigne, raison: 'nom manquant' }); return; }
    valides.push({
      nom,
      telephone: (l['telephone']||'').trim(),
      adresse: (l['adresse']||'').trim(),
      notes: (l['notes']||'').trim(),
      date_inscription: (l['date_inscription']||'').trim() || null,
    });
  });
  return { valides, erreurs };
}

export function optionsClients(valeurCourante){
  const noms = state.clients.map(c=>c.nom).sort((a,b)=>a.localeCompare(b));
  const toutes = ['tous', 'Client comptant', ...noms];
  return toutes.map(v=>`<option value="${v}" ${valeurCourante===v?'selected':''}>${v==='tous'?t('tous_les_clients'):(v==='Client comptant'?t('client_comptant'):v)}</option>`).join('');
}
