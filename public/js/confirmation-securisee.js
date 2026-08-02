import { EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { t } from './i18n.js';

// Modale de confirmation par mot de passe pour les actions sensibles et irréversibles
// (suppression d'un fournisseur/client, retrait d'accès d'un utilisateur). Exige que la
// personne déjà connectée retape son mot de passe — protège contre une suppression accidentelle
// ou faite par quelqu'un qui profite d'une session Propriétaire restée ouverte, même si les
// règles Firestore autorisent déjà l'action pour ce rôle.
function traduireErreurReauth(code){
  const messages = {
    'auth/wrong-password': t('mot_de_passe_incorrect'),
    'auth/invalid-credential': t('mot_de_passe_incorrect'),
    'auth/too-many-requests': t('trop_de_tentatives'),
  };
  return messages[code] || t('erreur_generique');
}

export function demanderConfirmationMotDePasse({ titre, message, texteConfirmer, onConfirme }){
  const ancien = document.getElementById('csec-backdrop');
  if(ancien) ancien.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'csec-backdrop';
  backdrop.className = 'csec-backdrop';
  backdrop.innerHTML = `
    <div class="csec-box" role="dialog" aria-modal="true">
      <h3>${titre}</h3>
      <p>${message}</p>
      <div class="msg err" id="csec-msg"></div>
      <div class="champ"><label>${t('mot_de_passe')}</label><input type="password" id="csec-mdp" autocomplete="current-password"></div>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn-danger" id="csec-confirmer">${texteConfirmer || t('confirmer')}</button>
        <button class="btn btn-secondaire" id="csec-annuler">${t('annuler')}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const fermer = () => backdrop.remove();
  const champMdp = document.getElementById('csec-mdp');
  champMdp.focus();

  backdrop.addEventListener('click', (ev)=>{ if(ev.target === backdrop) fermer(); });
  document.getElementById('csec-annuler').addEventListener('click', fermer);

  const confirmer = async () => {
    const btn = document.getElementById('csec-confirmer');
    if(btn.disabled) return;
    const msg = document.getElementById('csec-msg');
    const motDePasse = champMdp.value;
    if(!motDePasse){ msg.textContent = t('mot_de_passe_requis'); msg.style.display = 'block'; return; }
    btn.disabled = true;
    msg.style.display = 'none';
    try{
      const credential = EmailAuthProvider.credential(auth.currentUser.email, motDePasse);
      await reauthenticateWithCredential(auth.currentUser, credential);
      fermer();
      onConfirme();
    }catch(e){
      msg.textContent = traduireErreurReauth(e.code);
      msg.style.display = 'block';
      btn.disabled = false;
      champMdp.focus();
      champMdp.select();
    }
  };
  document.getElementById('csec-confirmer').addEventListener('click', confirmer);
  champMdp.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter') confirmer(); if(ev.key === 'Escape') fermer(); });
}
