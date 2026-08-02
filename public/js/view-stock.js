import { collection, doc, deleteDoc, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentBoutiqueId, currentUser, currentRole } from './auth.js';
import { state, limitesDuPlan } from './state.js';
import { t } from './i18n.js';
import { FR, money, nowISO, todayISO, fmtDateHeure, flash } from './helpers.js';
import { renderContent, nomUtilisateurCourant, statutStock, tagStatut, enregistrerAudit } from './app-shell.js';
import { MODELE_CSV_PRODUITS, parseCSV, validerLignesProduits } from './business-logic.js';

let showNouveauProduit = false;
let produitEnEdition = null;
let showImportCSV = false;
let analyseImport = null; // { valides, erreurs } après lecture du fichier

export function resetStockUI(){ showNouveauProduit = false; produitEnEdition = null; showImportCSV = false; analyseImport = null; }

function telechargerTexte(nomFichier, contenu){
  // BOM UTF-8 en tête : sans lui, Excel ouvre le fichier en encodage local et affiche les
  // caractères accentués (é, è, à...) de façon corrompue au lieu de les détecter en UTF-8.
  const blob = new Blob(['﻿' + contenu], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function viewStock(){
  const pEdit = produitEnEdition ? state.produits.find(p=>p.id===produitEnEdition) : null;
  return `
  <div class="msg ok" id="msg-stock"></div>
  <div class="toolbar-stock">
    <input class="search-box" type="text" id="s-recherche" placeholder="${t('rechercher_produit')}">
    <div style="display:flex;gap:8px;">
      ${currentRole!=='Vendeur' ? `<button class="btn btn-primaire" id="s-nouveau">${t('nouveau_produit')}</button>` : ''}
      ${currentRole!=='Vendeur' ? `<button class="btn btn-secondaire" id="s-importer">${t('importer_csv')}</button>` : ''}
    </div>
  </div>
  ${currentRole==='Vendeur' ? `<div class="msg err" style="display:block;margin-bottom:14px;">${t('lecture_seule')}</div>` : ''}
  <div class="form-wrap ${showImportCSV?'':'hidden'}" id="s-import-form" style="margin-bottom:18px;">
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${t('import_csv_titre')}</h3>
    <p style="font-size:12.5px;color:var(--texte-att);">${t('import_csv_produits_intro')}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
      <button class="btn btn-secondaire" id="s-modele-csv">${t('telecharger_modele_csv')}</button>
      <input type="file" id="s-fichier-csv" accept=".csv,text/csv">
    </div>
    <div id="s-import-apercu"></div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="btn btn-primaire" id="s-confirmer-import" ${analyseImport && analyseImport.valides.length ? '' : 'disabled'}>${t('confirmer_import')}</button>
      <button class="btn btn-secondaire" id="s-annuler-import">${t('annuler_import')}</button>
    </div>
  </div>
  <div class="form-wrap ${showNouveauProduit?'':'hidden'}" id="s-form" style="margin-bottom:18px;">
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${pEdit ? t('modifier_produit_titre') : t('nouveau_produit_titre')}</h3>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('numero_produit')}</label><input type="text" id="np-numero" value="${pEdit?(pEdit.numero||''):''}" placeholder="Ex : P-001"></div>
      <div class="champ"><label>${t('nom_produit')}</label><input type="text" id="np-nom" value="${pEdit?pEdit.nom:''}"></div>
      <div class="champ"><label>${t('categorie')}</label><input type="text" id="np-cat" value="${pEdit?(pEdit.categorie||''):''}"></div>
      <div class="champ">
        <label>${t('type_produit')}</label>
        <select id="np-type">
          <option value="fini" ${(!pEdit || pEdit.type!=='matiere_premiere')?'selected':''}>${t('produit_fini')}</option>
          <option value="matiere_premiere" ${(pEdit && pEdit.type==='matiere_premiere')?'selected':''}>${t('matiere_premiere')}</option>
        </select>
      </div>
      <div class="champ"><label>${pEdit?t('stock_actuel'):t('stock_initial')}</label><input type="number" min="0" value="${pEdit?pEdit.stock:0}" id="np-stock"></div>
      <div class="champ"><label>${t('prix_achat')}</label><input type="number" min="0" value="${pEdit?pEdit.prix_achat:''}" id="np-pa"></div>
      <div class="champ" id="np-pv-zone"><label>${t('prix_vente')}</label><input type="number" min="0" value="${pEdit?pEdit.prix_vente:''}" id="np-pv"></div>
      <div class="champ"><label>${t('seuil_alerte')}</label><input type="number" min="0" value="${pEdit?pEdit.seuil:15}" id="np-seuil"></div>
    </div>
    ${!pEdit ? `
    <div style="margin-top:4px;padding:12px;background:#F6F4EE;border-radius:6px;margin-bottom:14px;">
      <div style="font-size:12px;color:var(--texte-att);margin-bottom:10px;">${t('stock_initial_fournisseur_note')}</div>
      <div class="form-grid cols3" style="margin-bottom:0;">
        <div class="champ"><label>${t('fournisseur')} (${t('optionnel')})</label><input type="text" id="np-fournisseur" list="np-fournisseurs-datalist"><datalist id="np-fournisseurs-datalist">${state.fournisseurs.map(f=>`<option value="${f.nom}">`).join('')}</datalist></div>
        <div class="champ"><label>${t('paiement')}</label><select id="np-paiement"><option value="Espèces">${t('especes')}</option><option value="Dette fournisseur">${t('dette_fournisseur')}</option></select></div>
        <div class="champ hidden" id="np-montant-paye-zone"><label>${t('montant_non_paye')}</label><input type="number" min="0" id="np-montant-non-paye"></div>
      </div>
    </div>` : ''}
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="np-save">${pEdit ? t('enregistrer_modifs') : t('ajouter_produit_btn')}</button>
      <button class="btn btn-secondaire" id="np-cancel">${t('annuler')}</button>
    </div>
    ${pEdit ? `<div style="margin-top:12px;font-size:12px;color:var(--texte-att);">${t('note_modif_stock')}</div>` : ''}
  </div>
  <div class="stock-panel"><table id="s-table"></table></div>`;
}
function renderStockRows(filtre){
  const tbl = document.getElementById('s-table');
  const f = (filtre||'').toLowerCase();
  const rows = state.produits.filter(p=>!f || p.nom.toLowerCase().includes(f) || (p.numero||'').toLowerCase().includes(f));
  tbl.innerHTML = `<tr><th>${t('numero_produit')}</th><th>${t('produit')}</th><th>${t('categorie')}</th><th>${t('prix_achat')}</th><th>${t('prix_vente')}</th><th>Stock</th><th>${t('statut')}</th><th>${t('ajoute_le')}</th><th></th></tr>` +
    rows.map(p=>{
      const estMatierePremiere = p.type==='matiere_premiere';
      const badgeType = estMatierePremiere ? `<span class="tag moy" style="margin-left:6px;">${t('matiere_premiere_abrev')}</span>` : '';
      return `<tr><td>${p.numero||'—'}</td><td>${p.nom}${badgeType}</td><td>${p.categorie||'—'}</td><td>${FR.format(p.prix_achat)}</td><td>${estMatierePremiere?'—':FR.format(p.prix_vente)}</td><td>${p.stock}</td><td>${tagStatut(statutStock(p))}</td><td>${fmtDateHeure(p.dateAjout)}</td><td>${currentRole!=='Vendeur'?`<button class="btn-secondaire" style="padding:5px 10px;font-size:12px;margin-right:6px;" data-id="${p.id}" data-role="modif-produit">${t('modifier')}</button><button class="btn-danger" data-id="${p.id}" data-role="del-produit">${t('supprimer')}</button>`:''}</td></tr>`;
    }).join('');
  document.querySelectorAll('[data-role="del-produit"]').forEach(b=>b.addEventListener('click', ()=>{
    if(!confirm('Supprimer ce produit ?')) return;
    const produit = state.produits.find(p=>p.id===b.dataset.id);
    deleteDoc(doc(db,'boutiques',currentBoutiqueId,'produits',b.dataset.id)).catch(e=>console.error('Erreur suppression produit', e));
    enregistrerAudit('suppression', 'produit', produit ? produit.nom : b.dataset.id);
  }));
  document.querySelectorAll('[data-role="modif-produit"]').forEach(b=>b.addEventListener('click', ()=>{
    produitEnEdition = b.dataset.id;
    showNouveauProduit = true;
    renderContent(); wireStock();
    document.getElementById('s-form').scrollIntoView({behavior:'smooth'});
  }));
}
export function wireStock(){
  renderStockRows('');
  document.getElementById('s-recherche').addEventListener('input', e=>renderStockRows(e.target.value));
  const btnNouveau = document.getElementById('s-nouveau');
  if(btnNouveau) btnNouveau.addEventListener('click', ()=>{ showNouveauProduit=true; produitEnEdition=null; renderContent(); wireStock(); });
  if(showNouveauProduit){
    document.getElementById('np-cancel').addEventListener('click', ()=>{ showNouveauProduit=false; produitEnEdition=null; renderContent(); wireStock(); });
    const selectType = document.getElementById('np-type');
    const majZonePrixVente = ()=>{
      const estMatierePremiere = selectType.value === 'matiere_premiere';
      document.getElementById('np-pv-zone').classList.toggle('hidden', estMatierePremiere);
      if(estMatierePremiere) document.getElementById('np-pv').value = 0;
    };
    selectType.addEventListener('change', majZonePrixVente);
    majZonePrixVente();
    const selectPaiementInit = document.getElementById('np-paiement');
    if(selectPaiementInit){
      selectPaiementInit.addEventListener('change', (e)=>{
        const show = e.target.value === 'Dette fournisseur';
        document.getElementById('np-montant-paye-zone').classList.toggle('hidden', !show);
        if(show){
          const stockVal = parseInt(document.getElementById('np-stock').value||'0',10);
          const paVal = parseInt(document.getElementById('np-pa').value||'0',10);
          document.getElementById('np-montant-non-paye').value = stockVal*paVal;
        }
      });
    }
    document.getElementById('np-save').addEventListener('click', (ev)=>{
      if(ev.target.disabled) return;
      const msg = document.getElementById('msg-stock');
      const nom = document.getElementById('np-nom').value.trim();
      if(!nom){ flash(msg,'Le nom du produit est requis.','err'); return; }
      const limiteProduits = limitesDuPlan(state.plan).produits;
      if(!produitEnEdition && isFinite(limiteProduits) && state.produits.length >= limiteProduits){
        flash(msg, `Limite du plan gratuit atteinte (${limiteProduits} produits). Passez à un plan payant pour ajouter plus de produits.`, 'err');
        return;
      }
      ev.target.disabled = true;
      const donneesProduit = { numero:document.getElementById('np-numero').value.trim(), nom, categorie:document.getElementById('np-cat').value.trim(),
        type:document.getElementById('np-type').value,
        stock:parseInt(document.getElementById('np-stock').value||'0',10),
        prix_achat:parseInt(document.getElementById('np-pa').value||'0',10),
        prix_vente:parseInt(document.getElementById('np-pv').value||'0',10),
        seuil:parseInt(document.getElementById('np-seuil').value||'15',10) };
      if(produitEnEdition){
        const produitAvant = state.produits.find(p=>p.id===produitEnEdition);
        updateDoc(doc(db,'boutiques',currentBoutiqueId,'produits',produitEnEdition), donneesProduit).catch(e=>console.error('Erreur modification produit', e));
        if(produitAvant && produitAvant.stock !== donneesProduit.stock){
          const diff = donneesProduit.stock - produitAvant.stock;
          enregistrerAudit('modification_stock', 'produit', nom, `${diff>0?'+':''}${diff} (${produitAvant.stock} → ${donneesProduit.stock})`);
        }
        flash(msg, `Produit "${nom}" modifié.`, 'ok');
      } else {
        donneesProduit.dateAjout = nowISO();
        const produitRef = doc(collection(db,'boutiques',currentBoutiqueId,'produits'));
        setDoc(produitRef, donneesProduit).catch(e=>console.error('Erreur création produit', e));

        // Si un fournisseur est indiqué et qu'il y a un stock initial, on enregistre l'achat correspondant.
        const nomFournisseurInit = document.getElementById('np-fournisseur') ? document.getElementById('np-fournisseur').value.trim() : '';
        if(nomFournisseurInit && donneesProduit.stock > 0){
          const choixPaiementInit = document.getElementById('np-paiement').value;
          const totalAchatInit = donneesProduit.stock * donneesProduit.prix_achat;
          let montantPayeInit;
          if(choixPaiementInit==='Espèces') montantPayeInit = totalAchatInit;
          else {
            const montantNonPayeInit = parseInt(document.getElementById('np-montant-non-paye').value||'0',10);
            montantPayeInit = Math.max(0, totalAchatInit - Math.min(montantNonPayeInit, totalAchatInit));
          }
          const paiementInitFinal = montantPayeInit >= totalAchatInit ? 'Espèces' : 'Dette fournisseur';
          const ligneAchatInit = { produitId: produitRef.id, numero: donneesProduit.numero, nom: donneesProduit.nom, qte: donneesProduit.stock, prix_achat: donneesProduit.prix_achat };
          const achatInit = { date: todayISO(), dateHeure: nowISO(), fournisseur: nomFournisseurInit, paiement: paiementInitFinal, montantPaye: montantPayeInit, lignes: [ligneAchatInit], total: totalAchatInit, employeId: currentUser.uid, employeNom: nomUtilisateurCourant() };
          const fournisseurExistant = state.fournisseurs.find(f=>f.nom.toLowerCase()===nomFournisseurInit.toLowerCase());
          if(fournisseurExistant){
            achatInit.fournisseurId = fournisseurExistant.id;
          } else {
            const fournisseurRef = doc(collection(db,'boutiques',currentBoutiqueId,'fournisseurs'));
            achatInit.fournisseurId = fournisseurRef.id;
            setDoc(fournisseurRef, { nom:nomFournisseurInit, telephone:'', adresse:'', notes:'Créé automatiquement depuis un nouveau produit', dateAjout:nowISO() }).catch(e=>console.error('Erreur création fournisseur', e));
          }
          setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'achats')), achatInit).catch(e=>console.error('Erreur création achat initial', e));
        }
        flash(msg, `Produit "${nom}" ajouté.`, 'ok');
      }
      showNouveauProduit = false;
      produitEnEdition = null;
      renderContent(); wireStock();
    });
  }

  const btnImporter = document.getElementById('s-importer');
  if(btnImporter) btnImporter.addEventListener('click', ()=>{ showImportCSV=true; showNouveauProduit=false; analyseImport=null; renderContent(); wireStock(); });
  if(showImportCSV){
    document.getElementById('s-annuler-import').addEventListener('click', ()=>{ showImportCSV=false; analyseImport=null; renderContent(); wireStock(); });
    document.getElementById('s-modele-csv').addEventListener('click', ()=>telechargerTexte('modele-produits.csv', MODELE_CSV_PRODUITS));
    document.getElementById('s-fichier-csv').addEventListener('change', (ev)=>{
      const fichier = ev.target.files[0];
      if(!fichier) return;
      const reader = new FileReader();
      reader.onload = (e)=>{
        const { lignes } = parseCSV(e.target.result);
        analyseImport = validerLignesProduits(lignes);
        renderApercuImportStock();
        document.getElementById('s-confirmer-import').disabled = !analyseImport.valides.length;
      };
      reader.readAsText(fichier);
    });
    renderApercuImportStock();
    document.getElementById('s-confirmer-import').addEventListener('click', async (ev)=>{
      if(ev.target.disabled || !analyseImport) return;
      ev.target.disabled = true;
      const msg = document.getElementById('msg-stock');
      const totalValides = analyseImport.valides.length;
      let aImporter = analyseImport.valides;
      const limiteProduits = limitesDuPlan(state.plan).produits;
      let tronque = false;
      if(isFinite(limiteProduits)){
        const placesRestantes = Math.max(0, limiteProduits - state.produits.length);
        if(aImporter.length > placesRestantes){ tronque = true; aImporter = aImporter.slice(0, placesRestantes); }
      }
      if(aImporter.length === 0){ flash(msg, t('aucune_ligne_a_importer'), 'err'); ev.target.disabled = false; return; }
      try{
        for(let i=0; i<aImporter.length; i+=450){
          const lot = aImporter.slice(i, i+450);
          const batch = writeBatch(db);
          lot.forEach(p=>{
            const ref = doc(collection(db,'boutiques',currentBoutiqueId,'produits'));
            batch.set(ref, { ...p, dateAjout: nowISO() });
          });
          await batch.commit();
        }
        enregistrerAudit('creation', 'produit', 'Import CSV', `${aImporter.length} produit(s) importé(s)`);
        const texteFinal = (tronque ? t('import_limite_plan').replace('{n}',aImporter.length).replace('{total}',totalValides)+' ' : '') + t('import_termine').replace('{n}', aImporter.length);
        showImportCSV = false; analyseImport = null;
        renderContent(); wireStock();
        flash(document.getElementById('msg-stock'), texteFinal, 'ok');
      }catch(e){
        console.error('Erreur import CSV produits', e);
        flash(msg, t('erreur_generique'), 'err');
        ev.target.disabled = false;
      }
    });
  }
}
function renderApercuImportStock(){
  const conteneur = document.getElementById('s-import-apercu');
  if(!conteneur) return;
  if(!analyseImport){ conteneur.innerHTML = ''; return; }
  const { valides, erreurs } = analyseImport;
  conteneur.innerHTML = `
    <div class="msg ${valides.length?'ok':'err'}" style="display:block;">${valides.length ? t('lignes_valides_pretes').replace('{n}', valides.length) : t('aucune_ligne_a_importer')}</div>
    ${erreurs.length ? `<div class="msg err" style="display:block;max-height:160px;overflow-y:auto;">${t('lignes_en_erreur').replace('{n}', erreurs.length)}<br>${erreurs.slice(0,50).map(e=>t('ligne_erreur_detail').replace('{n}',e.ligne).replace('{raison}',e.raison)).join('<br>')}</div>` : ''}`;
}
