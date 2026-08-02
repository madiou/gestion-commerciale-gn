import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { t } from './i18n.js';
import { moneyUSD, fmtDate, flash } from './helpers.js';
import { joursRestants, dateFinEssaiGratuit, essaiGratuitExpire } from './business-logic.js';

let toutesLesBoutiques = null;
let tarifsActuels = null;

const PLANS_PAYANTS = ['standard', 'pro', 'entreprise', 'payant'];
const SEUIL_ALERTE_JOURS = 14;

function libellePlan(plan){
  return { gratuit:t('gratuit'), standard:t('plan_standard'), pro:t('plan_pro'), entreprise:t('plan_entreprise'), payant:t('payant') }[plan] || plan;
}
function libelleJours(j){
  if(j === null) return '—';
  if(j < 0) return t('depuis_x_jours').replace('{n}', Math.abs(j));
  if(j === 0) return t('aujourd_hui');
  return t('dans_x_jours').replace('{n}', j);
}

function calculerStats(){
  const compteParPlan = { gratuit:0, standard:0, pro:0, entreprise:0, payant:0 };
  let boutiquesPayantesActives = 0, essaisGratuitsActifs = 0, mrr = 0, boutiquesPayantesSansPrixConnu = 0;
  const renouvellements = [];
  const essaisBientotTermines = [];

  toutesLesBoutiques.forEach(b=>{
    const plan = compteParPlan.hasOwnProperty(b.plan) ? b.plan : 'gratuit';
    compteParPlan[plan]++;
    const estPayant = PLANS_PAYANTS.includes(b.plan);

    if(estPayant){
      const jours = joursRestants(b.dateExpirationAbonnement);
      const expire = jours !== null && jours < 0;
      if(!expire){
        boutiquesPayantesActives++;
        const prixPlan = tarifsActuels && tarifsActuels[b.plan] ? tarifsActuels[b.plan].prix : null;
        if(prixPlan) mrr += prixPlan; else boutiquesPayantesSansPrixConnu++;
      }
      if(jours !== null && jours <= SEUIL_ALERTE_JOURS){
        renouvellements.push({ ...b, jours });
      }
    } else {
      if(!b.dateCreation || !essaiGratuitExpire(b.dateCreation)) essaisGratuitsActifs++;
      if(b.dateCreation){
        const jours = joursRestants(dateFinEssaiGratuit(b.dateCreation));
        if(jours !== null && jours <= SEUIL_ALERTE_JOURS){
          essaisBientotTermines.push({ ...b, jours });
        }
      }
    }
  });

  renouvellements.sort((a,b)=>a.jours - b.jours);
  essaisBientotTermines.sort((a,b)=>a.jours - b.jours);

  return {
    total: toutesLesBoutiques.length, compteParPlan, boutiquesPayantesActives, essaisGratuitsActifs,
    mrr, boutiquesPayantesSansPrixConnu, renouvellements, essaisBientotTermines
  };
}

function carteStat(label, valeur, note){
  return `<div class="stat-card"><div class="label">${label}</div><div class="valeur" style="font-size:24px;font-weight:700;color:var(--vert-fonce);">${valeur}</div>${note?`<div class="delta">${note}</div>`:''}</div>`;
}

export function viewAdminApercu(){
  return `
  <div class="msg ok" id="msg-apercu"></div>
  <div id="apercu-corps">
    <div style="text-align:center;color:var(--texte-att);padding:30px 0;">${t('chargement')}</div>
  </div>`;
}

function rendreCorps(){
  const conteneur = document.getElementById('apercu-corps');
  if(!conteneur) return;
  const s = calculerStats();
  conteneur.innerHTML = `
  <div class="stats" style="margin-bottom:18px;">
    ${carteStat(t('total_boutiques'), s.total)}
    ${carteStat(t('boutiques_payantes'), s.boutiquesPayantesActives)}
    ${carteStat(t('mrr_estime'), moneyUSD(s.mrr), s.boutiquesPayantesSansPrixConnu ? t('prix_inconnu_note').replace('{n}', s.boutiquesPayantesSansPrixConnu) : '')}
    ${carteStat(t('essais_gratuits_actifs'), s.essaisGratuitsActifs)}
  </div>

  <div class="panel" style="margin-bottom:18px;">
    <h3>${t('repartition_par_plan')}</h3>
    <table>
      <tr><th>${t('plan')}</th><th>${t('nombre')}</th></tr>
      <tr><td>${t('gratuit')}</td><td>${s.compteParPlan.gratuit}</td></tr>
      <tr><td>${t('plan_standard')}</td><td>${s.compteParPlan.standard}</td></tr>
      <tr><td>${t('plan_pro')}</td><td>${s.compteParPlan.pro}</td></tr>
      <tr><td>${t('plan_entreprise')}</td><td>${s.compteParPlan.entreprise}</td></tr>
      ${s.compteParPlan.payant ? `<tr><td>${t('payant')} (${t('ancien_plan')})</td><td>${s.compteParPlan.payant}</td></tr>` : ''}
    </table>
  </div>

  <div class="panel" style="margin-bottom:18px;">
    <h3>${t('renouvellements_a_venir')}</h3>
    <table>
      <tr><th>${t('nom_boutique')}</th><th>${t('email')}</th><th>${t('plan')}</th><th>${t('expiration')}</th><th>${t('statut')}</th></tr>
      ${s.renouvellements.length ? s.renouvellements.map(b=>`<tr>
        <td>${b.nomBoutique||'—'}</td><td>${b.emailProprietaire||'—'}</td><td>${libellePlan(b.plan)}</td>
        <td>${b.dateExpirationAbonnement?fmtDate(b.dateExpirationAbonnement):'—'}</td>
        <td><span class="tag ${b.jours<0?'bas':'moy'}">${libelleJours(b.jours)}</span></td>
      </tr>`).join('') : `<tr><td colspan="5" style="color:var(--texte-att);">${t('aucun_renouvellement')}</td></tr>`}
    </table>
  </div>

  <div class="panel">
    <h3>${t('essais_bientot_termines')}</h3>
    <table>
      <tr><th>${t('nom_boutique')}</th><th>${t('email')}</th><th>${t('essai_gratuit_jusquau')}</th><th>${t('statut')}</th></tr>
      ${s.essaisBientotTermines.length ? s.essaisBientotTermines.map(b=>`<tr>
        <td>${b.nomBoutique||'—'}</td><td>${b.emailProprietaire||'—'}</td>
        <td>${fmtDate(dateFinEssaiGratuit(b.dateCreation))}</td>
        <td><span class="tag ${b.jours<0?'bas':'moy'}">${libelleJours(b.jours)}</span></td>
      </tr>`).join('') : `<tr><td colspan="4" style="color:var(--texte-att);">${t('aucun_essai_bientot_termine')}</td></tr>`}
    </table>
  </div>`;
}

export async function wireAdminApercu(){
  try{
    if(!toutesLesBoutiques){
      const snap = await getDocs(collection(db,'boutiques'));
      toutesLesBoutiques = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    }
    if(!tarifsActuels){
      const snapTarifs = await getDoc(doc(db,'config','tarifs'));
      tarifsActuels = snapTarifs.exists() ? snapTarifs.data() : {};
    }
  }catch(e){
    console.error('Erreur chargement vue d\'ensemble', e);
    flash(document.getElementById('msg-apercu'), t('erreur_generique'), 'err');
    toutesLesBoutiques = toutesLesBoutiques || [];
    tarifsActuels = tarifsActuels || {};
  }
  rendreCorps();
}
