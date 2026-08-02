import { state } from './state.js';
import { t, traduirePaiement } from './i18n.js';
import { money, fmtDate, fmtDateHeure } from './helpers.js';
import { debutPeriode, renderContent, imprimerRecu, exporterCSV } from './app-shell.js';
import { optionsClients } from './business-logic.js';

let rapportPeriode = 'jour';
let rapportClient = 'tous';

function ventesPeriode(){
  const debut = debutPeriode(rapportPeriode);
  let v = state.ventes.filter(x=>x.date>=debut);
  if(rapportClient!=='tous') v = v.filter(x=>x.client===rapportClient);
  return v;
}
function achatsPeriode(){
  const debut = debutPeriode(rapportPeriode);
  return state.achats.filter(x=>x.date>=debut);
}

export function viewRapports(){
  const v = ventesPeriode();
  const a = achatsPeriode();
  const d = state.depenses.filter(x=>x.date>=debutPeriode(rapportPeriode));
  const recettes = v.reduce((s,x)=>s+x.total,0);
  const cout = a.reduce((s,x)=>s+x.total,0) + d.reduce((s,x)=>s+x.montant,0);
  return `
  <div class="pill-toggle">
    ${['jour','semaine','mois','trimestre','semestre','annee'].map(p=>`<button data-p="${p}" class="${rapportPeriode===p?'active':''}">${t(p)}</button>`).join('')}
  </div>
  <div class="champ" style="max-width:280px;margin-bottom:14px;">
    <label>${t('nav_clients')}</label>
    <select id="rap-client">${optionsClients(rapportClient)}</select>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="label">${t('nb_ventes')}</div><div class="valeur">${v.length}</div></div>
    <div class="stat-card"><div class="label">${t('ca_jour').replace(' (jour)','').replace(' (today)','')}</div><div class="valeur">${money(recettes)}</div></div>
    <div class="stat-card"><div class="label">${t('depenses_achats')}</div><div class="valeur">${money(cout)}</div></div>
    <div class="stat-card"><div class="label">${t('benefice_net')}</div><div class="valeur">${money(recettes-cout)}</div></div>
  </div>
  <div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="border:none;padding:0;">${t('ventes_periode')}</h3>
      <button class="btn btn-secondaire" id="rap-export-ventes" style="padding:6px 12px;font-size:12px;">${t('exporter_csv')}</button>
    </div>
    <table>
      <tr><th>${t('date_heure')}</th><th>${t('nav_clients')}</th><th>${t('paiement')}</th><th>${t('effectue_par')}</th><th>${t('montant')}</th><th></th></tr>
      ${v.slice().reverse().map(x=>{
        const credit = x.montantCredit!==undefined ? x.montantCredit : (x.paiement==='Crédit client'?x.total:0);
        const estPartiel = x.paiement==='Crédit client' && credit>0 && credit<x.total;
        const libellePaiement = estPartiel ? `${t('credit_client')} (${money(credit)} ${t('valeur_sur')} ${money(x.total)})` : traduirePaiement(x.paiement);
        return `<tr><td>${fmtDateHeure(x.dateHeure) !== '—' ? fmtDateHeure(x.dateHeure) : fmtDate(x.date)}</td><td>${x.client}</td><td>${libellePaiement}</td><td>${x.employeNom||'—'}</td><td>${money(x.total)}</td><td><button class="mini-link" data-id="${x.id}" data-role="imprimer-recu">${t('imprimer')}</button></td></tr>`;
      }).join('') || `<tr><td colspan="6" style="color:var(--texte-att);">${t('aucune_vente_periode')}</td></tr>`}
    </table>
  </div>
  <div class="panel" style="margin-top:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="border:none;padding:0;">${t('achats_periode')}</h3>
      <button class="btn btn-secondaire" id="rap-export-achats" style="padding:6px 12px;font-size:12px;">${t('exporter_csv')}</button>
    </div>
    <table>
      <tr><th>${t('date_heure')}</th><th>${t('fournisseur')}</th><th>${t('paiement')}</th><th>${t('effectue_par')}</th><th>${t('montant')}</th></tr>
      ${a.slice().reverse().map(x=>{
        const paye = x.montantPaye!==undefined ? x.montantPaye : (x.paiement==='Espèces'?x.total:0);
        const estPartiel = x.paiement==='Dette fournisseur' && paye>0 && paye<x.total;
        const libellePaiement = estPartiel ? `${t('paiement_partiel')} (${money(paye)} / ${money(x.total-paye)} ${t('reste_apres_paiement')})` : traduirePaiement(x.paiement);
        return `<tr><td>${fmtDateHeure(x.dateHeure) !== '—' ? fmtDateHeure(x.dateHeure) : fmtDate(x.date)}</td><td>${x.fournisseur}</td><td>${libellePaiement}</td><td>${x.employeNom||'—'}</td><td>${money(x.total)}</td></tr>`;
      }).join('') || `<tr><td colspan="5" style="color:var(--texte-att);">${t('aucun_achat_periode')}</td></tr>`}
    </table>
  </div>`;
}
export function wireRapports(){
  document.querySelectorAll('.pill-toggle button').forEach(b=>b.addEventListener('click', ()=>{ rapportPeriode=b.dataset.p; renderContent(); wireRapports(); }));
  document.getElementById('rap-client').addEventListener('change', (e)=>{ rapportClient=e.target.value; renderContent(); wireRapports(); });
  document.querySelectorAll('[data-role="imprimer-recu"]').forEach(b=>b.addEventListener('click', ()=>{
    const vente = state.ventes.find(v=>v.id===b.dataset.id);
    if(vente) imprimerRecu(vente);
  }));
  document.getElementById('rap-export-ventes').addEventListener('click', ()=>{
    const entetes = [t('date_heure'), t('recu_numero'), t('nav_clients'), t('paiement'), t('reference'), t('effectue_par'), t('montant')];
    const lignes = ventesPeriode().map(x=>{
      const credit = x.montantCredit!==undefined ? x.montantCredit : (x.paiement==='Crédit client'?x.total:0);
      const reference = x.paiement==='Mobile money' ? (x.referenceMobileMoney||'') : (x.paiement==='Crédit client' ? `${t('credit_client')} ${credit}/${x.total}` : '');
      return [fmtDateHeure(x.dateHeure)!=='—'?fmtDateHeure(x.dateHeure):fmtDate(x.date), x.numeroRecu||'', x.client, traduirePaiement(x.paiement), reference, x.employeNom||'', x.total];
    });
    exporterCSV(`ventes_${rapportPeriode}.csv`, entetes, lignes);
  });
  document.getElementById('rap-export-achats').addEventListener('click', ()=>{
    const entetes = [t('date_heure'), t('fournisseur'), t('paiement'), t('effectue_par'), t('montant')];
    const lignes = achatsPeriode().map(x=>[fmtDateHeure(x.dateHeure)!=='—'?fmtDateHeure(x.dateHeure):fmtDate(x.date), x.fournisseur, traduirePaiement(x.paiement), x.employeNom||'', x.total]);
    exporterCSV(`achats_${rapportPeriode}.csv`, entetes, lignes);
  });
}
