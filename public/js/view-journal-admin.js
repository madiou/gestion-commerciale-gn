import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { t } from './i18n.js';
import { fmtDateHeureAvecFuseau, flash } from './helpers.js';

let toutesLesEntrees = null; // cache local, rechargée via le bouton Rafraîchir
let filtre = '';

function libelleAction(action){
  return {
    creation_boutique: t('journal_admin_action_creation_boutique'),
    changement_abonnement: t('journal_admin_action_changement_abonnement'),
    repasser_gratuit: t('journal_admin_action_repasser_gratuit'),
    tarifs_modifies: t('journal_admin_action_tarifs_modifies'),
  }[action] || action;
}

export function viewJournalAdmin(){
  return `
  <div class="msg ok" id="msg-journal-admin"></div>
  <div class="toolbar-stock">
    <input type="text" id="ja-recherche" class="search-box" placeholder="${t('rechercher_connexion')}" value="${filtre}">
    <button class="btn btn-secondaire" id="ja-refresh">${t('rafraichir')}</button>
  </div>
  <div class="stock-panel"><table id="ja-table"></table></div>`;
}

function ligneEntree(e){
  return `<tr>
    <td>${fmtDateHeureAvecFuseau(e.dateHeure)}</td>
    <td>${e.superAdminEmail||'—'}</td>
    <td>${libelleAction(e.action)}</td>
    <td>${e.nomBoutiqueCible||'—'}</td>
    <td>${e.details||'—'}</td>
  </tr>`;
}

function appliquerFiltre(liste){
  if(!filtre.trim()) return liste;
  const q = filtre.trim().toLowerCase();
  return liste.filter(e =>
    (e.superAdminEmail||'').toLowerCase().includes(q) ||
    (e.nomBoutiqueCible||'').toLowerCase().includes(q) ||
    libelleAction(e.action).toLowerCase().includes(q)
  );
}

function renderTable(){
  const tbl = document.getElementById('ja-table');
  if(!tbl) return;
  const lignes = appliquerFiltre(toutesLesEntrees||[]);
  tbl.innerHTML = `<tr>
      <th>${t('date_heure')}</th><th>${t('effectue_par')}</th><th>${t('action')}</th><th>${t('boutique_concernee')}</th><th>${t('details')}</th>
    </tr>` + (lignes.length ? lignes.map(ligneEntree).join('') : `<tr><td colspan="5" style="color:var(--texte-att);">${t('aucune_entree_journal_admin')}</td></tr>`);
}

async function chargerJournal(){
  const tbl = document.getElementById('ja-table');
  if(tbl) tbl.innerHTML = `<tr><th colspan="5" style="text-align:center;color:var(--texte-att);">${t('chargement')}</th></tr>`;
  try{
    const snap = await getDocs(query(collection(db,'journalAdmin'), orderBy('dateHeure','desc'), limit(200)));
    toutesLesEntrees = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){
    console.error('Erreur chargement journal super-admin', e);
    flash(document.getElementById('msg-journal-admin'), t('erreur_generique'), 'err');
    toutesLesEntrees = toutesLesEntrees || [];
  }
  renderTable();
}

export function wireJournalAdmin(){
  chargerJournal();
  document.getElementById('ja-refresh').addEventListener('click', ()=>{ toutesLesEntrees = null; chargerJournal(); });
  document.getElementById('ja-recherche').addEventListener('input', (ev)=>{ filtre = ev.target.value; renderTable(); });
}
