import { collection, doc, deleteDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentUser, currentBoutiqueId, currentRole } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { money, todayISO, nowISO, fmtDate, flash } from './helpers.js';
import { renderContent, nomUtilisateurCourant, enregistrerAudit } from './app-shell.js';
import { creditClient, MODELE_CSV_CLIENTS, parseCSV, validerLignesClients } from './business-logic.js';
import { demanderConfirmationMotDePasse } from './confirmation-securisee.js';
export { creditClient } from './business-logic.js';

let showNouveauClient = false;
let clientEnPaiement = null;
let showImportCSV = false;
let analyseImport = null;

export function resetClientsUI(){ showNouveauClient = false; clientEnPaiement = null; showImportCSV = false; analyseImport = null; }

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

export function viewClients(){
  const cPaie = clientEnPaiement ? state.clients.find(c=>c.id===clientEnPaiement) : null;
  return `
  <div class="msg ok" id="msg-clients"></div>
  <div class="toolbar-stock">
    <input class="search-box" type="text" id="c-recherche" placeholder="${t('rechercher_client')}">
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primaire" id="c-nouveau">${t('nouveau_client')}</button>
      <button class="btn btn-secondaire" id="c-importer">${t('importer_csv')}</button>
    </div>
  </div>
  <div class="form-wrap ${showImportCSV?'':'hidden'}" id="c-import-form" style="margin-bottom:18px;">
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${t('import_csv_titre')}</h3>
    <p style="font-size:12.5px;color:var(--texte-att);">${t('import_csv_clients_intro')}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
      <button class="btn btn-secondaire" id="c-modele-csv">${t('telecharger_modele_csv')}</button>
      <input type="file" id="c-fichier-csv" accept=".csv,text/csv">
    </div>
    <div id="c-import-apercu"></div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="btn btn-primaire" id="c-confirmer-import" ${analyseImport && analyseImport.valides.length ? '' : 'disabled'}>${t('confirmer_import')}</button>
      <button class="btn btn-secondaire" id="c-annuler-import">${t('annuler_import')}</button>
    </div>
  </div>
  <div class="form-wrap ${showNouveauClient?'':'hidden'}" id="c-form" style="margin-bottom:18px;">
    <div class="form-grid cols3">
      <div class="champ"><label>${t('nom_client')}</label><input type="text" id="nc-nom"></div>
      <div class="champ"><label>${t('telephone')}</label><input type="text" id="nc-tel" placeholder="Ex : 622 00 00 00"></div>
      <div class="champ"><label>${t('date_inscription')}</label><input type="date" id="nc-date" value="${todayISO()}"></div>
    </div>
    <div class="form-grid" style="margin-bottom:14px;">
      <div class="champ"><label>${t('adresse')} (${t('optionnel')})</label><input type="text" id="nc-adresse"></div>
      <div class="champ"><label>${t('notes')} (${t('optionnel')})</label><input type="text" id="nc-notes"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="nc-save">${t('ajouter_client')}</button>
      <button class="btn btn-secondaire" id="nc-cancel">${t('annuler')}</button>
    </div>
  </div>
  <div class="form-wrap ${cPaie?'':'hidden'}" id="pc-form" style="margin-bottom:18px;">
    ${cPaie ? `
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${t('encaisser_paiement')} — ${cPaie.nom}</h3>
    <div style="font-size:13px;color:var(--texte-att);margin-bottom:12px;">${t('credit_en_cours')} : <strong>${money(creditClient(cPaie))}</strong></div>
    <div class="form-grid cols3">
      <div class="champ"><label>${t('montant')}</label><input type="number" min="1" max="${creditClient(cPaie)}" id="pc-montant"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="pc-save">${t('enregistrer_paiement')}</button>
      <button class="btn btn-secondaire" id="pc-cancel">${t('annuler')}</button>
    </div>` : ''}
  </div>
  <div class="stock-panel"><table id="c-table"></table></div>`;
}
function renderClientRows(filtre){
  const tbl = document.getElementById('c-table');
  const f = (filtre||'').toLowerCase();
  const rows = state.clients.filter(c=>!f || c.nom.toLowerCase().includes(f) || (c.telephone||'').toLowerCase().includes(f));
  tbl.innerHTML = `<tr><th>${t('nav_clients')}</th><th>${t('telephone')}</th><th>${t('inscrit_le')}</th><th>${t('adresse')}</th><th>${t('credit_en_cours')}</th><th></th></tr>` +
    rows.map(c=>{
      const credit = creditClient(c);
      const boutonEncaisser = credit>0 ? `<button class="btn-secondaire" style="padding:5px 10px;font-size:12px;margin-right:6px;" data-id="${c.id}" data-role="encaisser-client">${t('encaisser')}</button>` : '';
      const boutonSupprimer = currentRole==='Propriétaire' ? `<button class="btn-danger" data-id="${c.id}" data-role="del-client">${t('supprimer')}</button>` : '';
      return `<tr><td>${c.nom}</td><td>${c.telephone||'—'}</td><td>${c.date_inscription?fmtDate(c.date_inscription):'—'}</td><td>${c.adresse||'—'}</td><td>${credit>0?`<span class="tag bas">${money(credit)}</span>`:'<span class="tag ok">0 GNF</span>'}</td><td>${boutonEncaisser}${boutonSupprimer}</td></tr>`;
    }).join('') || `<tr><td colspan="6" style="color:var(--texte-att);">${t('aucun_client')}</td></tr>`;
  document.querySelectorAll('[data-role="del-client"]').forEach(b=>b.addEventListener('click', ()=>{
    const client = state.clients.find(c=>c.id===b.dataset.id);
    demanderConfirmationMotDePasse({
      titre: t('confirmer_suppression_client_titre'),
      message: t('confirmer_suppression_client_message'),
      onConfirme: () => {
        deleteDoc(doc(db,'boutiques',currentBoutiqueId,'clients',b.dataset.id)).catch(e=>console.error('Erreur suppression client', e));
        enregistrerAudit('suppression', 'client', client ? client.nom : b.dataset.id);
      }
    });
  }));
  document.querySelectorAll('[data-role="encaisser-client"]').forEach(b=>b.addEventListener('click', ()=>{
    clientEnPaiement = b.dataset.id;
    showNouveauClient = false;
    renderContent(); wireClients();
    document.getElementById('pc-form').scrollIntoView({behavior:'smooth'});
  }));
}
export function wireClients(){
  renderClientRows('');
  document.getElementById('c-recherche').addEventListener('input', e=>renderClientRows(e.target.value));
  document.getElementById('c-nouveau').addEventListener('click', ()=>{ showNouveauClient=true; clientEnPaiement=null; renderContent(); wireClients(); });
  if(showNouveauClient){
    document.getElementById('nc-cancel').addEventListener('click', ()=>{ showNouveauClient=false; renderContent(); wireClients(); });
    document.getElementById('nc-save').addEventListener('click', (ev)=>{
      if(ev.target.disabled) return;
      const msg = document.getElementById('msg-clients');
      const nom = document.getElementById('nc-nom').value.trim();
      if(!nom){ flash(msg,'Le nom du client est requis.','err'); return; }
      ev.target.disabled = true;
      const client = { nom, telephone:document.getElementById('nc-tel').value.trim(), date_inscription:document.getElementById('nc-date').value||todayISO(), adresse:document.getElementById('nc-adresse').value.trim(), notes:document.getElementById('nc-notes').value.trim() };
      setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'clients')), client).catch(e=>console.error('Erreur création client', e));
      showNouveauClient = false;
      flash(msg, `Client "${nom}" ajouté.`, 'ok');
      renderContent(); wireClients();
    });
  }
  if(clientEnPaiement){
    const cPaie = state.clients.find(c=>c.id===clientEnPaiement);
    document.getElementById('pc-cancel').addEventListener('click', ()=>{ clientEnPaiement=null; renderContent(); wireClients(); });
    document.getElementById('pc-save').addEventListener('click', (ev)=>{
      if(ev.target.disabled) return;
      const msg = document.getElementById('msg-clients');
      const creditActuel = creditClient(cPaie);
      const montant = parseInt(document.getElementById('pc-montant').value||'0',10);
      if(montant<1){ flash(msg,'Montant invalide.','err'); return; }
      if(montant>creditActuel){ flash(msg,`Le montant dépasse le crédit en cours (${money(creditActuel)}).`,'err'); return; }
      ev.target.disabled = true;
      setDoc(doc(collection(db,'boutiques',currentBoutiqueId,'paiements')), {
        clientId: cPaie.id, clientNom: cPaie.nom, montant, date:todayISO(), dateHeure:nowISO(),
        employeId:currentUser.uid, employeNom:nomUtilisateurCourant()
      }).catch(e=>console.error('Erreur enregistrement paiement', e));
      enregistrerAudit('remboursement', 'client', cPaie.nom, `Crédit remboursé : ${money(montant)}`);
      clientEnPaiement = null;
      flash(msg, `Paiement de ${money(montant)} enregistré pour ${cPaie.nom}.`, 'ok');
      renderContent(); wireClients();
    });
  }

  const btnImporter = document.getElementById('c-importer');
  if(btnImporter) btnImporter.addEventListener('click', ()=>{ showImportCSV=true; showNouveauClient=false; analyseImport=null; renderContent(); wireClients(); });
  if(showImportCSV){
    document.getElementById('c-annuler-import').addEventListener('click', ()=>{ showImportCSV=false; analyseImport=null; renderContent(); wireClients(); });
    document.getElementById('c-modele-csv').addEventListener('click', ()=>telechargerTexte('modele-clients.csv', MODELE_CSV_CLIENTS));
    document.getElementById('c-fichier-csv').addEventListener('change', (ev)=>{
      const fichier = ev.target.files[0];
      if(!fichier) return;
      const reader = new FileReader();
      reader.onload = (e)=>{
        const { lignes } = parseCSV(e.target.result);
        analyseImport = validerLignesClients(lignes);
        renderApercuImportClients();
        document.getElementById('c-confirmer-import').disabled = !analyseImport.valides.length;
      };
      reader.readAsText(fichier);
    });
    renderApercuImportClients();
    document.getElementById('c-confirmer-import').addEventListener('click', async (ev)=>{
      if(ev.target.disabled || !analyseImport) return;
      ev.target.disabled = true;
      const msg = document.getElementById('msg-clients');
      const aImporter = analyseImport.valides;
      if(aImporter.length === 0){ flash(msg, t('aucune_ligne_a_importer'), 'err'); ev.target.disabled = false; return; }
      try{
        for(let i=0; i<aImporter.length; i+=450){
          const lot = aImporter.slice(i, i+450);
          const batch = writeBatch(db);
          lot.forEach(c=>{
            const ref = doc(collection(db,'boutiques',currentBoutiqueId,'clients'));
            batch.set(ref, { nom:c.nom, telephone:c.telephone, adresse:c.adresse, notes:c.notes, date_inscription: c.date_inscription || todayISO() });
          });
          await batch.commit();
        }
        enregistrerAudit('creation', 'client', 'Import CSV', `${aImporter.length} client(s) importé(s)`);
        showImportCSV = false; analyseImport = null;
        renderContent(); wireClients();
        flash(document.getElementById('msg-clients'), t('import_termine').replace('{n}', aImporter.length), 'ok');
      }catch(e){
        console.error('Erreur import CSV clients', e);
        flash(msg, t('erreur_generique'), 'err');
        ev.target.disabled = false;
      }
    });
  }
}
function renderApercuImportClients(){
  const conteneur = document.getElementById('c-import-apercu');
  if(!conteneur) return;
  if(!analyseImport){ conteneur.innerHTML = ''; return; }
  const { valides, erreurs } = analyseImport;
  conteneur.innerHTML = `
    <div class="msg ${valides.length?'ok':'err'}" style="display:block;">${valides.length ? t('lignes_valides_pretes').replace('{n}', valides.length) : t('aucune_ligne_a_importer')}</div>
    ${erreurs.length ? `<div class="msg err" style="display:block;max-height:160px;overflow-y:auto;">${t('lignes_en_erreur').replace('{n}', erreurs.length)}<br>${erreurs.slice(0,50).map(e=>t('ligne_erreur_detail').replace('{n}',e.ligne).replace('{raison}',e.raison)).join('<br>')}</div>` : ''}`;
}
