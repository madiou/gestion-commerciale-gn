import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { currentBoutiqueId } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { flash, redimensionnerImage } from './helpers.js';
import { exporterSauvegardeComplete } from './app-shell.js';

let logoTemp = null; // null = pas de changement, '' = suppression demandée, sinon nouvelle image en base64

export function viewParametres(){
  logoTemp = null;
  const logoActuel = state.logoBase64;
  return `
  <div class="msg ok" id="msg-parametres"></div>
  <div class="form-wrap">
    <div class="form-grid">
      <div class="champ"><label>${t('nom_boutique')}</label><input type="text" id="pb-nom" value="${state.nomBoutique||''}" placeholder="Ex : Boutique Diallo & Fils"></div>
      <div class="champ"><label>${t('telephone')}</label><input type="text" id="pb-tel" value="${state.telephoneBoutique||''}" placeholder="Ex : 622 00 00 00"></div>
    </div>
    <div class="champ" style="margin-bottom:14px;"><label>${t('adresse')}</label><input type="text" id="pb-adresse" value="${state.adresseBoutique||''}" placeholder="Ex : Marché Madina, Conakry"></div>
    <div class="champ" style="margin-bottom:14px;max-width:320px;">
      <label>${t('logo_boutique')}</label>
      <div style="display:flex;align-items:center;gap:14px;margin-top:4px;">
        <div id="pb-logo-apercu" style="width:70px;height:70px;border:1px dashed var(--gris-bord);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#FEFDFB;">
          ${logoActuel ? `<img src="${logoActuel}" style="width:100%;height:100%;object-fit:contain;">` : `<span style="font-size:10px;color:var(--texte-att);">${t('aucun')}</span>`}
        </div>
        <div>
          <input type="file" id="pb-logo-input" accept="image/*" style="font-size:12px;">
          ${logoActuel ? `<div style="margin-top:6px;"><button class="mini-link" id="pb-logo-suppr">${t('supprimer_logo')}</button></div>` : ''}
        </div>
      </div>
    </div>
    <button class="btn btn-primaire" id="pb-save">${t('enregistrer')}</button>
    <div style="margin-top:14px;font-size:12px;color:var(--texte-att);">${t('apparait_recu')}</div>
  </div>
  <div class="form-wrap" style="margin-top:18px;max-width:600px;">
    <h3 style="margin-top:0;border:none;padding:0;color:var(--vert-fonce);">${t('sauvegarde_donnees')}</h3>
    <div style="font-size:13px;color:var(--texte-att);margin-bottom:14px;">${t('sauvegarde_description')}</div>
    <button class="btn btn-secondaire" id="pb-sauvegarde">${t('telecharger_sauvegarde')}</button>
  </div>`;
}
export function wireParametres(){
  document.getElementById('pb-logo-input').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    if(!file.type.startsWith('image/')){ alert('Merci de choisir un fichier image.'); return; }
    try{
      const dataUrl = await redimensionnerImage(file, 300);
      logoTemp = dataUrl;
      document.getElementById('pb-logo-apercu').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;">`;
    }catch(err){ alert("Impossible de traiter cette image."); }
  });
  const btnSuppr = document.getElementById('pb-logo-suppr');
  if(btnSuppr) btnSuppr.addEventListener('click', ()=>{
    logoTemp = '';
    document.getElementById('pb-logo-apercu').innerHTML = `<span style="font-size:10px;color:var(--texte-att);">Aucun</span>`;
  });
  document.getElementById('pb-save').addEventListener('click', (ev)=>{
    if(ev.target.disabled) return;
    const msg = document.getElementById('msg-parametres');
    ev.target.disabled = true;
    const donnees = {
      nomBoutique: document.getElementById('pb-nom').value.trim(),
      telephoneBoutique: document.getElementById('pb-tel').value.trim(),
      adresseBoutique: document.getElementById('pb-adresse').value.trim()
    };
    if(logoTemp !== null) donnees.logoBase64 = logoTemp;
    setDoc(doc(db,'boutiques',currentBoutiqueId), donnees, { merge:true }).catch(e=>console.error('Erreur enregistrement paramètres', e));
    logoTemp = null;
    flash(msg, 'Informations enregistrées.', 'ok');
    ev.target.disabled = false;
  });
  document.getElementById('pb-sauvegarde').addEventListener('click', ()=>{
    exporterSauvegardeComplete();
  });
}
