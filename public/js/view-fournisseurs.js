import { collection, doc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentUser, currentBoutiqueId, currentRole } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { money, nowISO, todayISO, flash } from './helpers.js';
import { renderContent, nomUtilisateurCourant, enregistrerAudit } from './app-shell.js';
import { detteFournisseur, avanceFournisseur, soldeFournisseur } from './business-logic.js';
import { demanderConfirmationMotDePasse } from './confirmation-securisee.js';
export { detteFournisseur } from './business-logic.js';

let showNouveauFournisseur = false;
let fournisseurEnPaiement = null;

export function resetFournisseursUI(){ showNouveauFournisseur = false; fournisseurEnPaiement = null; }

function libelleSolde(solde){
  if(solde > 0) return `${t('dette_en_cours')} : <strong>${money(solde)}</strong>`;
  if(solde < 0) return `${t('avance_en_cours')} : <strong>${money(-solde)}</strong>`;
  return `<strong>${t('solde_equilibre')}</strong>`;
}
function badgeSolde(solde){
  if(solde > 0) return `<span class="tag bas">${t('dette')} : ${money(solde)}</span>`;
  if(solde < 0) return `<span class="tag ok">${t('avance')} : ${money(-solde)}</span>`;
  return `<span class="tag ok">0 GNF</span>`;
}

