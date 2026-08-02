import { state } from './state.js';
import { t } from './i18n.js';
import { money, fmtDate, fmtDateHeure } from './helpers.js';
import { debutPeriode } from './app-shell.js';
import { renderContent } from './app-shell.js';
import { resumeArticles, optionsClients } from './business-logic.js';
export { resumeArticles } from './business-logic.js';

let journalPeriode = 'jour';
let journalType = 'tous';
let journalClient = 'tous';
function construireJournal(){
  const lignes = [];
  state.ventes.forEach(v=>{
    const credit = v.montantCredit!==undefined ? v.montantCredit : (v.paiement==='Crédit client'?v.total:0);
    const noteCredit = (v.paiement==='Crédit client' && credit>0 && credit<v.total) ? ` — ${money(v.total-credit)} ${t('encaisse_virgule')}${money(credit)} ${t('a_credit')}` : '';
    const noteReference = v.referenceMobileMoney ? ` — ${t('reference_mobile_money')}: ${v.referenceMobileMoney}` : '';
    lignes.push({ dateHeure:v.dateHeure||v.date, date:v.date, type:'vente', libelle:t('type_vente'), client:v.client, detail:resumeArticles(v.lignes)+noteCredit+noteReference, montant:v.total, sens:1, employeNom:v.employeNom });
  });
  state.achats.forEach(a=>{
    const paye = a.montantPaye!==undefined ? a.montantPaye : (a.paiement==='Espèces'?a.total:0);
    const noteDette = (a.paiement==='Dette fournisseur' && paye>0 && paye<a.total) ? ` — ${money(paye)} ${t('paye_virgule')}${money(a.total-paye)} ${t('en_dette')}` : '';
    lignes.push({ dateHeure:a.dateHeure||a.date, date:a.date, type:'achat', libelle:t('type_achat'), client:a.fournisseur, detail:resumeArticles(a.lignes)+noteDette, montant:a.total, sens:-1, employeNom:a.employeNom });
  });
  state.depenses.forEach(d=>{
    lignes.push({ dateHeure:d.dateHeure||d.date, date:d.date, type:'depense', libelle:t('type_depense'), client:'—', detail:d.description||d.categorie||'—', montant:d.montant, sens:-1, employeNom:d.employeNom||'—' });
  });
  state.paiements.forEach(p=>{
    lignes.push({ dateHeure:p.dateHeure||p.date, date:p.date, type:'paiement_recu', libelle:t('type_paiement_recu'), client:p.clientNom, detail:t('remboursement_credit'), montant:p.montant, sens:1, employeNom:p.employeNom });
  });
  state.paiementsFournisseurs.forEach(p=>{
    // Un versement à un fournisseur peut être soit le règlement d'une dette existante, soit un
    // accompte payé avant réception de marchandise (voir estAvance dans view-fournisseurs.js) —
    // distingués ici pour ne pas afficher « Règlement de dette » sur ce qui est en réalité une
    // avance, ce qui portait à confusion.
    const libelle = p.estAvance ? t('type_avance_fournisseur') : t('type_paiement_verse');
    const detailBase = p.estAvance ? t('avance_sur') : t('reglement_dette');
    const detail = p.produitConcerne ? `${detailBase} — ${p.produitConcerne}` : detailBase;
    lignes.push({ dateHeure:p.dateHeure||p.date, date:p.date, type:'paiement_verse', libelle, client:p.fournisseurNom, detail, montant:p.montant, sens:-1, employeNom:p.employeNom });
  });
  state.retours.forEach(r=>{
    lignes.push({ dateHeure:r.dateHeure||r.date, date:r.date, type:'retour', libelle:t('type_retour'), client:r.client, detail:resumeArticles(r.lignes), montant:r.total, sens:-1, employeNom:r.employeNom });
  });
  return lignes.sort((a,b)=> (b.dateHeure||'').localeCompare(a.dateHeure||''));
}
export function viewJournal(){
  const debut = debutPeriode(journalPeriode);
  let lignes = construireJournal().filter(l=>l.date>=debut);
  if(journalType!=='tous') lignes = lignes.filter(l=>l.type===journalType);
  if(journalClient!=='tous') lignes = lignes.filter(l=>l.client===journalClient);
  const solde = lignes.reduce((s,l)=>s+l.sens*l.montant,0);
  return `
  <div class="pill-toggle">
    ${['jour','semaine','mois','trimestre','semestre','annee'].map(p=>`<button data-role="periode" data-p="${p}" class="${journalPeriode===p?'active':''}">${t(p)}</button>`).join('')}
  </div>
  <div class="pill-toggle">
    ${['tous','vente','achat','depense','paiement_recu','paiement_verse','retour'].map(ty=>`<button data-role="type" data-t="${ty}" class="${journalType===ty?'active':''}">${ty==='tous'?t('tous_types'):t('type_'+ty)}</button>`).join('')}
  </div>
  <div class="champ" style="max-width:280px;margin-bottom:14px;">
    <label>${t('nav_clients')}</label>
    <select id="jour-client">${optionsClients(journalClient)}</select>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="label">${t('solde_periode')}</div><div class="valeur" style="color:${solde>=0?'var(--vert)':'var(--rouge)'};">${solde>=0?'+':''}${money(solde)}</div></div>
  </div>
  <div class="panel">
    <table>
      <tr><th>${t('date_heure')}</th><th>${t('type_transaction')}</th><th>${t('nav_clients')}</th><th>${t('detail_transaction')}</th><th>${t('effectue_par')}</th><th>${t('montant')}</th></tr>
      ${lignes.map(l=>`<tr><td>${fmtDateHeure(l.dateHeure)!=='—'?fmtDateHeure(l.dateHeure):fmtDate(l.date)}</td><td>${l.libelle}</td><td>${l.client||'—'}</td><td>${l.detail||'—'}</td><td>${l.employeNom||'—'}</td><td style="color:${l.sens>0?'var(--vert)':'var(--rouge)'};font-weight:600;">${l.sens>0?'+':'−'}${money(l.montant)}</td></tr>`).join('') || `<tr><td colspan="6" style="color:var(--texte-att);">${t('aucune_transaction')}</td></tr>`}
    </table>
  </div>`;
}
export function wireJournal(){
  document.querySelectorAll('[data-role="periode"]').forEach(b=>b.addEventListener('click', ()=>{ journalPeriode=b.dataset.p; renderContent(); wireJournal(); }));
  document.querySelectorAll('[data-role="type"]').forEach(b=>b.addEventListener('click', ()=>{ journalType=b.dataset.t; renderContent(); wireJournal(); }));
  document.getElementById('jour-client').addEventListener('change', (e)=>{ journalClient=e.target.value; renderContent(); wireJournal(); });
}
