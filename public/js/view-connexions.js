import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { t } from './i18n.js';
import { fmtDateHeureAvecFuseau, flash } from './helpers.js';
import { calculerDureeSecondes, formatDureeSecondes } from './business-logic.js';

let toutesLesConnexions = null; // cache local, rechargée via le bouton Rafraîchir
let boutiquesParId = null; // { [boutiqueId]: nomBoutique }
let filtre = '';

// Session considérée "en cours" si un ping est arrivé il y a moins de 3 minutes
// (l'intervalle de battement de coeur est de 90s, voir demarrerJournalConnexion dans auth.js).
const SEUIL_EN_COURS_MS = 3 * 60 * 1000;

function libelleAppareil(userAgent){
  if(!userAgent) return '—';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  let navigateur = 'Navigateur';
  if(/Edg\//i.test(userAgent)) navigateur = 'Edge';
  else if(/Chrome\//i.test(userAgent)) navigateur = 'Chrome';
  else if(/Firefox\//i.test(userAgent)) navigateur = 'Firefox';
  else if(/Safari\//i.test(userAgent)) navigateur = 'Safari';
  return `${mobile ? '📱' : '💻'} ${navigateur}`;
}

function statutEtDuree(c){
  const maintenant = new Date();
  if(c.dateDeconnexion){
    return { statut: t('connexion_fermee'), duree: formatDureeSecondes(c.dureeSecondes) };
  }
  const dernierePing = c.dernierePing ? new Date(c.dernierePing) : null;
  const enCours = dernierePing && (maintenant - dernierePing) < SEUIL_EN_COURS_MS;
  const dureeApprox = calculerDureeSecondes(c.dateConnexion, c.dernierePing || c.dateConnexion);
  return {
    statut: enCours ? t('connexion_en_cours') : t('connexion_non_fermee'),
    duree: formatDureeSecondes(dureeApprox)
  };
}

export function viewConnexions(){
  return `
  <div class="msg ok" id="msg-connexions"></div>
  <div class="toolbar-stock">
    <input type="text" id="cx-recherche" class="search-box" placeholder="${t('rechercher_connexion')}" value="${filtre}">
    <button class="btn btn-secondaire" id="cx-refresh">${t('rafraichir')}</button>
  </div>
  <div class="stock-panel"><table id="cx-table"></table></div>`;
}

function ligneConnexion(c){
  const { statut, duree } = statutEtDuree(c);
  const nomBoutique = c.boutiqueId ? (boutiquesParId[c.boutiqueId] || c.boutiqueId) : t('super_admin_sans_boutique');
  return `<tr>
    <td>${c.email||'—'}</td>
    <td>${c.role||'—'}</td>
    <td>${nomBoutique}</td>
    <td>${fmtDateHeureAvecFuseau(c.dateConnexion)}</td>
    <td>${c.dateDeconnexion ? fmtDateHeureAvecFuseau(c.dateDeconnexion) : '—'}</td>
    <td>${duree}</td>
    <td>${statut}</td>
    <td>${libelleAppareil(c.appareil)}</td>
  </tr>`;
}

function appliquerFiltre(liste){
  if(!filtre.trim()) return liste;
  const q = filtre.trim().toLowerCase();
  return liste.filter(c =>
    (c.email||'').toLowerCase().includes(q) ||
    (boutiquesParId[c.boutiqueId]||'').toLowerCase().includes(q) ||
    (c.role||'').toLowerCase().includes(q)
  );
}

function renderTable(){
  const tbl = document.getElementById('cx-table');
  if(!tbl) return;
  const lignes = appliquerFiltre(toutesLesConnexions||[]);
  tbl.innerHTML = `<tr>
      <th>${t('compte')}</th><th>${t('role')}</th><th>${t('entreprise')}</th>
      <th>${t('connexion_le')}</th><th>${t('deconnexion_le')}</th><th>${t('duree')}</th><th>${t('statut')}</th><th>${t('appareil')}</th>
    </tr>` + (lignes.length ? lignes.map(ligneConnexion).join('') : `<tr><td colspan="8" style="color:var(--texte-att);">${t('aucune_connexion')}</td></tr>`);
}

async function chargerConnexions(){
  const tbl = document.getElementById('cx-table');
  if(tbl) tbl.innerHTML = `<tr><th colspan="8" style="text-align:center;color:var(--texte-att);">${t('chargement')}</th></tr>`;
  try{
    if(!boutiquesParId){
      const snapBoutiques = await getDocs(collection(db,'boutiques'));
      boutiquesParId = {};
      snapBoutiques.docs.forEach(d=>{ boutiquesParId[d.id] = d.data().nomBoutique || d.id; });
    }
    const snap = await getDocs(query(collection(db,'connexions'), orderBy('dateConnexion','desc'), limit(200)));
    toutesLesConnexions = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){
    console.error('Erreur chargement journal des connexions', e);
    flash(document.getElementById('msg-connexions'), t('erreur_generique'), 'err');
    toutesLesConnexions = toutesLesConnexions || [];
  }
  renderTable();
}

export function wireConnexions(){
  chargerConnexions();
  document.getElementById('cx-refresh').addEventListener('click', ()=>{ boutiquesParId = null; chargerConnexions(); });
  document.getElementById('cx-recherche').addEventListener('input', (ev)=>{ filtre = ev.target.value; renderTable(); });
}
