import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { nowISO } from './helpers.js';
import { langue, t, setLangue, prochaineLangue, nomLangue } from './i18n.js';
import { render } from './app-shell.js';

let loginMode = 'connexion'; // ou 'inscription'

export function renderLogin(modeDepart){
  if(modeDepart) loginMode = modeDepart;
  const root = document.getElementById('root');
  root.className = '';
  if(loginMode==='reset'){
    root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div style="text-align:right;margin-bottom:10px;"><button id="login-lang" class="mini-link">${nomLangue(prochaineLangue(langue))}</button></div>
        <h2>${t('reinit_titre')}</h2>
        <p>${t('reinit_texte')}</p>
        <div class="msg err" id="login-msg"></div>
        <div class="msg ok" id="login-msg-ok"></div>
        <div class="champ"><label>${t('email')}</label><input type="email" id="reset-email" placeholder="vous@exemple.com"></div>
        <button class="btn btn-primaire" id="reset-submit" style="width:100%;">${t('envoyer_lien')}</button>
        <div class="login-toggle"><button id="reset-retour">${t('retour_connexion')}</button></div>
      </div>
    </div>`;
    document.getElementById('login-lang').addEventListener('click', ()=>setLangue(prochaineLangue(langue), render));
    document.getElementById('reset-retour').addEventListener('click', ()=>{ loginMode='connexion'; renderLogin(); });
    document.getElementById('reset-submit').addEventListener('click', async (ev)=>{
      if(ev.target.disabled) return;
      const email = document.getElementById('reset-email').value.trim();
      const msgErr = document.getElementById('login-msg');
      const msgOk = document.getElementById('login-msg-ok');
      msgErr.style.display='none'; msgOk.style.display='none';
      if(!email){ msgErr.textContent = t('indiquer_email'); msgErr.style.display='block'; return; }
      ev.target.disabled = true;
      try{
        await sendPasswordResetEmail(auth, email);
        msgOk.textContent = t('email_envoye');
        msgOk.style.display='block';
      }catch(e){
        msgErr.textContent = traduireErreur(e.code);
        msgErr.style.display='block';
      }
      ev.target.disabled = false;
    });
    return;
  }
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div style="text-align:right;margin-bottom:10px;"><button id="login-lang" class="mini-link">${nomLangue(prochaineLangue(langue))}</button></div>
      <h2>${t('login_titre')}</h2>
      <p>${loginMode==='connexion' ? t('login_connexion') : t('login_inscription')}</p>
      <div class="msg err" id="login-msg"></div>
      ${loginMode==='inscription' ? `<div class="champ"><label>${t('nom_boutique')}</label><input type="text" id="login-nom-boutique" placeholder="Ex : Boutique Diallo & Fils"></div>` : ''}
      <div class="champ"><label>${t('email')}</label><input type="email" id="login-email" placeholder="vous@exemple.com"></div>
      <div class="champ"><label>${t('mot_de_passe')}</label><input type="password" id="login-pass" placeholder="6 caractères minimum"></div>
      <button class="btn btn-primaire" id="login-submit" style="width:100%;">${loginMode==='connexion'?t('se_connecter'):t('creer_compte')}</button>
      <div class="login-toggle">
        ${loginMode==='connexion'
          ? `${t('pas_de_compte')} <button id="login-switch">${t('creer_compte')}</button><br><button id="login-mdp-oublie" style="margin-top:8px;">${t('mdp_oublie')}</button>`
          : `${t('deja_compte')} <button id="login-switch">${t('se_connecter')}</button>`}
      </div>
    </div>
  </div>`;
  document.getElementById('login-lang').addEventListener('click', ()=>setLangue(prochaineLangue(langue), render));
  document.getElementById('login-switch').addEventListener('click', ()=>{ loginMode = loginMode==='connexion'?'inscription':'connexion'; renderLogin(); });
  const btnOublie = document.getElementById('login-mdp-oublie');
  if(btnOublie) btnOublie.addEventListener('click', ()=>{ loginMode='reset'; renderLogin(); });
  document.getElementById('login-submit').addEventListener('click', async (ev)=>{
    if(ev.target.disabled) return;
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    const msg = document.getElementById('login-msg');
    msg.style.display='none';
    let nomBoutique = '';
    if(loginMode==='inscription'){
      nomBoutique = document.getElementById('login-nom-boutique').value.trim();
      if(!nomBoutique){ msg.textContent = t('nom_boutique_requis'); msg.style.display='block'; return; }
    }
    ev.target.disabled = true;
    try{
      if(loginMode==='connexion'){
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = cred.user.uid;
        await setDoc(doc(db,'boutiques',uid), { existe:true, plan:'gratuit', nomBoutique, emailProprietaire:email, dateCreation:nowISO() }, { merge:true });
        await setDoc(doc(db,'boutiques',uid,'utilisateurs',uid), { nom:'Propriétaire', email, role:'Propriétaire', dateAjout:nowISO() });
        await setDoc(doc(db,'membres',uid), { boutiqueId:uid, role:'Propriétaire', email });
      }
    }catch(e){
      msg.textContent = traduireErreur(e.code);
      msg.style.display='block';
    }
    ev.target.disabled = false;
  });
}
export function traduireErreur(code){
  const map = {
    'auth/invalid-email':'Adresse e-mail invalide.',
    'auth/user-not-found':'Aucun compte avec cet e-mail.',
    'auth/wrong-password':'Mot de passe incorrect.',
    'auth/invalid-credential':'E-mail ou mot de passe incorrect.',
    'auth/email-already-in-use':'Un compte existe déjà avec cet e-mail.',
    'auth/weak-password':'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/unauthorized-domain':"Ce site web n'est pas autorisé dans Firebase (Authentication > Settings > Domaines autorisés).",
    'auth/operation-not-allowed':"La connexion par e-mail/mot de passe n'est pas activée dans Firebase (Authentication > Sign-in method).",
    'auth/network-request-failed':'Problème de connexion réseau. Vérifiez votre connexion internet.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.':'Configuration Firebase invalide (clé API).',
    'auth/too-many-requests':'Trop de tentatives. Attendez un moment avant de réessayer.'
  };
  return (map[code] || 'Une erreur est survenue.') + ' (' + code + ')';
}
