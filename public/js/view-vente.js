import { collection, doc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentUser, currentBoutiqueId } from './auth.js';
import { state, limitesDuPlan } from './state.js';
import { t, traduirePaiement } from './i18n.js';
import { FR, money, todayISO, nowISO, datetimeLocalParDefaut, fmtDateHeure, flash, creerMessagePersistant } from './helpers.js';
import { resumeArticles } from './view-journal.js';
import { renderContent, nomUtilisateurCourant, ventesCeMois, imprimerRecu, renderRecuHTML, exporterRecuPDF } from './app-shell.js';

let venteTemp = [];
let venteEnRetour = null;
let venteEnDetail = null;
export let derniereVenteImprimable = null;
const messageVente = creerMessagePersistant(()=>{ renderContent(); wireVente(); });

export function resetVenteUI(){ venteTemp = []; venteEnRetour = null; venteEnDetail = null; messageVente.effacer(); }
export function ouvrirDetailVente(id){ venteEnDetail = id; }

export function viewVente(){
  const options = state.produits.filter(p=>p.type!=='matiere_premiere').map(p=>`<option value="${p.id}">${p.numero?p.numero+' — ':''}${p.nom} (stock: ${p.stock})</option>`).join('');
  return `
  ${messageVente.html('msg-vente')}
  <div id="v-recu-action" style="margin-bottom:14px;"></div>
  <div class="form-wrap">
    <div class="form-grid cols3">
      <div class="champ"><label>${t('date_heure')}</label><input type="datetime-local" id="v-datetime" value="${datetimeLocalParDefaut()}"></div>
      <div class="champ"><label>${t('client_optionnel')}</label><input type="text" id="v-client" placeholder="${t('client_comptant')}" list="v-clients-datalist"><datalist id="v-clients-datalist">${state.clients.map(c=>`<option value="${c.nom}">`).join('')}</datalist></div>
      <div class="champ"><label>${t('telephone')} (${t('optionnel')})</label><input type="text" id="v-tel" placeholder="Ex : 622 00 00 00"></div>
    </div>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('produit')}</label><select id="v-produit">${options || `<option value="">${t('aucun_produit_stock')}</option>`}</select></div>
      <div class="champ"><label>${t('quantite')}</label><input type="number" min="1" value="1" id="v-qte"></div>
    </div>
    <button class="btn btn-secondaire" id="v-add">${t('ajouter_ligne')}</button>
    <div id="v-lignes-zone">${renderVenteLignesHTML()}</div>
    <div class="form-grid" style="margin-top:16px;">
      <div class="champ"><label>${t('mode_paiement')}</label><select id="v-paiement"><option value="Espèces">${t('especes')}</option><option value="Crédit client">${t('credit_client')}</option><option value="Mobile money">${t('mobile_money')}</option></select></div>
      <div class="champ hidden" id="v-montant-credit-zone"><label>${t('montant_credit')}</label><input type="number" min="0" id="v-montant-credit"></div>
      <div class="champ hidden" id="v-reference-zone"><label>${t('reference_mobile_money')}</label><input type="text" id="v-reference" placeholder="Ex : MP240721.1234"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;">
      <button class="btn btn-primaire" id="v-save">${t('enregistrer_vente')}</button>
      <button class="btn btn-secondaire" id="v-cancel">${t('annuler')}</button>
    </div>
  </div>
  ${retourFormHTML()}
  ${detailFormHTML()}
  <h3 style="margin-top:24px;border:none;padding:0;color:var(--vert-fonce);font-size:14px;">${t('ventes_recentes')}</h3>
  <div class="stock-panel"><table>${ventesRecentesRowsHTML()}</table></div>`;
}
function lignesRetournables(vente){
  const dejaRetourne = {};
  state.retours.filter(r=>r.venteId===vente.id).forEach(r=>r.lignes.forEach(l=>{ dejaRetourne[l.produitId]=(dejaRetourne[l.produitId]||0)+l.qte; }));
  return vente.lignes.map(l=>({ ...l, retournable: Math.max(0, l.qte-(dejaRetourne[l.produitId]||0)) }));
}
function ventesRecentesRowsHTML(){
  const ventesTriees = state.ventes.slice().sort((a,b)=>(b.dateHeure||b.date||'').localeCompare(a.dateHeure||a.date||'')).slice(0,20);
  return `<tr><th>${t('date_heure')}</th><th>${t('recu_numero')}</th><th>${t('nav_clients')}</th><th>${t('reference')}</th><th>${t('montant')}</th><th></th></tr>` +
    (ventesTriees.map(v=>{
      const reference = v.paiement==='Mobile money' ? (v.referenceMobileMoney || '—') : traduirePaiement(v.paiement);
      const totalRetournable = lignesRetournables(v).reduce((s,l)=>s+l.retournable,0);
      const boutonRetour = totalRetournable>0
        ? `<button class="btn-secondaire" style="padding:5px 10px;font-size:12px;" data-id="${v.id}" data-role="ouvrir-retour">${t('retourner')}</button>`
        : `<span style="font-size:11px;color:var(--texte-att);">${t('deja_retourne')}</span>`;
      const boutonDetail = `<button class="btn-secondaire" style="padding:5px 10px;font-size:12px;" data-id="${v.id}" data-role="voir-details">${t('details')}</button>`;
      return `<tr><td>${fmtDateHeure(v.dateHeure)}</td><td>${v.numeroRecu||'—'}</td><td>${v.client}</td><td>${reference}</td><td>${money(v.total)}</td><td>${boutonDetail} ${boutonRetour}</td></tr>`;
    }).join('') || `<tr><td colspan="6" style="color:var(--texte-att);">${t('aucune_vente_periode')}</td></tr>`);
}
function detailFormHTML(){
  if(!venteEnDetail) return '';
  const vente = state.ventes.find(v=>v.id===venteEnDetail);
  if(!vente) return '';
  return `
  <div class="form-wrap" id="detail-form" style="margin-top:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="margin:0;border:none;padding:0;color:var(--vert-fonce);">${t('facture_vente')} — ${vente.numeroRecu||''}</h3>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondaire" id="detail-imprimer">${t('imprimer')}</button>
        <button class="btn btn-secondaire" id="detail-pdf">${t('telecharger_pdf')}</button>
        <button class="btn btn-secondaire" id="detail-fermer">${t('fermer')}</button>
      </div>
    </div>
    <div style="border:1px solid var(--gris-bord);border-radius:6px;padding:10px;background:#FEFDFB;">
      ${renderRecuHTML(vente)}
    </div>
  </div>`;
}
function retourFormHTML(){
  if(!venteEnRetour) return '';
  const vente = state.ventes.find(v=>v.id===venteEnRetour);
  if(!vente) return '';
  const lignes = lignesRetournables(vente);
  return `
  <div class="form-wrap" id="ret-form" style="margin-top:16px;">
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${t('retour_titre')} — ${vente.numeroRecu||''}</h3>
    <table style="margin-bottom:14px;">
      <tr><th>${t('produit')}</th><th>${t('quantite_vendue')}</th><th>${t('quantite_a_retourner')}</th></tr>
      ${lignes.map(l=>`<tr><td>${l.nom}</td><td>${l.qte}</td><td>${l.retournable>0?`<input type="number" min="0" max="${l.retournable}" value="0" data-produit="${l.produitId}" class="ret-qte" style="width:70px;padding:5px;border:1px solid var(--gris-bord);border-radius:5px;">`:`<span style="color:var(--texte-att);font-size:12px;">${t('deja_retourne')}</span>`}</td></tr>`).join('')}
    </table>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-primaire" id="ret-save">${t('confirmer_retour')}</button>
      <button class="btn btn-secondaire" id="ret-cancel">${t('annuler')}</button>
    </div>
  </div>`;
}
function renderVenteLignesHTML(){
  const totalTemp = venteTemp.reduce((s,l)=>s+l.qte*l.prix_vente,0);
  return `
    <table style="margin-top:16px;margin-bottom:6px;">
      <tr><th>N°</th><th>${t('produit')}</th><th>${t('quantite')}</th><th>P.U.</th><th>${t('montant')}</th><th></th></tr>
      ${venteTemp.map((l,i)=>`<tr><td>${l.numero||'—'}</td><td>${l.nom}</td><td>${l.qte}</td><td>${FR.format(l.prix_vente)}</td><td>${FR.format(l.qte*l.prix_vente)}</td><td><button class="btn-danger" data-i="${i}" data-role="del-vente">✕</button></td></tr>`).join('') || `<tr><td colspan="6" style="color:var(--texte-att);">${t('aucune_ligne_ajoutee')}</td></tr>`}
    </table>
    <div class="total-box"><div><div class="t-label">${t('total_a_payer')}</div><div class="t-val">${money(totalTemp)}</div></div></div>
  `;
}
function refreshVenteLignesZone(){
  document.getElementById('v-lignes-zone').innerHTML = renderVenteLignesHTML();
  document.querySelectorAll('[data-role="del-vente"]').forEach(b=>b.addEventListener('click',()=>{ venteTemp.splice(parseInt(b.dataset.i,10),1); refreshVenteLignesZone(); }));
}
export function wireVente(){
  const msg = document.getElementById('msg-vente');
  const zoneRecu = document.getElementById('v-recu-action');
  if(derniereVenteImprimable){
    zoneRecu.innerHTML = `<button class="btn btn-secondaire" id="v-imprimer">🖨️ ${t('imprimer_dernier_recu')}</button>
      <button class="btn btn-secondaire" id="v-pdf" style="margin-left:8px;">${t('telecharger_pdf')}</button>`;
    document.getElementById('v-imprimer').addEventListener('click', ()=>imprimerRecu(derniereVenteImprimable));
    document.getElementById('v-pdf').addEventListener('click', ()=>exporterRecuPDF(derniereVenteImprimable));
  } else {
    zoneRecu.innerHTML = '';
  }
  document.getElementById('v-client').addEventListener('input', (e)=>{
    const clientExistant = state.clients.find(c=>c.nom.toLowerCase()===e.target.value.trim().toLowerCase());
    document.getElementById('v-tel').value = clientExistant ? (clientExistant.telephone||'') : '';
  });
  document.getElementById('v-paiement').addEventListener('change', (e)=>{
    const show = e.target.value === 'Crédit client';
    document.getElementById('v-montant-credit-zone').classList.toggle('hidden', !show);
    if(show){
      const totalActuel = venteTemp.reduce((s,l)=>s+l.qte*l.prix_vente,0);
      document.getElementById('v-montant-credit').value = totalActuel;
    }
    document.getElementById('v-reference-zone').classList.toggle('hidden', e.target.value !== 'Mobile money');
  });
  document.getElementById('v-add').addEventListener('click', ()=>{
    const pid = document.getElementById('v-produit').value;
    const qte = parseInt(document.getElementById('v-qte').value||'0',10);
    const p = state.produits.find(x=>x.id===pid);
    if(!p){ flash(msg,'Sélectionnez un produit.','err'); return; }
    if(qte<1){ flash(msg,'Quantité invalide.','err'); return; }
    const dejaQte = venteTemp.filter(l=>l.produitId===pid).reduce((s,l)=>s+l.qte,0);
    if(dejaQte+qte > p.stock){ flash(msg,`Stock insuffisant (disponible: ${p.stock}).`,'err'); return; }
    venteTemp.push({produitId:p.id, numero:p.numero||'', nom:p.nom, qte, prix_vente:p.prix_vente, cout:p.prix_achat});
    refreshVenteLignesZone();
    const zoneCredit = document.getElementById('v-montant-credit-zone');
    if(zoneCredit && !zoneCredit.classList.contains('hidden')){
      const totalActuel = venteTemp.reduce((s,l)=>s+l.qte*l.prix_vente,0);
      document.getElementById('v-montant-credit').value = totalActuel;
    }
  });
  refreshVenteLignesZone();
  document.getElementById('v-cancel').addEventListener('click', ()=>{ venteTemp=[]; renderContent(); wireVente(); });
  document.getElementById('v-save').addEventListener('click', (ev)=>{
    if(ev.target.disabled) return;
    if(venteTemp.length===0){ flash(msg,'Ajoutez au moins une ligne.','err'); return; }
    const limiteVentesMois = limitesDuPlan(state.plan).ventesMois;
    if(isFinite(limiteVentesMois) && ventesCeMois().length >= limiteVentesMois){
      flash(msg, `Limite du plan gratuit atteinte (${limiteVentesMois} ventes ce mois-ci). Passez à un plan payant pour continuer.`, 'err');
      return;
    }
    const total = venteTemp.reduce((s,l)=>s+l.qte*l.prix_vente,0);
    const choixPaiement = document.getElementById('v-paiement').value;
    let montantCredit = 0;
    if(choixPaiement==='Crédit client'){
      montantCredit = parseInt(document.getElementById('v-montant-credit').value||'0',10);
      if(montantCredit<0 || montantCredit>total){ flash(msg, `Le montant en crédit doit être entre 0 et ${money(total)}.`, 'err'); return; }
    }
    ev.target.disabled = true;
    const lignesAEnregistrer = venteTemp.slice();
    const nomClient = document.getElementById('v-client').value.trim() || 'Client comptant';
    const telClient = document.getElementById('v-tel').value.trim();
    const dtValue = document.getElementById('v-datetime').value;
    const dt = dtValue ? new Date(dtValue) : new Date();
    const numeroRecu = 'REC-' + String(state.ventes.length + 1).padStart(6,'0');
    const paiementFinal = montantCredit > 0 ? 'Crédit client' : choixPaiement;
    const referenceMobileMoney = choixPaiement==='Mobile money' ? document.getElementById('v-reference').value.trim() : '';
    const vente = { date:dt.toISOString().slice(0,10), dateHeure:dt.toISOString(), numeroRecu, client:nomClient, paiement:paiementFinal, montantCredit, referenceMobileMoney, lignes:lignesAEnregistrer, total, employeId:currentUser.uid, employeNom:nomUtilisateurCourant() };

    if(nomClient !== 'Client comptant'){
      const clientExistant = state.clients.find(c=>c.nom.toLowerCase()===nomClient.toLowerCase());
      if(clientExistant){
        vente.clientId = clientExistant.id;
        if(telClient && telClient!==clientExistant.telephone){
          updateDoc(doc(db,'boutiques',currentBoutiqueId,'clients',clientExistant.id), { telephone:telClient }).catch(e=>console.error('Erreur mise à jour téléphone client', e));
        }
      } else {
        const clientRef = doc(collection(db,'boutiques',currentBoutiqueId,'clients'));
        vente.clientId = clientRef.id;
        setDoc(clientRef, { nom:nomClient, telephone:telClient, date_inscription:todayISO(), adresse:'', notes:'Créé automatiquement depuis une vente' }).catch(e=>console.error('Erreur création client', e));
      }
    }

    // On génère l'identifiant tout de suite et on écrit sans attendre la confirmation réseau :
    // l'écriture est mise en file d'attente localement (fonctionne hors-ligne) et se synchronise dès que possible.
    const venteRef = doc(collection(db,'boutiques',currentBoutiqueId,'ventes'));
    setDoc(venteRef, vente).catch(e=>console.error('Erreur enregistrement vente', e));
    lignesAEnregistrer.forEach(l=>{
      updateDoc(doc(db,'boutiques',currentBoutiqueId,'produits',l.produitId), { stock: increment(-l.qte) }).catch(e=>console.error('Erreur mise à jour stock', e));
    });

    venteTemp = [];
    derniereVenteImprimable = { ...vente, id: venteRef.id };
    messageVente.afficher(`Vente enregistrée : ${money(total)}`, 'ok');
  });

  document.querySelectorAll('[data-role="ouvrir-retour"]').forEach(b=>b.addEventListener('click', ()=>{
    venteEnRetour = b.dataset.id;
    renderContent(); wireVente();
    document.getElementById('ret-form').scrollIntoView({behavior:'smooth'});
  }));
  document.querySelectorAll('[data-role="voir-details"]').forEach(b=>b.addEventListener('click', ()=>{
    venteEnDetail = b.dataset.id;
    renderContent(); wireVente();
    document.getElementById('detail-form').scrollIntoView({behavior:'smooth'});
  }));
  const detailFermer = document.getElementById('detail-fermer');
  if(detailFermer){
    detailFermer.addEventListener('click', ()=>{ venteEnDetail=null; renderContent(); wireVente(); });
    document.getElementById('detail-imprimer').addEventListener('click', ()=>{
      const vente = state.ventes.find(v=>v.id===venteEnDetail);
      if(vente) imprimerRecu(vente);
    });
    document.getElementById('detail-pdf').addEventListener('click', ()=>{
      const vente = state.ventes.find(v=>v.id===venteEnDetail);
      if(vente) exporterRecuPDF(vente);
    });
  }
  const retCancel = document.getElementById('ret-cancel');
  if(retCancel){
    retCancel.addEventListener('click', ()=>{ venteEnRetour=null; renderContent(); wireVente(); });
    document.getElementById('ret-save').addEventListener('click', (ev)=>{
      if(ev.target.disabled) return;
      const vente = state.ventes.find(v=>v.id===venteEnRetour);
      if(!vente){ venteEnRetour=null; renderContent(); wireVente(); return; }
      const lignesInfo = lignesRetournables(vente);
      const lignesSaisies = Array.from(document.querySelectorAll('.ret-qte'))
        .map(inp=>({produitId:inp.dataset.produit, qte:parseInt(inp.value||'0',10)}))
        .filter(l=>l.qte>0);
      if(lignesSaisies.length===0){ flash(msg, t('saisir_au_moins_une_quantite'), 'err'); return; }
      for(const l of lignesSaisies){
        const info = lignesInfo.find(x=>x.produitId===l.produitId);
        if(!info || l.qte>info.retournable){ flash(msg, t('quantite_retour_invalide'), 'err'); return; }
      }
      ev.target.disabled = true;
      const lignesRetour = lignesSaisies.map(l=>{
        const info = lignesInfo.find(x=>x.produitId===l.produitId);
        return { produitId:l.produitId, numero:info.numero||'', nom:info.nom, qte:l.qte, prix_vente:info.prix_vente, cout:info.cout||0 };
      });
      const totalRetour = lignesRetour.reduce((s,l)=>s+l.qte*l.prix_vente,0);
      const partCredit = vente.total>0 ? (vente.montantCredit||0)/vente.total : 0;
      const montantAnnuleCredit = Math.round(totalRetour*partCredit);
      lignesRetour.forEach(l=>{
        updateDoc(doc(db,'boutiques',currentBoutiqueId,'produits',l.produitId), { stock: increment(l.qte) }).catch(e=>console.error('Erreur mise à jour stock retour', e));
      });
      const retourDoc = { date:todayISO(), dateHeure:nowISO(), venteId:vente.id, numeroRecu:vente.numeroRecu||'', client:vente.client, lignes:lignesRetour, total:totalRetour, montantAnnuleCredit, employeId:currentUser.uid, employeNom:nomUtilisateurCourant() };
      if(vente.clientId) retourDoc.clientId = vente.clientId;
      setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'retours')), retourDoc).catch(e=>console.error('Erreur enregistrement retour', e));
      venteEnRetour = null;
      messageVente.afficher(`${t('retour_enregistre')} : ${money(totalRetour)}`, 'ok');
    });
  }
}
