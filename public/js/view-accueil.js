import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { t, langue, setLangue, prochaineLangue, nomLangue } from './i18n.js';
import { moneyUSD } from './helpers.js';
import { renderLogin } from './view-login.js';

const FONCTIONNALITES = [1,2,3,4,5,6].map(n => ({
  icone: ['💰','📦','🤝','🚚','📊','👥'][n-1],
  titre: `acc_f${n}_titre`,
  texte: `acc_f${n}_texte`,
}));

// Valeurs de repli en USD, affichées brièvement le temps que config/tarifs se charge.
const PLANS = [
  { id:'gratuit',    prix:0,  cible:'acc_gratuit_desc',    recommande:false },
  { id:'standard',   prix:20, cible:'acc_standard_desc',   recommande:true  },
  { id:'pro',        prix:35, cible:'acc_pro_desc',        recommande:false },
  { id:'entreprise', prix:50, cible:'acc_entreprise_desc', recommande:false },
];

let tarifsPublics = null; // cache du document config/tarifs (public, non-authentifié)
let periodeTarifs = 'mensuel'; // ou 'annuel' — l'annuel vaut 10 mois (2 mois offerts), calculé automatiquement

function promoActive(tarif){
  if(!tarif || !tarif.rabaisPourcent || !tarif.promoDebut || !tarif.promoFin) return false;
  const aujourdhui = new Date().toISOString().slice(0,10);
  return aujourdhui >= tarif.promoDebut && aujourdhui <= tarif.promoFin;
}
function carteTarifHTML(p){
  const tarif = tarifsPublics ? tarifsPublics[p.id] : null;
  const prixMensuel = (tarif && tarif.prix) ? tarif.prix : p.prix;
  const estAnnuel = periodeTarifs === 'annuel';
  const prixBase = estAnnuel ? prixMensuel * 10 : prixMensuel;
  const enPromo = promoActive(tarif);
  const prixAffiche = enPromo ? Math.round(prixBase * (1 - tarif.rabaisPourcent/100)) : prixBase;
  const suffixe = prixMensuel===0 ? '' : (estAnnuel ? t('acc_par_an') : t('acc_par_mois'));
  return `
  <div class="accueil-carte-tarif ${p.recommande?'accueil-recommande':''}">
    ${p.recommande?`<div class="accueil-etiquette">${t('acc_recommande')}</div>`:''}
    <div class="accueil-nom-plan">${t(p.id==='gratuit'?'gratuit':'plan_'+p.id)}</div>
    <div class="accueil-cible-plan">${t(p.cible)}</div>
    ${enPromo ? `<div class="accueil-prix-plan-barre" style="text-decoration:line-through;color:var(--texte-att);font-size:16px;">${moneyUSD(prixBase)}</div>` : ''}
    <div class="accueil-prix-plan">${prixMensuel===0?moneyUSD(0):moneyUSD(prixAffiche)}<span>${suffixe}</span></div>
    ${estAnnuel && prixMensuel>0 ? `<div class="accueil-annuel-note">${t('acc_deux_mois_offerts')}</div>` : ''}
  </div>`;
}

export function renderAccueil(){
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
  <div class="accueil">
    <header class="accueil-header">
      <div class="accueil-marque">${t('acc_marque')}</div>
      <div class="accueil-header-actions">
        <button id="acc-lang" class="mini-link">${nomLangue(prochaineLangue(langue))}</button>
        <button id="acc-connexion" class="btn btn-secondaire">${t('acc_connexion')}</button>
      </div>
    </header>

    <section class="accueil-hero">
      <h1>${t('acc_titre')}</h1>
      <p>${t('acc_souscription')}</p>
      <div class="accueil-hero-cta">
        <button id="acc-essai" class="btn btn-primaire">${t('acc_cta_essai')}</button>
        <button id="acc-demo" class="btn btn-secondaire">${t('acc_cta_demo')}</button>
      </div>
    </section>

    <section class="accueil-section">
      <h2>${t('acc_fonct_titre')}</h2>
      <div class="accueil-grille-fonctionnalites">
        ${FONCTIONNALITES.map(f => `
          <div class="accueil-fonctionnalite">
            <div class="accueil-fonctionnalite-icone">${f.icone}</div>
            <h3>${t(f.titre)}</h3>
            <p>${t(f.texte)}</p>
          </div>`).join('')}
      </div>
    </section>

    <section class="accueil-section accueil-section-tarifs">
      <h2>${t('acc_tarifs_titre')}</h2>
      <p class="accueil-sous-titre">${t('acc_tarifs_souscription')}</p>
      <div class="pill-toggle" style="justify-content:center;margin:0 auto 20px;" id="acc-periode-toggle">
        <button data-periode="mensuel" class="${periodeTarifs==='mensuel'?'active':''}">${t('acc_mensuel')}</button>
        <button data-periode="annuel" class="${periodeTarifs==='annuel'?'active':''}">${t('acc_annuel')}</button>
      </div>
      <div class="accueil-grille-tarifs" id="acc-grille-tarifs">
        ${PLANS.map(carteTarifHTML).join('')}
      </div>
      <p class="accueil-note-devise">${t('acc_equivalent_monnaie_locale')}</p>
    </section>

    <footer class="accueil-footer">
      <h2>${t('acc_footer_titre')}</h2>
      <button id="acc-footer-cta" class="btn btn-primaire">${t('acc_footer_cta')}</button>
    </footer>
  </div>`;

  document.getElementById('acc-lang').addEventListener('click', ()=>setLangue(prochaineLangue(langue), renderAccueil));
  document.getElementById('acc-connexion').addEventListener('click', ()=>renderLogin('connexion'));
  document.getElementById('acc-essai').addEventListener('click', ()=>renderLogin('inscription'));
  document.getElementById('acc-footer-cta').addEventListener('click', ()=>renderLogin('inscription'));
  document.getElementById('acc-demo').addEventListener('click', ()=>{
    renderLogin('connexion');
    const champEmail = document.getElementById('login-email');
    const champPass = document.getElementById('login-pass');
    if(champEmail && champPass){
      champEmail.value = 'admin.test@esig-gn.com';
      champPass.value = 'Demo1234';
      const btn = document.getElementById('login-submit');
      if(btn) btn.click();
    }
  });

  document.querySelectorAll('#acc-periode-toggle button').forEach(b=>b.addEventListener('click', ()=>{
    periodeTarifs = b.dataset.periode;
    document.querySelectorAll('#acc-periode-toggle button').forEach(x=>x.classList.toggle('active', x===b));
    rafraichirGrilleTarifs();
  }));

  chargerTarifsPublics();
}
function rafraichirGrilleTarifs(){
  const grille = document.getElementById('acc-grille-tarifs');
  if(grille) grille.innerHTML = PLANS.map(carteTarifHTML).join('');
}
async function chargerTarifsPublics(){
  if(!tarifsPublics){
    try{
      const snap = await getDoc(doc(db,'config','tarifs'));
      tarifsPublics = snap.exists() ? snap.data() : {};
    }catch(e){
      tarifsPublics = {};
    }
  }
  rafraichirGrilleTarifs();
}
