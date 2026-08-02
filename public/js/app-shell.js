import { collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { state, limitesDuPlan } from './state.js';
import { t, langue, setLangue, prochaineLangue, nomLangue, traduireRole, traduirePaiement } from './i18n.js';
import { FR, money, todayISO, nowISO, fmtDate, fmtDateHeure } from './helpers.js';
import {
  currentUser, currentBoutiqueId, currentRole, currentView, setCurrentView, modeAdminSeul, estSuperAdmin, abonnementExpire, deconnecter
} from './auth.js';
import { renderLogin } from './view-login.js';
import { viewDashboard, wireDashboard } from './view-dashboard.js';
import { viewVente, wireVente, resetVenteUI, ouvrirDetailVente } from './view-vente.js';
import { viewAchat, wireAchat, resetAchatUI } from './view-achat.js';
import { viewFournisseurs, wireFournisseurs, resetFournisseursUI } from './view-fournisseurs.js';
import { viewStock, wireStock, resetStockUI } from './view-stock.js';
import { viewProduction, wireProduction, resetProductionUI } from './view-production.js';
import { viewClients, wireClients, resetClientsUI } from './view-clients.js';
import { viewFinance, wireFinance } from './view-finance.js';
import { viewRapports, wireRapports } from './view-rapports.js';
import { viewJournal, wireJournal } from './view-journal.js';
import { viewUtilisateurs, wireUtilisateurs } from './view-utilisateurs.js';
import { viewParametres, wireParametres } from './view-parametres.js';
import { viewAdmin, wireAdmin } from './view-admin.js';
import { viewAdminApercu, wireAdminApercu } from './view-admin-apercu.js';
import { viewAudit, wireAudit } from './view-audit.js';
import { viewConnexions, wireConnexions } from './view-connexions.js';
import { viewJournalAdmin, wireJournalAdmin } from './view-journal-admin.js';

import { statutStock, dateFinEssaiGratuit } from './business-logic.js';
export { statutStock, tagStatut } from './business-logic.js';
export function ventesDuJour(){ const t = todayISO(); return state.ventes.filter(v=>v.date===t); }
export function ventesCeMois(){ const prefix = todayISO().slice(0,7); return state.ventes.filter(v=>v.date && v.date.startsWith(prefix)); }
export function nomUtilisateurCourant(){
  const u = state.utilisateurs.find(x=>x.id===currentUser.uid);
  return (u && u.nom) ? u.nom : currentUser.email;
}
export function enregistrerAudit(action, cible, nomCible, details){
  if(!currentBoutiqueId) return;
  const ref = doc(collection(db, 'boutiques', currentBoutiqueId, 'journalAudit'));
  setDoc(ref, {
    action, cible, nomCible: nomCible || '', details: details || '',
    utilisateurNom: nomUtilisateurCourant(),
    utilisateurEmail: currentUser ? currentUser.email : '',
    date: todayISO(), dateHeure: nowISO(),
  }).catch(e=>console.error('Erreur enregistrement audit', e));
}
export function enregistrerJournalAdmin(action, boutiqueId, nomBoutiqueCible, details){
  if(!estSuperAdmin()){ console.warn('[journalAdmin] ignoré : estSuperAdmin() est faux pour', currentUser ? currentUser.email : '(aucun utilisateur)'); return; }
  const ref = doc(collection(db, 'journalAdmin'));
  console.log('[journalAdmin] tentative d\'écriture', action, boutiqueId, nomBoutiqueCible, details);
  setDoc(ref, {
    action, boutiqueId: boutiqueId || '', nomBoutiqueCible: nomBoutiqueCible || '', details: details || '',
    superAdminEmail: currentUser ? currentUser.email : '',
    dateHeure: nowISO(),
  }).then(()=>console.log('[journalAdmin] entrée créée avec succès, id =', ref.id))
    .catch(e=>console.error('[journalAdmin] Erreur enregistrement journal super-admin :', e.code, e.message));
}
export function renderRecuHTML(vente){
  const client = state.clients.find(c=>c.id===vente.clientId);
  const telClient = client && client.telephone ? client.telephone : '';
  return `
  <div class="recu">
    ${state.logoBase64 ? `<div style="text-align:center;margin-bottom:6px;"><img src="${state.logoBase64}" style="max-width:100px;max-height:100px;object-fit:contain;"></div>` : ''}
    ${state.nomBoutique ? `<h2>${state.nomBoutique}</h2>` : `<h2>${t('recu_titre_defaut')}</h2>`}
    ${state.adresseBoutique ? `<div class="sous-titre">${state.adresseBoutique}</div>` : ''}
    ${state.telephoneBoutique ? `<div class="sous-titre">${t('recu_tel')} : ${state.telephoneBoutique}</div>` : ''}
    <hr>
    <table>
      <tr><td>${t('recu_numero')} :</td><td style="text-align:right;">${vente.numeroRecu||'—'}</td></tr>
      <tr><td>${t('recu_date')} :</td><td style="text-align:right;">${fmtDateHeure(vente.dateHeure) !== '—' ? fmtDateHeure(vente.dateHeure) : fmtDate(vente.date)}</td></tr>
    </table>
    <hr>
    <table>
      <tr><td>${t('recu_client')} :</td><td style="text-align:right;">${vente.client}</td></tr>
      ${telClient ? `<tr><td>${t('recu_tel_client')} :</td><td style="text-align:right;">${telClient}</td></tr>` : ''}
      <tr><td>${t('recu_vendu_par')} :</td><td style="text-align:right;">${vente.employeNom||'—'}</td></tr>
      <tr><td>${t('paiement')} :</td><td style="text-align:right;">${traduirePaiement(vente.paiement)}</td></tr>
      ${vente.referenceMobileMoney ? `<tr><td>${t('reference_mobile_money')} :</td><td style="text-align:right;">${vente.referenceMobileMoney}</td></tr>` : ''}
    </table>
    <hr>
    <table>
      <tr><td><strong>${t('recu_article')}</strong></td><td style="text-align:center;"><strong>${t('recu_qte')}</strong></td><td style="text-align:right;"><strong>${t('recu_pu')}</strong></td><td style="text-align:right;"><strong>${t('montant')}</strong></td></tr>
      ${vente.lignes.map(l=>`<tr><td>${l.nom}</td><td style="text-align:center;">${l.qte}</td><td style="text-align:right;">${FR.format(l.prix_vente)}</td><td style="text-align:right;">${FR.format(l.qte*l.prix_vente)}</td></tr>`).join('')}
    </table>
    <hr>
    <div class="total-recu">${t('recu_total')} : ${money(vente.total)}</div>
    <div class="pied">
      ${t('recu_merci')}
      ${state.telephoneBoutique ? `<br>${state.telephoneBoutique}` : ''}
      <br><span style="font-size:10px;">${t('recu_imprime_le')} ${fmtDateHeure(new Date().toISOString())}</span>
    </div>
  </div>`;
}
export function imprimerRecu(vente){
  document.getElementById('recu-imprimable').innerHTML = renderRecuHTML(vente);
  window.print();
}
export function exporterRecuPDF(vente){
  if(!window.jspdf || !window.jspdf.jsPDF){
    alert(t('pdf_pas_pret'));
    return;
  }
  // Intl.NumberFormat('fr-FR') sépare les milliers avec un espace insécable fin (U+202F),
  // hors de l'encodage Latin-1 des polices standard de jsPDF : le texte s'affichait corrompu
  // au-delà du premier caractère non supporté. On utilise donc un espace ASCII classique ici,
  // uniquement pour le PDF (l'affichage HTML normal, lui, gère l'Unicode sans problème).
  const chiffresPDF = n => Math.round(n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const moneyPDF = n => `${chiffresPDF(n)} GNF`;
  const { jsPDF } = window.jspdf;
  const largeur = 80, marge = 4, largeurUtile = largeur - marge*2;
  const doc = new jsPDF({ unit:'mm', format:[largeur, 297] });
  let y = marge + 4;

  const ligneCentree = (texte, taille, gras) => {
    doc.setFontSize(taille);
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.text(texte, largeur/2, y, { align:'center', maxWidth:largeurUtile });
    y += taille*0.42;
  };
  const traitPointille = () => {
    y += 1.5;
    doc.setLineDashPattern([0.8,0.8], 0);
    doc.line(marge, y, largeur-marge, y);
    doc.setLineDashPattern([], 0);
    y += 3.5;
  };
  const ligneLabelValeur = (label, valeur) => {
    doc.setFontSize(8.5);
    doc.setFont('helvetica','normal');
    doc.text(label, marge, y);
    doc.text(String(valeur), largeur-marge, y, { align:'right' });
    y += 4.2;
  };

  if(state.logoBase64){
    try{
      const tailleLogo = 16;
      doc.addImage(state.logoBase64, largeur/2 - tailleLogo/2, y-2, tailleLogo, tailleLogo);
      y += tailleLogo + 2;
    }catch(e){ /* logo illisible par jsPDF (format exotique) : on continue sans */ }
  }
  ligneCentree(state.nomBoutique || t('recu_titre_defaut'), 12, true);
  if(state.adresseBoutique) ligneCentree(state.adresseBoutique, 8, false);
  if(state.telephoneBoutique) ligneCentree(`${t('recu_tel')} : ${state.telephoneBoutique}`, 8, false);
  traitPointille();

  ligneLabelValeur(`${t('recu_numero')} :`, vente.numeroRecu||'—');
  ligneLabelValeur(`${t('recu_date')} :`, fmtDateHeure(vente.dateHeure) !== '—' ? fmtDateHeure(vente.dateHeure) : fmtDate(vente.date));
  traitPointille();

  const client = state.clients.find(c=>c.id===vente.clientId);
  const telClient = client && client.telephone ? client.telephone : '';
  ligneLabelValeur(`${t('recu_client')} :`, vente.client);
  if(telClient) ligneLabelValeur(`${t('recu_tel_client')} :`, telClient);
  ligneLabelValeur(`${t('recu_vendu_par')} :`, vente.employeNom||'—');
  ligneLabelValeur(`${t('paiement')} :`, traduirePaiement(vente.paiement));
  if(vente.referenceMobileMoney) ligneLabelValeur(`${t('reference_mobile_money')} :`, vente.referenceMobileMoney);
  traitPointille();

  doc.setFontSize(8);
  doc.setFont('helvetica','bold');
  doc.text(t('recu_article'), marge, y);
  doc.text(t('recu_qte'), largeur*0.58, y, { align:'center' });
  doc.text(t('montant'), largeur-marge, y, { align:'right' });
  y += 4;
  doc.setFont('helvetica','normal');
  vente.lignes.forEach(l=>{
    const nomLignes = doc.splitTextToSize(l.nom, largeur*0.52 - marge);
    doc.text(nomLignes, marge, y);
    doc.text(String(l.qte), largeur*0.58, y, { align:'center' });
    doc.text(chiffresPDF(l.qte*l.prix_vente), largeur-marge, y, { align:'right' });
    y += Math.max(4, nomLignes.length*3.6);
  });
  traitPointille();

  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.text(`${t('recu_total')} : ${moneyPDF(vente.total)}`, largeur-marge, y, { align:'right' });
  y += 7;

  doc.setFontSize(7.5);
  doc.setFont('helvetica','normal');
  ligneCentree(t('recu_merci'), 7.5, false);
  if(state.telephoneBoutique) ligneCentree(state.telephoneBoutique, 7.5, false);
  ligneCentree(`${t('recu_imprime_le')} ${fmtDateHeure(new Date().toISOString())}`, 6.5, false);

  doc.save(`${vente.numeroRecu||'recu'}.pdf`);
}
export function debutPeriode(periode){
  const d = new Date();
  if(periode==='semaine') d.setDate(d.getDate()-7);
  else if(periode==='mois') d.setMonth(d.getMonth()-1);
  else if(periode==='trimestre') d.setMonth(d.getMonth()-3);
  else if(periode==='semestre') d.setMonth(d.getMonth()-6);
  else if(periode==='annee') d.setFullYear(d.getFullYear()-1);
  return d.toISOString().slice(0,10);
}
export function exporterCSV(nomFichier, entetes, lignes){
  const echapper = v => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const contenu = [entetes, ...lignes].map(ligne => ligne.map(echapper).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
export function exporterSauvegardeComplete(){
  const sauvegarde = {
    exporteLe: nowISO(),
    boutique: {
      nom: state.nomBoutique, adresse: state.adresseBoutique, telephone: state.telephoneBoutique,
      plan: state.plan, dateExpirationAbonnement: state.dateExpirationAbonnement
    },
    produits: state.produits, ventes: state.ventes, achats: state.achats, depenses: state.depenses,
    clients: state.clients, utilisateurs: state.utilisateurs, paiements: state.paiements,
    fournisseurs: state.fournisseurs, paiementsFournisseurs: state.paiementsFournisseurs,
    productions: state.productions, retours: state.retours, journalAudit: state.journalAudit
  };
  const contenu = JSON.stringify(sauvegarde, null, 2);
  const blob = new Blob([contenu], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const nomBoutiqueFichier = (state.nomBoutique || 'boutique').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `sauvegarde_${nomBoutiqueFichier}_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let online = navigator.onLine;
window.addEventListener('online', ()=>{ online=true; updateBadgeSync(); });
window.addEventListener('offline', ()=>{ online=false; updateBadgeSync(); });

// Raccourci Ctrl+K / Cmd+K : focus la recherche globale depuis n'importe où.
// Enregistré une seule fois au chargement du module (pas dans render(), qui tourne à
// chaque mise à jour Firestore) pour ne jamais empiler plusieurs écouteurs identiques.
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
    const input = document.getElementById('recherche-globale');
    if(input){
      e.preventDefault();
      input.focus();
      input.select();
    }
  }
});
function updateBadgeSync(){
  const b = document.getElementById('badge-sync');
  if(!b) return;
  b.textContent = online ? t('synchronise') : t('hors_ligne');
  b.className = 'badge-sync ' + (online?'':'hors-ligne');
}

export function renderAbonnementExpire(){
  const estEssaiGratuit = state.plan === 'gratuit';
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <h2>${estEssaiGratuit ? t('essai_gratuit_expire_titre') : t('abonnement_expire_titre')}</h2>
      <p>${estEssaiGratuit ? t('essai_gratuit_expire_texte') : t('abonnement_expire_texte')}</p>
      <button class="btn btn-primaire" id="ae-logout" style="width:100%;">${t('deconnexion')}</button>
    </div>
  </div>`;
  document.getElementById('ae-logout').addEventListener('click', ()=>deconnecter());
}
const TITRES_ADMIN_SEUL = {
  apercu: () => [t('nav_apercu'), t('apercu_sous_titre')],
  admin: () => [t('nav_admin'), t('admin_sous_titre')],
  connexions: () => [t('nav_connexions'), t('connexions_sous_titre')],
  'journal-admin': () => [t('nav_journal_admin'), t('journal_admin_sous_titre')]
};
export function renderAdminSeul(){
  if(!TITRES_ADMIN_SEUL[currentView]) currentView = 'apercu';
  const [titre, sousTitre] = TITRES_ADMIN_SEUL[currentView]();
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
  <div class="app">
    <div class="sidebar">
      <div class="sidebar-brand">
        <div class="titre">Gestion Commerciale</div>
        <div class="sous">${currentUser.email} · Super-admin</div>
      </div>
      <div class="nav">
        ${navBtn('apercu','&#128200;',t('nav_apercu'))}
        ${navBtn('admin','&#128737;',t('nav_admin'))}
        ${navBtn('connexions','&#128274;',t('nav_connexions'))}
        ${navBtn('journal-admin','&#128220;',t('nav_journal_admin'))}
      </div>
      <div class="sidebar-foot">
        <button id="btn-lang">${nomLangue(prochaineLangue(langue))}</button><br>
        <button id="btn-logout">${t('deconnexion')}</button>
      </div>
    </div>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <div class="main">
      <div class="topbar">
        <button class="hamburger" id="btn-menu" aria-label="Menu">&#9776;</button>
        <div><h1>${titre}</h1><div class="fil">${sousTitre}</div></div>
      </div>
      <div class="content" id="content"></div>
    </div>
  </div>`;
  document.getElementById('btn-logout').addEventListener('click', ()=>deconnecter());
  document.getElementById('btn-lang').addEventListener('click', ()=>setLangue(prochaineLangue(langue), render));
  const fermerMenu = wireMenuMobile();
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.addEventListener('click', ()=>{ setCurrentView(b.dataset.view); fermerMenu(); renderAdminSeul(); });
  });
  if(currentView==='apercu'){ document.getElementById('content').innerHTML = viewAdminApercu(); wireAdminApercu(); }
  if(currentView==='admin'){ document.getElementById('content').innerHTML = viewAdmin(); wireAdmin(); }
  if(currentView==='connexions'){ document.getElementById('content').innerHTML = viewConnexions(); wireConnexions(); }
  if(currentView==='journal-admin'){ document.getElementById('content').innerHTML = viewJournalAdmin(); wireJournalAdmin(); }
}
function wireMenuMobile(){
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const btnMenu = document.getElementById('btn-menu');
  const fermer = ()=>{ sidebar.classList.remove('open'); backdrop.classList.remove('visible'); };
  if(btnMenu) btnMenu.addEventListener('click', ()=>{ sidebar.classList.toggle('open'); backdrop.classList.toggle('visible'); });
  if(backdrop) backdrop.addEventListener('click', fermer);
  return fermer;
}
function rechercheGlobale(q){
  const rq = q.trim().toLowerCase();
  if(rq.length<2) return { produits:[], clients:[], ventes:[] };
  const produits = state.produits.filter(p=>p.nom.toLowerCase().includes(rq) || (p.numero||'').toLowerCase().includes(rq)).slice(0,5);
  const clients = state.clients.filter(c=>c.nom.toLowerCase().includes(rq) || (c.telephone||'').includes(rq)).slice(0,5);
  const ventes = state.ventes.filter(v=>(v.client||'').toLowerCase().includes(rq) || (v.numeroRecu||'').toLowerCase().includes(rq)).slice(0,5);
  return { produits, clients, ventes };
}
function rechercheDropdownHTML(q){
  if(q.trim().length<2) return '';
  const r = rechercheGlobale(q);
  const total = r.produits.length + r.clients.length + r.ventes.length;
  if(total===0) return `<div class="recherche-dropdown"><div class="recherche-vide">${t('aucun_resultat')}</div></div>`;
  const groupe = (titre,items,rendu)=> items.length ? `<div class="recherche-groupe"><div class="recherche-titre-groupe">${titre}</div>${items.map(rendu).join('')}</div>` : '';
  return `<div class="recherche-dropdown">
    ${groupe(t('nav_stock'), r.produits, p=>`<button type="button" class="recherche-item" data-type="produit" data-id="${p.id}"><span class="ri-nom">${p.nom}</span><span class="ri-meta">${t('restant')}: ${p.stock}</span></button>`)}
    ${groupe(t('nav_clients'), r.clients, c=>`<button type="button" class="recherche-item" data-type="client" data-id="${c.id}"><span class="ri-nom">${c.nom}</span><span class="ri-meta">${c.telephone||''}</span></button>`)}
    ${groupe(t('nav_vente'), r.ventes, v=>`<button type="button" class="recherche-item" data-type="vente" data-id="${v.id}"><span class="ri-nom">${v.client}</span><span class="ri-meta">${money(v.total)} · ${fmtDate(v.date)}</span></button>`)}
  </div>`;
}
function resetTouteLesVues(){
  resetVenteUI(); resetAchatUI(); resetStockUI(); resetClientsUI(); resetFournisseursUI(); resetProductionUI();
}
function wireRechercheItems(){
  document.querySelectorAll('.recherche-item').forEach(btn=>{
    btn.addEventListener('mousedown', e=>e.preventDefault());
    btn.addEventListener('click', ()=>{
      const { type, id } = btn.dataset;
      if(type==='produit'){
        const nom = state.produits.find(p=>p.id===id)?.nom || '';
        setCurrentView('stock'); resetTouteLesVues(); render();
        const champ = document.getElementById('s-recherche');
        if(champ){ champ.value = nom; champ.dispatchEvent(new Event('input')); }
      } else if(type==='client'){
        const nom = state.clients.find(c=>c.id===id)?.nom || '';
        setCurrentView('clients'); resetTouteLesVues(); render();
        const champ = document.getElementById('c-recherche');
        if(champ){ champ.value = nom; champ.dispatchEvent(new Event('input')); }
      } else if(type==='vente'){
        setCurrentView('vente'); resetTouteLesVues(); ouvrirDetailVente(id); render();
      }
    });
  });
}
function wireRechercheGlobale(){
  const input = document.getElementById('recherche-globale');
  const dropdown = document.getElementById('recherche-dropdown-conteneur');
  if(!input || !dropdown) return;
  const rafraichir = ()=>{ dropdown.innerHTML = rechercheDropdownHTML(input.value); wireRechercheItems(); };
  input.addEventListener('input', rafraichir);
  input.addEventListener('focus', ()=>{ if(input.value.trim().length>=2) rafraichir(); });
  input.addEventListener('blur', ()=>{ dropdown.innerHTML=''; });
  input.addEventListener('keydown', e=>{ if(e.key==='Escape'){ input.value=''; dropdown.innerHTML=''; input.blur(); } });
}

export function render(){
  if(!currentUser) return renderLogin();
  if(modeAdminSeul) return renderAdminSeul();
  if(abonnementExpire() && !estSuperAdmin()) return renderAbonnementExpire();
  const produitsBasCount = state.produits.filter(p=>statutStock(p)!=='ok').length;
  const limitesActuelles = limitesDuPlan(state.plan);
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
  <div class="app">
    <div class="sidebar">
      <div class="sidebar-brand">
        ${state.logoBase64 ? `<img src="${state.logoBase64}" style="max-width:100%;max-height:50px;object-fit:contain;margin-bottom:8px;">` : ''}
        <div class="titre">${state.nomBoutique || 'Gestion Commerciale'}</div>
        <div class="sous">${currentUser.email} · ${traduireRole(currentRole)}</div>
      </div>
      <div class="nav">
        ${navBtn('dashboard','&#9632;',t('nav_dashboard'))}
        ${navBtn('vente','&#128176;',t('nav_vente'))}
        ${currentRole!=='Vendeur' ? navBtn('achat','&#128230;',t('nav_achat')) : ''}
        ${currentRole!=='Vendeur' ? navBtn('fournisseurs','&#128666;',t('nav_fournisseurs')) : ''}
        ${navBtn('stock','&#128203;',t('nav_stock'), produitsBasCount)}
        ${currentRole!=='Vendeur' ? navBtn('production','&#127859;',t('nav_production')) : ''}
        ${navBtn('clients','&#128100;',t('nav_clients'))}
        ${currentRole!=='Vendeur' ? navBtn('finance','&#128179;',t('nav_finance')) : ''}
        ${currentRole!=='Vendeur' ? navBtn('rapports','&#128202;',t('nav_rapports')) : ''}
        ${currentRole!=='Vendeur' ? navBtn('journal','&#128220;',t('nav_journal')) : ''}
        ${currentRole==='Propriétaire' ? navBtn('utilisateurs','&#128101;',t('nav_utilisateurs')) : ''}
        ${currentRole==='Propriétaire' ? navBtn('audit','&#128269;',t('nav_audit')) : ''}
        ${currentRole==='Propriétaire' ? navBtn('parametres','&#9881;',t('nav_parametres')) : ''}
        ${estSuperAdmin() ? navBtn('apercu','&#128200;',t('nav_apercu')) : ''}
        ${estSuperAdmin() ? navBtn('admin','&#128737;',t('nav_admin')) : ''}
        ${estSuperAdmin() ? navBtn('connexions','&#128274;',t('nav_connexions')) : ''}
        ${estSuperAdmin() ? navBtn('journal-admin','&#128220;',t('nav_journal_admin')) : ''}
      </div>
      <div class="sidebar-foot">
        ${t('compte_connecte')}
        <div style="margin:8px 0;padding:8px 10px;background:rgba(255,255,255,0.06);border-radius:5px;">
          ${t('plan')} <strong>${libellePlan(state.plan)}</strong><br>
          ${t('produits_label')} : ${state.produits.length}${isFinite(limitesActuelles.produits)?'/'+limitesActuelles.produits:''}<br>
          ${t('ventes_mois_label')} : ${ventesCeMois().length}${isFinite(limitesActuelles.ventesMois)?'/'+limitesActuelles.ventesMois:''}
          ${state.plan!=='gratuit'
            ? `<br>${t('abonnement_valide_jusquau')} ${state.dateExpirationAbonnement?fmtDate(state.dateExpirationAbonnement):'—'}`
            : (state.dateCreation ? `<br>${t('essai_gratuit_jusquau')} ${fmtDate(dateFinEssaiGratuit(state.dateCreation))}` : '')}
        </div>
        ${state.plan==='entreprise' ? `<a href="${lienSupportWhatsApp()}" target="_blank" rel="noopener" class="btn btn-primaire" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px;">💬 ${t('support_whatsapp')}</a>` : ''}
        <button id="btn-lang">${nomLangue(prochaineLangue(langue))}</button><br>
        <button id="btn-logout">${t('deconnexion')}</button>
      </div>
    </div>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <div class="main">
      <div class="topbar">
        <button class="hamburger" id="btn-menu" aria-label="Menu">&#9776;</button>
        <div>
          <h1>${titreVue()}</h1>
          <div class="fil">${sousTitreVue()}</div>
        </div>
        <div class="recherche-globale-wrap">
          <input type="text" id="recherche-globale" class="search-box" placeholder="${t('rechercher_global')}" autocomplete="off">
          <kbd class="recherche-raccourci">Ctrl+K</kbd>
          <div id="recherche-dropdown-conteneur"></div>
        </div>
        <div class="badge-sync" id="badge-sync">${t('synchronise')}</div>
      </div>
      <div class="content" id="content"></div>
    </div>
  </div>`;
  const fermerMenu = wireMenuMobile();
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      setCurrentView(b.dataset.view);
      resetVenteUI(); resetAchatUI(); resetStockUI(); resetClientsUI(); resetFournisseursUI(); resetProductionUI();
      fermerMenu();
      render();
    });
  });
  document.getElementById('btn-logout').addEventListener('click', ()=>deconnecter());
  document.getElementById('btn-lang').addEventListener('click', ()=>setLangue(prochaineLangue(langue), render));
  wireRechercheGlobale();
  updateBadgeSync();
  renderContent();
}
function navBtn(view,icon,label,badge){ return `<button class="nav-btn ${currentView===view?'active':''}" data-view="${view}"><span class="ic">${icon}</span> ${label}${badge?`<span class="nav-badge">${badge}</span>`:''}</button>`; }
function libellePlan(plan){ return { gratuit:t('gratuit'), standard:t('plan_standard'), pro:t('plan_pro'), entreprise:t('plan_entreprise'), payant:t('payant') }[plan] || plan; }
const NUMERO_WHATSAPP_SUPPORT = '15148062263'; // support prioritaire réservé au plan Entreprise
function lienSupportWhatsApp(){
  const message = t('whatsapp_message_support').replace('{boutique}', state.nomBoutique || '—');
  return `https://wa.me/${NUMERO_WHATSAPP_SUPPORT}?text=${encodeURIComponent(message)}`;
}
function titreVue(){ return {dashboard:t('nav_dashboard'), vente:t('nav_vente'), achat:t('nav_achat'), fournisseurs:t('nav_fournisseurs'), stock:t('nav_stock'), production:t('nav_production'), clients:t('nav_clients'), finance:t('nav_finance'), rapports:t('nav_rapports'), journal:t('nav_journal'), utilisateurs:t('nav_utilisateurs'), audit:t('nav_audit'), parametres:t('nav_parametres'), admin:t('nav_admin'), connexions:t('nav_connexions'), apercu:t('nav_apercu'), 'journal-admin':t('nav_journal_admin')}[currentView]; }
function sousTitreVue(){ return {dashboard:t('sous_titre_jour')+' — '+fmtDate(todayISO()), vente:t('saisie_vente'), achat:t('saisie_achat'), fournisseurs:state.fournisseurs.length+' '+t('fournisseurs_enregistres'), stock:state.produits.length+' '+t('produits_enregistres'), production:t('saisie_production'), clients:state.clients.length+' '+t('clients_enregistres'), finance:t('suivi_financier'), rapports:t('synthese_periode'), journal:t('synthese_periode'), utilisateurs:state.utilisateurs.length+' '+t('utilisateur_s'), audit:t('audit_sous_titre'), parametres:t('infos_boutique'), admin:t('admin_sous_titre'), connexions:t('connexions_sous_titre'), apercu:t('apercu_sous_titre'), 'journal-admin':t('journal_admin_sous_titre')}[currentView]; }

export function renderContent(){
  const c = document.getElementById('content');
  if(currentView==='dashboard'){ c.innerHTML = viewDashboard(); wireDashboard(); }
  if(currentView==='vente'){ c.innerHTML = viewVente(); wireVente(); }
  if(currentView==='achat' && currentRole!=='Vendeur'){ c.innerHTML = viewAchat(); wireAchat(); }
  if(currentView==='fournisseurs' && currentRole!=='Vendeur'){ c.innerHTML = viewFournisseurs(); wireFournisseurs(); }
  if(currentView==='stock'){ c.innerHTML = viewStock(); wireStock(); }
  if(currentView==='production' && currentRole!=='Vendeur'){ c.innerHTML = viewProduction(); wireProduction(); }
  if(currentView==='clients'){ c.innerHTML = viewClients(); wireClients(); }
  if(currentView==='finance' && currentRole!=='Vendeur'){ c.innerHTML = viewFinance(); wireFinance(); }
  if(currentView==='rapports' && currentRole!=='Vendeur'){ c.innerHTML = viewRapports(); wireRapports(); }
  if(currentView==='journal' && currentRole!=='Vendeur'){ c.innerHTML = viewJournal(); wireJournal(); }
  if(currentView==='utilisateurs' && currentRole==='Propriétaire'){ c.innerHTML = viewUtilisateurs(); wireUtilisateurs(); }
  if(currentView==='audit' && currentRole==='Propriétaire'){ c.innerHTML = viewAudit(); wireAudit(); }
  if(currentView==='parametres' && currentRole==='Propriétaire'){ c.innerHTML = viewParametres(); wireParametres(); }
  if(currentView==='admin' && estSuperAdmin()){ c.innerHTML = viewAdmin(); wireAdmin(); }
  if(currentView==='connexions' && estSuperAdmin()){ c.innerHTML = viewConnexions(); wireConnexions(); }
  if(currentView==='apercu' && estSuperAdmin()){ c.innerHTML = viewAdminApercu(); wireAdminApercu(); }
  if(currentView==='journal-admin' && estSuperAdmin()){ c.innerHTML = viewJournalAdmin(); wireJournalAdmin(); }
}
