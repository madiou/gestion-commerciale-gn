import { collection, doc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentUser, currentBoutiqueId } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { todayISO, nowISO, flash, creerMessagePersistant } from './helpers.js';
import { renderContent, nomUtilisateurCourant } from './app-shell.js';

let productionTemp = [];
const messageProduction = creerMessagePersistant(()=>{ renderContent(); wireProduction(); });

export function resetProductionUI(){ productionTemp = []; messageProduction.effacer(); }

export function viewProduction(){
  const optionsMatieres = state.produits.filter(p=>p.type==='matiere_premiere').map(p=>`<option value="${p.id}">${p.numero?p.numero+' — ':''}${p.nom} (stock: ${p.stock})</option>`).join('');
  const optionsFinis = state.produits.filter(p=>p.type!=='matiere_premiere').map(p=>`<option value="${p.id}">${p.numero?p.numero+' — ':''}${p.nom} (stock: ${p.stock})</option>`).join('');
  return `
  ${messageProduction.html('msg-production')}
  <div class="form-wrap">
    <div style="font-size:12px;color:var(--texte-att);margin-bottom:14px;">${t('production_intro')}</div>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('produit_a_fabriquer')}</label><select id="pr-produit-fini">${optionsFinis || `<option value="">${t('aucun_produit_fini_stock')}</option>`}</select></div>
      <div class="champ"><label>${t('quantite_produite')}</label><input type="number" min="1" value="1" id="pr-qte-produite"></div>
    </div>
    <h3 style="margin-top:18px;border:none;padding:0;color:var(--vert-fonce);font-size:14px;">${t('matieres_utilisees')}</h3>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('matiere_premiere')}</label><select id="pr-matiere">${optionsMatieres || `<option value="">${t('aucune_matiere_stock')}</option>`}</select></div>
      <div class="champ"><label>${t('quantite')}</label><input type="number" min="1" value="1" id="pr-qte-matiere"></div>
    </div>
    <button class="btn btn-secondaire" id="pr-add">${t('ajouter_ligne')}</button>
    <div id="pr-lignes-zone">${renderProductionLignesHTML()}</div>
    <div style="margin-top:16px;display:flex;gap:10px;">
      <button class="btn btn-primaire" id="pr-save">${t('enregistrer_production')}</button>
      <button class="btn btn-secondaire" id="pr-cancel">${t('annuler')}</button>
    </div>
  </div>`;
}
function renderProductionLignesHTML(){
  return `
    <table style="margin-top:16px;margin-bottom:6px;">
      <tr><th>N°</th><th>${t('matiere_premiere')}</th><th>${t('quantite')}</th><th></th></tr>
      ${productionTemp.map((l,i)=>`<tr><td>${l.numero||'—'}</td><td>${l.nom}</td><td>${l.qte}</td><td><button class="btn-danger" data-i="${i}" data-role="del-production">✕</button></td></tr>`).join('') || `<tr><td colspan="4" style="color:var(--texte-att);">${t('aucune_matiere_ajoutee')}</td></tr>`}
    </table>`;
}
function refreshProductionLignesZone(){
  document.getElementById('pr-lignes-zone').innerHTML = renderProductionLignesHTML();
  document.querySelectorAll('[data-role="del-production"]').forEach(b=>b.addEventListener('click',()=>{ productionTemp.splice(parseInt(b.dataset.i,10),1); refreshProductionLignesZone(); }));
}
export function wireProduction(){
  const msg = document.getElementById('msg-production');
  document.getElementById('pr-add').addEventListener('click', ()=>{
    const pid = document.getElementById('pr-matiere').value;
    const qte = parseInt(document.getElementById('pr-qte-matiere').value||'0',10);
    const p = state.produits.find(x=>x.id===pid);
    if(!p){ flash(msg, t('selectionner_matiere'), 'err'); return; }
    if(qte<1){ flash(msg,'Quantité invalide.','err'); return; }
    const dejaQte = productionTemp.filter(l=>l.produitId===pid).reduce((s,l)=>s+l.qte,0);
    if(dejaQte+qte > p.stock){ flash(msg,`Stock insuffisant (disponible: ${p.stock}).`,'err'); return; }
    productionTemp.push({produitId:p.id, numero:p.numero||'', nom:p.nom, qte});
    refreshProductionLignesZone();
  });
  refreshProductionLignesZone();
  document.getElementById('pr-cancel').addEventListener('click', ()=>{ productionTemp=[]; renderContent(); wireProduction(); });
  document.getElementById('pr-save').addEventListener('click', (ev)=>{
    if(ev.target.disabled) return;
    if(productionTemp.length===0){ flash(msg, t('ajouter_au_moins_une_matiere'), 'err'); return; }
    const produitFiniId = document.getElementById('pr-produit-fini').value;
    const produitFini = state.produits.find(x=>x.id===produitFiniId);
    if(!produitFini){ flash(msg, t('selectionner_produit_fini'), 'err'); return; }
    const qteProduite = parseInt(document.getElementById('pr-qte-produite').value||'0',10);
    if(qteProduite<1){ flash(msg,'Quantité invalide.','err'); return; }
    ev.target.disabled = true;
    const matieresUtilisees = productionTemp.slice();
    matieresUtilisees.forEach(l=>{
      updateDoc(doc(db,'boutiques',currentBoutiqueId,'produits',l.produitId), { stock: increment(-l.qte) }).catch(e=>console.error('Erreur mise à jour stock matière', e));
    });
    updateDoc(doc(db,'boutiques',currentBoutiqueId,'produits',produitFiniId), { stock: increment(qteProduite) }).catch(e=>console.error('Erreur mise à jour stock produit fini', e));
    setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'productions')), {
      date: todayISO(), dateHeure: nowISO(), produitId: produitFiniId, produitNom: produitFini.nom, qteProduite,
      matieresUtilisees, employeId: currentUser.uid, employeNom: nomUtilisateurCourant()
    }).catch(e=>console.error('Erreur enregistrement production', e));
    productionTemp = [];
    messageProduction.afficher(`${t('production_enregistree')} : ${qteProduite} × ${produitFini.nom}`, 'ok');
  });
}
