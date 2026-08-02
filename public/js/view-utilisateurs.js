import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { doc, deleteDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { db, firebaseConfig } from './firebase-config.js';
import { currentUser, currentBoutiqueId } from './auth.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { nowISO, fmtDateHeure, flash, creerMessagePersistant } from './helpers.js';
import { rolesDisponibles } from './business-logic.js';
import { renderContent, enregistrerAudit } from './app-shell.js';
import { demanderConfirmationMotDePasse } from './confirmation-securisee.js';

function libelleRole(role){ return role==='Gérant' ? t('role_gerant') : t('role_vendeur'); }

let showNouvelUtilisateur = false;
const messageUtilisateurs = creerMessagePersistant(()=>{ renderContent(); wireUtilisateurs(); });

export async function creerCompteEmploye(email, motDePasse){
  const appSecondaire = initializeApp(firebaseConfig, 'secondaire-'+Date.now());
  const authSecondaire = getAuth(appSecondaire);
  try{
    const cred = await createUserWithEmailAndPassword(authSecondaire, email, motDePasse);
    const newUid = cred.user.uid;
    await signOut(authSecondaire);
    await deleteApp(appSecondaire);
    return newUid;
  }catch(e){
    await deleteApp(appSecondaire).catch(()=>{});
    throw e;
  }
}
export function viewUtilisateurs(){
  const rolesDispoCreation = rolesDisponibles(state.plan, state.utilisateurs, null);
  const limiteAtteinte = rolesDispoCreation.length === 0;
  return `
  ${messageUtilisateurs.html('msg-utilisateurs')}
  <div class="toolbar-stock">
    <div style="font-size:12px;color:var(--texte-att);">${t('acces_boutique_role')}</div>
    <button class="btn btn-primaire" id="u-nouveau" ${limiteAtteinte?'disabled title="'+t('limite_utilisateurs_atteinte')+'"':''}>${t('nouvel_utilisateur')}</button>
  </div>
  ${limiteAtteinte ? `<div class="msg err" style="display:block;">${t('limite_utilisateurs_atteinte')}</div>` : ''}
  <div class="form-wrap ${showNouvelUtilisateur && !limiteAtteinte?'':'hidden'}" id="u-form" style="margin-bottom:18px;">
    <div class="form-grid cols3">
      <div class="champ"><label>${t('nom')}</label><input type="text" id="nu-nom"></div>
      <div class="champ"><label>${t('email')}</label><input type="email" id="nu-email"></div>
      <div class="champ"><label>${t('mdp_temporaire')}</label><input type="text" id="nu-pass" placeholder="6 caractères minimum"></div>
    </div>
    <div class="champ" style="max-width:260px;margin-bottom:14px;">
      <label>${t('role')}</label>
      <select id="nu-role">${rolesDispoCreation.map(r=>`<option value="${r}">${libelleRole(r)}</option>`).join('')}</select>
    </div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button class="btn btn-primaire" id="nu-save">${t('creer_utilisateur')}</button>
      <button class="btn btn-secondaire" id="nu-cancel">${t('annuler')}</button>
    </div>
    <div style="margin-top:14px;font-size:12px;color:var(--texte-att);">${t('communiquer_identifiants')}</div>
  </div>
  <div class="stock-panel"><table id="u-table"></table></div>`;
}
function renderUtilisateursRows(){
  const tbl = document.getElementById('u-table');
  tbl.innerHTML = `<tr><th>${t('nom')}</th><th>${t('email')}</th><th>${t('role')}</th><th>${t('ajoute_le')}</th><th></th></tr>` +
    state.utilisateurs.map(u=>{
      const estMoi = u.id === currentUser.uid;
      const rolesAssignables = Array.from(new Set([u.role, ...rolesDisponibles(state.plan, state.utilisateurs, u.id)]));
      const celluleRole = u.role==='Propriétaire'
        ? t('role_proprietaire')
        : `<select data-role="changer-role" data-id="${u.id}" style="padding:5px 8px;border:1px solid var(--gris-bord);border-radius:5px;font-size:12px;">
             ${rolesAssignables.map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${libelleRole(r)}</option>`).join('')}
           </select>`;
      const boutonSupprimer = u.role==='Propriétaire'
        ? `<span style="font-size:11px;color:var(--texte-att);">—</span>`
        : `<button class="btn-danger" data-id="${u.id}" data-role="del-utilisateur">${t('retirer_acces')}</button>`;
      return `<tr><td>${u.nom||'—'}${estMoi?t('vous'):''}</td><td>${u.email}</td><td>${celluleRole}</td><td>${fmtDateHeure(u.dateAjout)}</td><td>${boutonSupprimer}</td></tr>`;
    }).join('') || `<tr><td colspan="5" style="color:var(--texte-att);">${t('aucun_utilisateur')}</td></tr>`;
  document.querySelectorAll('[data-role="del-utilisateur"]').forEach(b=>b.addEventListener('click', ()=>{
    const utilisateur = state.utilisateurs.find(u=>u.id===b.dataset.id);
    demanderConfirmationMotDePasse({
      titre: t('confirmer_retrait_acces_titre'),
      message: t('confirmer_retrait_acces_message'),
      onConfirme: () => {
        deleteDoc(doc(db,'boutiques',currentBoutiqueId,'utilisateurs',b.dataset.id)).catch(e=>console.error('Erreur retrait utilisateur', e));
        deleteDoc(doc(db,'membres',b.dataset.id)).catch(()=>{});
        enregistrerAudit('suppression', 'utilisateur', utilisateur ? (utilisateur.nom||utilisateur.email) : b.dataset.id);
      }
    });
  }));
  document.querySelectorAll('[data-role="changer-role"]').forEach(sel=>sel.addEventListener('change', ()=>{
    const nouveauRole = sel.value;
    const utilisateur = state.utilisateurs.find(u=>u.id===sel.dataset.id);
    const ancienRole = utilisateur ? utilisateur.role : '?';
    updateDoc(doc(db,'boutiques',currentBoutiqueId,'utilisateurs',sel.dataset.id), { role:nouveauRole }).catch(e=>console.error('Erreur changement de rôle', e));
    updateDoc(doc(db,'membres',sel.dataset.id), { role:nouveauRole }).catch(e=>console.error('Erreur changement de rôle', e));
    enregistrerAudit('changement_role', 'utilisateur', utilisateur ? (utilisateur.nom||utilisateur.email) : sel.dataset.id, `${ancienRole} → ${nouveauRole}`);
    messageUtilisateurs.afficher(`Rôle mis à jour : ${nouveauRole}.`, 'ok');
  }));
}
export function wireUtilisateurs(){
  renderUtilisateursRows();
  const btnNouveau = document.getElementById('u-nouveau');
  if(!btnNouveau.disabled) btnNouveau.addEventListener('click', ()=>{ showNouvelUtilisateur=true; renderContent(); wireUtilisateurs(); });
  if(showNouvelUtilisateur && document.getElementById('nu-cancel')){
    document.getElementById('nu-cancel').addEventListener('click', ()=>{ showNouvelUtilisateur=false; renderContent(); wireUtilisateurs(); });
    document.getElementById('nu-save').addEventListener('click', async (ev)=>{
      if(ev.target.disabled) return;
      const msg = document.getElementById('msg-utilisateurs');
      const nom = document.getElementById('nu-nom').value.trim();
      const email = document.getElementById('nu-email').value.trim();
      const pass = document.getElementById('nu-pass').value;
      const role = document.getElementById('nu-role').value;
      if(!nom || !email || pass.length<6){ flash(msg,'Remplissez le nom, un e-mail valide et un mot de passe de 6 caractères minimum.','err'); return; }
      if(!rolesDisponibles(state.plan, state.utilisateurs, null).includes(role)){ flash(msg, t('limite_utilisateurs_atteinte'), 'err'); return; }
      ev.target.disabled = true;
      try{
        const newUid = await creerCompteEmploye(email, pass);
        await setDoc(doc(db,'boutiques',currentBoutiqueId,'utilisateurs',newUid), { nom, email, role, dateAjout:nowISO() });
        await setDoc(doc(db,'membres',newUid), { boutiqueId:currentBoutiqueId, role, email });
        showNouvelUtilisateur = false;
        messageUtilisateurs.afficher(`Utilisateur "${nom}" créé. Communiquez-lui ses identifiants.`, 'ok');
      }catch(e){
        flash(msg, e.code==='auth/email-already-in-use' ? 'Cet e-mail est déjà utilisé par un autre compte.' : "Erreur lors de la création du compte.", 'err');
        ev.target.disabled = false;
      }
    });
  }
}
