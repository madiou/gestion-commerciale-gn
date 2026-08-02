import { collection, doc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentUser, currentBoutiqueId } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { FR, money, nowISO, datetimeLocalParDefaut, flash, creerMessagePersistant } from './helpers.js';
import { renderContent, nomUtilisateurCourant } from './app-shell.js';
import { avanceFournisseur } from './business-logic.js';

let achatTemp = [];
const messageAchat = creerMessagePersistant(()=>{ renderContent(); wireAchat(); });

export function resetAchatUI(){ achatTemp = []; messageAchat.effacer(); }

export function viewAchat(){
  const options = state.produits.map(p=>`<option value="${p.id}">${p.numero?p.numero+' — ':''}${p.nom} (stock: ${p.stock})</option>`).join('');
  return `
  ${messageAchat.html('msg-achat')}
  <div class="form-wrap">
    <div class="form-grid cols3">
      <div class="champ"><label>${t('date_heure')}</label><input type="datetime-local" id="a-datetime" value="${datetimeLocalParDefaut()}"></div>
      <div class="champ"><label>${t('fournisseur')}</label><input type="text" id="a-fournisseur" placeholder="Ex : Grossiste Kaloum" list="a-fournisseurs-datalist"><datalist id="a-fournisseurs-datalist">${state.fournisseurs.map(f=>`<option value="${f.nom}">`).join('')}</datalist><div id="a-avance-note" style="font-size:11.5px;color:var(--vert);margin-top:4px;"></div></div>
      <div class="champ"><label>${t('produit')}</label><select id="a-produit">${options || `<option value="">${t('aucun_produit_stock')}</option>`}</select></div>
    </div>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('quantite_recue')}</label><input type="number" min="1" value="1" id="a-qte"></div>
    </div>
    <button class="btn btn-secondaire" id="a-add">${t('ajouter_ligne')}</button>
    <div id="a-lignes-zone">${renderAchatLignesHTML()}</div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="champ"><label>${t('paiement')}</label><select id="a-paiement"><option value="Espèces">${t('especes')}</option><option value="Dette fournisseur">${t('dette_fournisseur')}</option></select></div>
      <div class="champ hidden" id="a-montant-paye-zone"><label>${t('montant_non_paye')}</label><input type="number" min="0" id="a-montant-paye"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;">
      <button class="btn btn-primaire" id="a-save">${t('enregistrer_achat')}</button>
      <button class="btn btn-secondaire" id="a-cancel">${t('annuler')}</button>
    </div>
  </div>`;
}
function renderAchatLignesHTML(){
  const totalTemp = achatTemp.reduce((s,l)=>s+l.qte*l.prix_achat,0);
  return `
    <table style="margin-top:16px;margin-bottom:6px;">
      <tr><th>N°</th><th>${t('produit')}</th><th>${t('quantite')}</th><th>P.A.</th><th>${t('montant')}</th><th></th></tr>
      ${achatTemp.map((l,i)=>`<tr><td>${l.numero||'—'}</td><td>${l.nom}</td><td>${l.qte}</td><td>${FR.format(l.prix_achat)}</td><td>${FR.format(l.qte*l.prix_achat)}</td><td><button class="btn-danger" data-i="${i}" data-role="del-achat">✕</button></td></tr>`).join('') || `<tr><td colspan="6" style="color:var(--texte-att);">${t('aucune_ligne_ajoutee')}</td></tr>`}
    </table>
    <div class="total-box"><div><div class="t-label">${t('total_achat')}</div><div class="t-val">${money(totalTemp)}</div></div></div>
  `;
}
function refreshAchatLignesZone(){
  document.getElementById('a-lignes-zone').innerHTML = renderAchatLignesHTML();
  document.querySelectorAll('[data-role="del-achat"]').forEach(b=>b.addEventListener('click',()=>{ achatTemp.splice(parseInt(b.dataset.i,10),1); refreshAchatLignesZone(); }));
}
export function wireAchat(){
  const msg = document.getElementById('msg-achat');
  document.getElementById('a-fournisseur').addEventListener('input', (e)=>{
    const f = state.fournisseurs.find(x=>x.nom.toLowerCase()===e.target.value.trim().toLowerCase());
    const avance = f ? avanceFournisseur(f) : 0;
    document.getElementById('a-avance-note').textContent = avance>0 ? `${t('avance_en_cours')} : ${money(avance)} — ${t('avance_deduite_note')}` : '';
  });
  document.getElementById('a-paiement').addEventListener('change', (e)=>{
    const show = e.target.value === 'Dette fournisseur';
    document.getElementById('a-montant-paye-zone').classList.toggle('hidden', !show);
    if(show){
      const totalActuel = achatTemp.reduce((s,l)=>s+l.qte*l.prix_achat,0);
      document.getElementById('a-montant-paye').value = totalActuel;
    }
  });
  document.getElementById('a-add').addEventListener('click', ()=>{
    const pid = document.getElementById('a-produit').value;
    const qte = parseInt(document.getElementById('a-qte').value||'0',10);
    const p = state.produits.find(x=>x.id===pid);
    if(!p){ flash(msg,'Sélectionnez un produit.','err'); return; }
    if(qte<1){ flash(msg,'Quantité invalide.','err'); return; }
    achatTemp.push({produitId:p.id, numero:p.numero||'', nom:p.nom, qte, prix_achat:p.prix_achat});
    refreshAchatLignesZone();
    // Si le champ "montant non payé" est visible et pas encore modifié manuellement, on le remet à jour avec le nouveau total.
    const zone = document.getElementById('a-montant-paye-zone');
    if(zone && !zone.classList.contains('hidden')){
      const totalActuel = achatTemp.reduce((s,l)=>s+l.qte*l.prix_achat,0);
      document.getElementById('a-montant-paye').value = totalActuel;
    }
  });
  refreshAchatLignesZone();
  document.getElementById('a-cancel').addEventListener('click', ()=>{ achatTemp=[]; renderContent(); wireAchat(); });
  document.getElementById('a-save').addEventListener('click', (ev)=>{
    if(ev.target.disabled) return;
    if(achatTemp.length===0){ flash(msg,'Ajoutez au moins une ligne.','err'); return; }
    const total = achatTemp.reduce((s,l)=>s+l.qte*l.prix_achat,0);
    const choixPaiement = document.getElementById('a-paiement').value;
    let montantPaye;
    if(choixPaiement==='Espèces') montantPaye = total;
    else {
      const montantNonPaye = parseInt(document.getElementById('a-montant-paye').value||'0',10);
      if(montantNonPaye<0 || montantNonPaye>total){ flash(msg, `Le montant non payé doit être entre 0 et ${money(total)}.`, 'err'); return; }
      montantPaye = total - montantNonPaye;
    }
    ev.target.disabled = true;
    const lignesAEnregistrer = achatTemp.slice();
    const dtValueA = document.getElementById('a-datetime').value;
    const dtA = dtValueA ? new Date(dtValueA) : new Date();
    const nomFournisseur = document.getElementById('a-fournisseur').value.trim() || 'Fournisseur';
    const paiementFinal = montantPaye >= total ? 'Espèces' : 'Dette fournisseur';
    const achat = { date:dtA.toISOString().slice(0,10), dateHeure:dtA.toISOString(), fournisseur:nomFournisseur, paiement:paiementFinal, montantPaye, lignes:lignesAEnregistrer, total, employeId:currentUser.uid, employeNom:nomUtilisateurCourant() };

    if(nomFournisseur !== 'Fournisseur'){
      const fournisseurExistant = state.fournisseurs.find(f=>f.nom.toLowerCase()===nomFournisseur.toLowerCase());
      if(fournisseurExistant){
        achat.fournisseurId = fournisseurExistant.id;
      } else {
        const fournisseurRef = doc(collection(db,'boutiques',currentBoutiqueId,'fournisseurs'));
        achat.fournisseurId = fournisseurRef.id;
        setDoc(fournisseurRef, { nom:nomFournisseur, telephone:'', adresse:'', notes:'Créé automatiquement depuis un achat', dateAjout:nowISO() }).catch(e=>console.error('Erreur création fournisseur', e));
      }
    }

    const achatRef = doc(collection(db,'boutiques',currentBoutiqueId,'achats'));
    setDoc(achatRef, achat).catch(e=>console.error('Erreur enregistrement achat', e));
    lignesAEnregistrer.forEach(l=>{
      updateDoc(doc(db,'boutiques',currentBoutiqueId,'produits',l.produitId), { stock: increment(l.qte) }).catch(e=>console.error('Erreur mise à jour stock', e));
    });

    achatTemp = [];
    const resteMsg = (montantPaye>0 && montantPaye<total) ? ` (${money(montantPaye)} payé, ${money(total-montantPaye)} en dette)` : '';
    messageAchat.afficher(`Achat enregistré : ${money(total)}${resteMsg}`, 'ok');
  });
}
