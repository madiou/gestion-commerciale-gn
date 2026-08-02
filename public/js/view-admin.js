import { collection, doc, getDoc, getDocs, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import { t } from './i18n.js';
import { moneyUSD, nowISO, fmtDate, flash, creerMessagePersistant } from './helpers.js';
import { creerCompteEmploye } from './view-utilisateurs.js';
import { enregistrerJournalAdmin } from './app-shell.js';

let showNouvelleBoutique = false;
let toutesLesBoutiques = null; // cache pour le panneau super-admin
let tarifsActuels = null; // cache du document config/tarifs
const messageAdmin = creerMessagePersistant(()=>rerenderAdminContent());

const PLANS_TARIFES = ['standard', 'pro', 'entreprise'];

function prixApresRabais(tarif){
  if(!tarif) return null;
  const rabais = tarif.rabaisPourcent || 0;
  return Math.round(tarif.prix * (1 - rabais/100));
}
function promoActive(tarif){
  if(!tarif || !tarif.rabaisPourcent || !tarif.promoDebut || !tarif.promoFin) return false;
  const aujourdhui = new Date().toISOString().slice(0,10);
  return aujourdhui >= tarif.promoDebut && aujourdhui <= tarif.promoFin;
}

// 'payant' = valeur historique d'avant les 4 plans, encore présente sur des boutiques déjà
// abonnées avant ce changement. Reconnue en lecture (statut, limites) mais plus jamais écrite :
// dès qu'un super-admin touche au plan d'une telle boutique, elle bascule sur un des 3 vrais plans.
const PLANS_PAYANTS = ['standard', 'pro', 'entreprise', 'payant'];
function libellePlan(plan){
  return { gratuit:t('gratuit'), standard:t('plan_standard'), pro:t('plan_pro'), entreprise:t('plan_entreprise'), payant:t('payant') }[plan] || plan;
}

export function calculerNouvelleDateAbonnement(dateActuelle, jours){
  const base = (dateActuelle && new Date(dateActuelle+'T23:59:59') > new Date()) ? new Date(dateActuelle+'T00:00:00') : new Date();
  base.setDate(base.getDate()+jours);
  return base.toISOString().slice(0,10);
}
export function viewAdmin(){
  return `
  ${messageAdmin.html('msg-admin')}
  <div class="toolbar-stock">
    <div style="font-size:12px;color:var(--texte-att);">${t('admin_intro')}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primaire" id="adm-nouvelle-boutique">${t('nouvelle_boutique')}</button>
      <button class="btn btn-secondaire" id="adm-refresh">${t('rafraichir')}</button>
    </div>
  </div>
  <div class="form-wrap ${showNouvelleBoutique?'':'hidden'}" id="adm-form" style="margin-bottom:18px;">
    <div class="form-grid cols3">
      <div class="champ"><label>${t('nom_boutique')}</label><input type="text" id="ab-nom" placeholder="Ex : Boutique Diallo & Fils"></div>
      <div class="champ"><label>${t('email')}</label><input type="email" id="ab-email" placeholder="proprietaire@exemple.com"></div>
      <div class="champ"><label>${t('mdp_temporaire')}</label><input type="text" id="ab-pass" placeholder="6 caractères minimum"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="ab-save">${t('creer_boutique')}</button>
      <button class="btn btn-secondaire" id="ab-cancel">${t('annuler')}</button>
    </div>
    <div style="margin-top:14px;font-size:12px;color:var(--texte-att);">${t('communiquer_identifiants')}</div>
  </div>

  <div class="panel" style="margin-bottom:18px;">
    <h3>${t('tarifs_titre')}</h3>
    <div style="font-size:12px;color:var(--texte-att);margin-bottom:14px;">${t('tarifs_intro')}</div>
    <div id="tarifs-corps">${tarifsActuels ? tarifsFormHTML() : `<div style="color:var(--texte-att);font-size:13px;">${t('chargement')}</div>`}</div>
  </div>

  <div class="stock-panel"><table id="admin-table"></table></div>`;
}
function tarifsFormHTML(){
  return `
  <div class="form-grid cols3" style="margin-bottom:6px;">
    ${PLANS_TARIFES.map(id=>{
      const tarif = tarifsActuels[id] || {};
      const promo = promoActive(tarif);
      return `
      <div class="champ" style="border:1px solid var(--gris-bord);border-radius:8px;padding:14px;gap:10px;">
        <label style="font-size:13px;text-transform:none;color:var(--vert-fonce);font-weight:700;">${t('plan_'+id)}</label>
        <label>${t('tarif_prix')}</label>
        <input type="number" min="0" step="1" class="tar-prix" data-id="${id}" value="${tarif.prix||0}">
        <label>${t('tarif_rabais')}</label>
        <input type="number" min="0" max="100" class="tar-rabais" data-id="${id}" value="${tarif.rabaisPourcent||0}">
        <label>${t('tarif_du')}</label>
        <input type="date" class="tar-debut" data-id="${id}" value="${tarif.promoDebut||''}">
        <label>${t('tarif_au')}</label>
        <input type="date" class="tar-fin" data-id="${id}" value="${tarif.promoFin||''}">
        <div class="tar-apercu" data-id="${id}" style="margin-top:4px;font-size:12px;color:var(--texte-att);">
          ${apercuTarifHTML(tarif)}
        </div>
      </div>`;
    }).join('')}
  </div>
  <button class="btn btn-primaire" id="tar-save" style="margin-top:10px;">${t('enregistrer')}</button>`;
}
function apercuTarifHTML(tarif){
  const rabais = tarif.rabaisPourcent||0;
  const prixFinal = prixApresRabais(tarif);
  const actif = promoActive(tarif);
  if(!rabais || prixFinal===tarif.prix){
    return `${moneyUSD(tarif.prix||0)} ${t('acc_par_mois')}`;
  }
  return `<span style="text-decoration:line-through;">${moneyUSD(tarif.prix||0)}</span>
    <strong style="color:var(--vert-fonce);"> ${moneyUSD(prixFinal)} ${t('acc_par_mois')}</strong>
    <span class="tag ${actif?'ok':'moy'}" style="margin-left:6px;">${actif?t('promo_active'):t('promo_programmee')}</span>`;
}
export function rerenderAdminContent(){
  document.getElementById('content').innerHTML = viewAdmin();
  wireAdmin();
}
async function renderAdminRows(){
  const tbl = document.getElementById('admin-table');
  if(!tbl) return;
  tbl.innerHTML = `<tr><th colspan="7" style="text-align:center;color:var(--texte-att);">${t('chargement')}</th></tr>`;
  if(!toutesLesBoutiques){
    const snap = await getDocs(collection(db,'boutiques'));
    toutesLesBoutiques = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }
  if(!document.getElementById('admin-table')) return;
  const lignes = toutesLesBoutiques.map(b=>{
    const estPayant = PLANS_PAYANTS.includes(b.plan);
    const expire = estPayant && b.dateExpirationAbonnement && new Date(b.dateExpirationAbonnement+'T23:59:59') < new Date();
    const statutTag = !estPayant
      ? `<span class="tag moy">${t('gratuit')}</span>`
      : (expire ? `<span class="tag bas">${libellePlan(b.plan)} — ${t('statut_expire')}</span>` : `<span class="tag ok">${libellePlan(b.plan)} — ${t('statut_actif')}</span>`);
    const planSelectionne = estPayant ? b.plan : 'standard';
    const selecteurPlan = `<select class="adm-plan" data-id="${b.id}" style="padding:5px 6px;border:1px solid var(--gris-bord);border-radius:5px;font-size:12px;">
      <option value="standard" ${planSelectionne==='standard'?'selected':''}>${t('plan_standard')}</option>
      <option value="pro" ${planSelectionne==='pro'?'selected':''}>${t('plan_pro')}</option>
      <option value="entreprise" ${planSelectionne==='entreprise'?'selected':''}>${t('plan_entreprise')}</option>
    </select>`;
    return `<tr>
      <td>${b.nomBoutique || '—'}</td>
      <td>${b.emailProprietaire || '—'}</td>
      <td>${statutTag}</td>
      <td>${b.dateExpirationAbonnement ? fmtDate(b.dateExpirationAbonnement) : '—'}</td>
      <td>${selecteurPlan}</td>
      <td><input type="date" data-id="${b.id}" class="adm-date" style="padding:5px 6px;border:1px solid var(--gris-bord);border-radius:5px;font-size:12px;" value="${b.dateExpirationAbonnement||''}"></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-primaire" style="padding:5px 10px;font-size:12px;" data-role="prolonger30" data-id="${b.id}">${t('prolonger_30j')}</button>
        <button class="btn btn-secondaire" style="padding:5px 10px;font-size:12px;" data-role="appliquer-date" data-id="${b.id}">${t('appliquer_date')}</button>
        <button class="btn-danger" style="padding:5px 10px;font-size:12px;" data-role="repasser-gratuit" data-id="${b.id}">${t('repasser_gratuit')}</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" style="color:var(--texte-att);">${t('aucune_boutique')}</td></tr>`;
  tbl.innerHTML = `<tr><th>${t('nom_boutique')}</th><th>${t('email')}</th><th>${t('statut')}</th><th>${t('expiration')}</th><th>${t('plan')}</th><th>${t('nouvelle_date')}</th><th></th></tr>` + lignes;

  document.querySelectorAll('[data-role="prolonger30"]').forEach(btn=>btn.addEventListener('click', ()=>{
    const plan = document.querySelector(`.adm-plan[data-id="${btn.dataset.id}"]`).value;
    appliquerAbonnement(btn.dataset.id, 30, null, plan);
  }));
  document.querySelectorAll('[data-role="appliquer-date"]').forEach(btn=>btn.addEventListener('click', ()=>{
    const input = document.querySelector(`.adm-date[data-id="${btn.dataset.id}"]`);
    if(!input.value){ flash(document.getElementById('msg-admin'), t('choisir_date'), 'err'); return; }
    const plan = document.querySelector(`.adm-plan[data-id="${btn.dataset.id}"]`).value;
    appliquerAbonnement(btn.dataset.id, null, input.value, plan);
  }));
  document.querySelectorAll('[data-role="repasser-gratuit"]').forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm(t('confirmer_repasser_gratuit'))) return;
    await updateDoc(doc(db,'boutiques',btn.dataset.id), { plan:'gratuit', dateExpirationAbonnement:null });
    const boutique = toutesLesBoutiques.find(x=>x.id===btn.dataset.id);
    if(boutique){ boutique.plan='gratuit'; boutique.dateExpirationAbonnement=null; }
    enregistrerJournalAdmin('repasser_gratuit', btn.dataset.id, boutique?boutique.nomBoutique:'', '');
    messageAdmin.afficher(t('boutique_repassee_gratuit'), 'ok');
  }));
}
async function appliquerAbonnement(boutiqueId, jours, dateChoisie, plan){
  const boutique = toutesLesBoutiques.find(x=>x.id===boutiqueId);
  const planFinal = PLANS_PAYANTS.includes(plan) ? plan : 'standard';
  const nouvelleDate = dateChoisie || calculerNouvelleDateAbonnement(boutique?boutique.dateExpirationAbonnement:null, jours);
  await updateDoc(doc(db,'boutiques',boutiqueId), {
    plan: planFinal,
    dateExpirationAbonnement: nouvelleDate,
    historiquePaiements: arrayUnion({ date:nowISO(), nouvelleExpiration:nouvelleDate, plan:planFinal, par:currentUser.email })
  });
  if(boutique){ boutique.plan=planFinal; boutique.dateExpirationAbonnement=nouvelleDate; }
  enregistrerJournalAdmin('changement_abonnement', boutiqueId, boutique?boutique.nomBoutique:'', `${libellePlan(planFinal)} — ${nouvelleDate}`);
  messageAdmin.afficher(`${t('abonnement_mis_a_jour')} (${libellePlan(planFinal)}) ${fmtDate(nouvelleDate)}`, 'ok');
}
async function chargerTarifs(){
  if(!tarifsActuels){
    const snap = await getDoc(doc(db,'config','tarifs'));
    tarifsActuels = snap.exists() ? snap.data() : {};
  }
  const corps = document.getElementById('tarifs-corps');
  if(!corps) return;
  corps.innerHTML = tarifsFormHTML();
  wireTarifs();
}
function wireTarifs(){
  const btn = document.getElementById('tar-save');
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    if(btn.disabled) return;
    btn.disabled = true;
    const nouveau = {};
    PLANS_TARIFES.forEach(id=>{
      nouveau[id] = {
        prix: Number(document.querySelector(`.tar-prix[data-id="${id}"]`).value) || 0,
        rabaisPourcent: Number(document.querySelector(`.tar-rabais[data-id="${id}"]`).value) || 0,
        promoDebut: document.querySelector(`.tar-debut[data-id="${id}"]`).value || null,
        promoFin: document.querySelector(`.tar-fin[data-id="${id}"]`).value || null
      };
    });
    try{
      await setDoc(doc(db,'config','tarifs'), nouveau, { merge:true });
      tarifsActuels = nouveau;
      enregistrerJournalAdmin('tarifs_modifies', '', '', '');
      messageAdmin.afficher(t('tarifs_enregistres'), 'ok');
    }catch(e){
      flash(document.getElementById('msg-admin'), t('erreur_generique'), 'err');
    }finally{
      btn.disabled = false;
    }
  });
}
export function wireAdmin(){
  renderAdminRows();
  chargerTarifs();
  document.getElementById('adm-refresh').addEventListener('click', ()=>{ toutesLesBoutiques=null; renderAdminRows(); });
  document.getElementById('adm-nouvelle-boutique').addEventListener('click', ()=>{ showNouvelleBoutique=true; rerenderAdminContent(); });
  if(showNouvelleBoutique){
    document.getElementById('ab-cancel').addEventListener('click', ()=>{ showNouvelleBoutique=false; rerenderAdminContent(); });
    document.getElementById('ab-save').addEventListener('click', async (ev)=>{
      if(ev.target.disabled) return;
      const nomBoutique = document.getElementById('ab-nom').value.trim();
      const email = document.getElementById('ab-email').value.trim();
      const pass = document.getElementById('ab-pass').value;
      if(!email || pass.length<6){ flash(document.getElementById('msg-admin'), t('champs_boutique_invalides'), 'err'); return; }
      ev.target.disabled = true;
      try{
        const newUid = await creerCompteEmploye(email, pass);
        await setDoc(doc(db,'boutiques',newUid), { existe:true, plan:'gratuit', emailProprietaire:email, nomBoutique, dateCreation:nowISO() }, { merge:true });
        await setDoc(doc(db,'boutiques',newUid,'utilisateurs',newUid), { nom:'Propriétaire', email, role:'Propriétaire', dateAjout:nowISO() });
        await setDoc(doc(db,'membres',newUid), { boutiqueId:newUid, role:'Propriétaire', email });
        enregistrerJournalAdmin('creation_boutique', newUid, nomBoutique, email);
        showNouvelleBoutique = false;
        toutesLesBoutiques = null;
        messageAdmin.afficher(t('boutique_creee')+' '+email, 'ok');
      }catch(e){
        flash(document.getElementById('msg-admin'), e.code==='auth/email-already-in-use' ? t('email_deja_utilise') : t('erreur_creation_boutique'), 'err');
        ev.target.disabled = false;
      }
    });
  }
}