export function viewFournisseurs(){
  const fPaie = fournisseurEnPaiement ? state.fournisseurs.find(f=>f.id===fournisseurEnPaiement) : null;
  return `
  <div class="msg ok" id="msg-fournisseurs"></div>
  <div class="toolbar-stock">
    <input class="search-box" type="text" id="f-recherche" placeholder="${t('rechercher_fournisseur')}">
    <button class="btn btn-primaire" id="f-nouveau">${t('nouveau_fournisseur')}</button>
  </div>
  <div class="form-wrap ${showNouveauFournisseur?'':'hidden'}" id="f-form" style="margin-bottom:18px;">
    <div class="form-grid cols3">
      <div class="champ"><label>${t('nom_fournisseur')}</label><input type="text" id="nf-nom"></div>
      <div class="champ"><label>${t('telephone')}</label><input type="text" id="nf-tel" placeholder="Ex : 622 00 00 00"></div>
      <div class="champ"><label>${t('adresse')}</label><input type="text" id="nf-adresse"></div>
    </div>
    <div class="champ" style="margin-bottom:14px;"><label>${t('notes')}</label><input type="text" id="nf-notes"></div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="nf-save">${t('ajouter_fournisseur')}</button>
      <button class="btn btn-secondaire" id="nf-cancel">${t('annuler')}</button>
    </div>
  </div>
  <div class="form-wrap ${fPaie?'':'hidden'}" id="pf-form" style="margin-bottom:18px;">
    ${fPaie ? `
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${t('payer_fournisseur')} — ${fPaie.nom}</h3>
    <div style="font-size:13px;color:var(--texte-att);margin-bottom:12px;">${libelleSolde(soldeFournisseur(fPaie))}</div>
    <div style="font-size:12px;color:var(--texte-att);margin-bottom:12px;">${t('note_accompte_fournisseur')}</div>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('montant')}</label><input type="number" min="1" id="pf-montant"></div>
      <div class="champ"><label>${t('produit_concerne')} (${t('optionnel')})</label><input type="text" id="pf-produit" placeholder="${t('produit_concerne_exemple')}"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="pf-save">${t('enregistrer_paiement')}</button>
      <button class="btn btn-secondaire" id="pf-cancel">${t('annuler')}</button>
    </div>` : ''}
  </div>
  <div class="stock-panel"><table id="f-table"></table></div>`;
}
function renderFournisseurRows(filtre){
  const tbl = document.getElementById('f-table');
  const fl = (filtre||'').toLowerCase();
  const rows = state.fournisseurs.filter(f=>!fl || f.nom.toLowerCase().includes(fl) || (f.telephone||'').toLowerCase().includes(fl));
  tbl.innerHTML = `<tr><th>${t('nav_fournisseurs')}</th><th>${t('telephone')}</th><th>${t('adresse')}</th><th>${t('solde')}</th><th></th></tr>` +
    rows.map(f=>{
      const solde = soldeFournisseur(f);
      const boutonPayer = `<button class="btn-secondaire" style="padding:5px 10px;font-size:12px;margin-right:6px;" data-id="${f.id}" data-role="payer-fournisseur">${t('payer')}</button>`;
      const boutonSupprimer = currentRole==='Propriétaire' ? `<button class="btn-danger" data-id="${f.id}" data-role="del-fournisseur">${t('supprimer')}</button>` : '';
      return `<tr><td>${f.nom}</td><td>${f.telephone||'—'}</td><td>${f.adresse||'—'}</td><td>${badgeSolde(solde)}</td><td>${boutonPayer}${boutonSupprimer}</td></tr>`;
    }).join('') || `<tr><td colspan="5" style="color:var(--texte-att);">${t('aucun_fournisseur')}</td></tr>`;
  document.querySelectorAll('[data-role="del-fournisseur"]').forEach(b=>b.addEventListener('click', ()=>{
    const fournisseur = state.fournisseurs.find(f=>f.id===b.dataset.id);
    demanderConfirmationMotDePasse({
      titre: t('confirmer_suppression_fournisseur_titre'),
      message: t('confirmer_suppression_fournisseur_message'),
      onConfirme: () => {
        deleteDoc(doc(db,'boutiques',currentBoutiqueId,'fournisseurs',b.dataset.id)).catch(e=>console.error('Erreur suppression fournisseur', e));
        enregistrerAudit('suppression', 'fournisseur', fournisseur ? fournisseur.nom : b.dataset.id);
      }
    });
  }));
  document.querySelectorAll('[data-role="payer-fournisseur"]').forEach(b=>b.addEventListener('click', ()=>{
    fournisseurEnPaiement = b.dataset.id;
    showNouveauFournisseur = false;
    renderContent(); wireFournisseurs();
    document.getElementById('pf-form').scrollIntoView({behavior:'smooth'});
  }));
}
export function wireFournisseurs(){
  renderFournisseurRows('');
  document.getElementById('f-recherche').addEventListener('input', e=>renderFournisseurRows(e.target.value));
  document.getElementById('f-nouveau').addEventListener('click', ()=>{ showNouveauFournisseur=true; fournisseurEnPaiement=null; renderContent(); wireFournisseurs(); });
  if(showNouveauFournisseur){
    document.getElementById('nf-cancel').addEventListener('click', ()=>{ showNouveauFournisseur=false; renderContent(); wireFournisseurs(); });
    document.getElementById('nf-save').addEventListener('click', (ev)=>{
      if(ev.target.disabled) return;
      const msg = document.getElementById('msg-fournisseurs');
      const nom = document.getElementById('nf-nom').value.trim();
      if(!nom){ flash(msg,'Le nom du fournisseur est requis.','err'); return; }
      ev.target.disabled = true;
      const fournisseur = { nom, telephone:document.getElementById('nf-tel').value.trim(), adresse:document.getElementById('nf-adresse').value.trim(), notes:document.getElementById('nf-notes').value.trim(), dateAjout:nowISO() };
      setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'fournisseurs')), fournisseur).catch(e=>console.error('Erreur création fournisseur', e));
      enregistrerAudit('creation', 'fournisseur', nom);
      showNouveauFournisseur = false;
      flash(msg, `Fournisseur "${nom}" ajouté.`, 'ok');
      renderContent(); wireFournisseurs();
    });
  }
  if(fournisseurEnPaiement){
    const fPaie = state.fournisseurs.find(f=>f.id===fournisseurEnPaiement);
    document.getElementById('pf-cancel').addEventListener('click', ()=>{ fournisseurEnPaiement=null; renderContent(); wireFournisseurs(); });
    document.getElementById('pf-save').addEventListener('click', (ev)=>{
      if(ev.target.disabled) return;
      const msg = document.getElementById('msg-fournisseurs');
      const montant = parseInt(document.getElementById('pf-montant').value||'0',10);
      const produitConcerne = document.getElementById('pf-produit').value.trim();
      if(montant<1){ flash(msg,'Montant invalide.','err'); return; }
      ev.target.disabled = true;
      const soldeAvant = soldeFournisseur(fPaie);
      // Si aucune dette n'était en cours (solde déjà à 0 ou déjà en avance), ce paiement est un
      // accompte versé avant réception de marchandise plutôt qu'un règlement de dette existante —
      // distinction utilisée pour l'affichage dans le Journal (voir construireJournal()).
      const estAvance = soldeAvant <= 0;
      setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'paiementsFournisseurs')), {
        fournisseurId: fPaie.id, fournisseurNom: fPaie.nom, montant, produitConcerne, estAvance,
        date:todayISO(), dateHeure:nowISO(),
        employeId:currentUser.uid, employeNom:nomUtilisateurCourant()
      }).catch(e=>console.error('Erreur enregistrement paiement fournisseur', e));
      const nouveauSolde = soldeAvant - montant;
      enregistrerAudit('remboursement', 'fournisseur', fPaie.nom, `${estAvance?t('avance'):t('dette')} : ${money(montant)}${produitConcerne?' — '+produitConcerne:''}`);
      fournisseurEnPaiement = null;
      flash(msg, `${t('paiement_de')} ${money(montant)} ${t('enregistre_pour')} ${fPaie.nom}. ${libelleSolde(nouveauSolde).replace(/<\/?strong>/g,'')}`, 'ok');
      renderContent(); wireFournisseurs();
    });
  }
}
