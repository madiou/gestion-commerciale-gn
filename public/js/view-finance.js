import { collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentBoutiqueId } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { money, todayISO, flash } from './helpers.js';
import { debutPeriode, renderContent } from './app-shell.js';

export function viewFinance(){
  const debut = debutPeriode('mois');
  const ventesM = state.ventes.filter(v=>v.date>=debut);
  const achatsM = state.achats.filter(a=>a.date>=debut);
  const depensesM = state.depenses.filter(d=>d.date>=debut);
  const recettes = ventesM.reduce((s,v)=>s+v.total,0);
  const depensesTotal = achatsM.reduce((s,a)=>s+a.total,0) + depensesM.reduce((s,d)=>s+d.montant,0);
  const benefice = recettes - depensesTotal;
  const creditsParClient = {};
  state.ventes.filter(v=>v.paiement==='Crédit client').forEach(v=>{ const credit=v.montantCredit!==undefined?v.montantCredit:v.total; creditsParClient[v.client]=(creditsParClient[v.client]||0)+credit; });
  state.paiements.forEach(p=>{ if(creditsParClient[p.clientNom]!==undefined) creditsParClient[p.clientNom]-=p.montant; });
  Object.keys(creditsParClient).forEach(c=>{ if(creditsParClient[c]<=0) delete creditsParClient[c]; });
  const dettesFournisseurs = {};
  state.achats.filter(a=>a.paiement==='Dette fournisseur').forEach(a=>{ const paye=a.montantPaye!==undefined?a.montantPaye:0; dettesFournisseurs[a.fournisseur]=(dettesFournisseurs[a.fournisseur]||0)+Math.max(0,a.total-paye); });
  state.paiementsFournisseurs.forEach(p=>{ if(dettesFournisseurs[p.fournisseurNom]!==undefined) dettesFournisseurs[p.fournisseurNom]-=p.montant; });
  Object.keys(dettesFournisseurs).forEach(f=>{ if(dettesFournisseurs[f]<=0) delete dettesFournisseurs[f]; });
  const maxBar = Math.max(recettes, depensesTotal, Math.abs(benefice), 1);
  return `
  <div class="msg ok" id="msg-finance"></div>
  <div class="panels">
    <div class="panel">
      <h3>${t('recettes_depenses_30j')}</h3>
      ${barreFinance(t('recettes'), recettes, maxBar, 'var(--vert)')}
      ${barreFinance(t('depenses'), depensesTotal, maxBar, 'var(--or)')}
      ${barreFinance(t('benefice_net'), benefice, maxBar, benefice>=0?'var(--vert-clair)':'var(--rouge)')}
      <div class="form-wrap" style="margin-top:18px;padding:16px;">
        <div class="form-grid">
          <div class="champ"><label>${t('desc_depense')}</label><input type="text" id="d-desc" placeholder="Ex : Transport, loyer..."></div>
          <div class="champ"><label>${t('montant')}</label><input type="number" min="0" id="d-montant"></div>
        </div>
        <button class="btn btn-primaire" id="d-save">${t('ajouter_depense')}</button>
      </div>
    </div>
    <div class="panel">
      <h3>${t('dettes_credits')}</h3>
      <table>
        <tr><th>${t('tiers')}</th><th>${t('type')}</th><th>${t('montant')}</th></tr>
        ${Object.entries(creditsParClient).map(([c,m])=>`<tr><td>${c}</td><td>${t('credit_a_recevoir')}</td><td>${money(m)}</td></tr>`).join('')}
        ${Object.entries(dettesFournisseurs).map(([f,m])=>`<tr><td>${f}</td><td>${t('dette_fournisseur')}</td><td>${money(m)}</td></tr>`).join('')}
        ${(Object.keys(creditsParClient).length+Object.keys(dettesFournisseurs).length)===0?`<tr><td colspan="3" style="color:var(--texte-att);">${t('aucune_dette')}</td></tr>`:''}
      </table>
    </div>
  </div>`;
}
function barreFinance(label, val, max, color){
  const pct = Math.min(100, Math.abs(val)/max*100);
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13px;">
    <div style="width:110px;flex-shrink:0;color:var(--texte-att);">${label}</div>
    <div style="flex:1;background:#EEEAE0;border-radius:4px;height:16px;overflow:hidden;"><div style="height:100%;background:${color};width:${pct}%;"></div></div>
    <div style="width:90px;text-align:right;font-weight:600;">${money(val)}</div>
  </div>`;
}
export function wireFinance(){
  document.getElementById('d-save').addEventListener('click', (ev)=>{
    if(ev.target.disabled) return;
    const msg = document.getElementById('msg-finance');
    const desc = document.getElementById('d-desc').value.trim();
    const montant = parseInt(document.getElementById('d-montant').value||'0',10);
    if(!desc || montant<=0){ flash(msg,'Indiquez une description et un montant valides.','err'); return; }
    ev.target.disabled = true;
    setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'depenses')), { date:todayISO(), description:desc, montant, categorie:'Général' }).catch(e=>console.error('Erreur enregistrement dépense', e));
    flash(msg, 'Dépense ajoutée.', 'ok');
    renderContent(); wireFinance();
  });
}
