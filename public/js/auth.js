import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { state, SUPER_ADMIN_EMAIL } from './state.js';
import { nowISO } from './helpers.js';
import { langue, t, setLangue, prochaineLangue, nomLangue } from './i18n.js';
import { essaiGratuitExpire, calculerDureeSecondes } from './business-logic.js';
import { render } from './app-shell.js';
import { renderLogin } from './view-login.js';
import { renderAccueil } from './view-accueil.js';

export let currentUser = null;
export let currentBoutiqueId = null;
export let currentRole = null;
export let currentView = 'dashboard';
export let modeAdminSeul = false; // super-admin sans boutique associée : accès uniquement au panneau Administration
export let unsubs = [];
let connexionDocId = null;
let connexionDateDebut = null;
let connexionHeartbeat = null;

export function setCurrentView(v){ currentView = v; }

// Journal des connexions (collection top-level 'connexions', lecture réservée au super-admin —
// voir firestore.rules et view-connexions.js). Un ping périodique met à jour dernierePing pour
// qu'une session fermée sans déconnexion explicite (onglet fermé) ait quand même une durée
// approximative dans le journal.
async function demarrerJournalConnexion(boutiqueId, role){
  try{
    connexionDateDebut = nowISO();
    const ref = await addDoc(collection(db,'connexions'), {
      uid: currentUser.uid, email: currentUser.email, boutiqueId: boutiqueId || null, role: role || null,
      dateConnexion: connexionDateDebut, dernierePing: connexionDateDebut, dateDeconnexion: null, dureeSecondes: null,
      appareil: navigator.userAgent
    });
    connexionDocId = ref.id;
    if(connexionHeartbeat) clearInterval(connexionHeartbeat);
    connexionHeartbeat = setInterval(()=>{
      if(connexionDocId) updateDoc(doc(db,'connexions',connexionDocId), { dernierePing: nowISO() }).catch(()=>{});
    }, 90000);
  }catch(e){ console.error('Erreur journal de connexion', e); }
}
export async function deconnecter(){
  if(connexionHeartbeat){ clearInterval(connexionHeartbeat); connexionHeartbeat = null; }
  if(connexionDocId){
    const finISO = nowISO();
    try{
      await updateDoc(doc(db,'connexions',connexionDocId), {
        dateDeconnexion: finISO, dernierePing: finISO,
        dureeSecondes: calculerDureeSecondes(connexionDateDebut, finISO)
      });
    }catch(e){ console.error('Erreur fermeture journal de connexion', e); }
    connexionDocId = null;
    connexionDateDebut = null;
  }
  await signOut(auth);
}

export function estSuperAdmin(){ return !!currentUser && currentUser.email === SUPER_ADMIN_EMAIL; }
export function abonnementExpire(){
  if(state.plan === 'gratuit') return essaiGratuitExpire(state.dateCreation);
  if(!state.dateExpirationAbonnement) return false;
  return new Date(state.dateExpirationAbonnement + 'T23:59:59') < new Date();
}

export function renderSansBoutique(){
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div style="text-align:right;margin-bottom:10px;"><button id="sb-lang" class="mini-link">${nomLangue(prochaineLangue(langue))}</button></div>
      <h2>${t('aucun_acces_titre')}</h2>
      <p>${t('sans_boutique_texte').replace('{email}', currentUser.email)}</p>
      <button class="btn btn-primaire" id="sb-logout" style="width:100%;">${t('deconnexion')}</button>
    </div>
  </div>`;
  document.getElementById('sb-logout').addEventListener('click', ()=>deconnecter());
  document.getElementById('sb-lang').addEventListener('click', ()=>setLangue(prochaineLangue(langue), render));
}

export async function subscribeAll(boutiqueId){
  const boutiqueRef = doc(db, 'boutiques', boutiqueId);
  const unsubBoutique = onSnapshot(boutiqueRef, (snap)=>{
    const data = snap.data() || {};
    state.plan = data.plan || 'gratuit';
    state.nomBoutique = data.nomBoutique || '';
    state.adresseBoutique = data.adresseBoutique || '';
    state.telephoneBoutique = data.telephoneBoutique || '';
    state.logoBase64 = data.logoBase64 || '';
    state.dateExpirationAbonnement = data.dateExpirationAbonnement || null;
    state.dateCreation = data.dateCreation || null;
    render();
  });
  unsubs.push(unsubBoutique);

  const collections = ['produits','ventes','achats','depenses','clients','utilisateurs','paiements','fournisseurs','paiementsFournisseurs','productions','retours','journalAudit'];
  collections.forEach(nom=>{
    const colRef = collection(db, 'boutiques', boutiqueId, nom);
    const unsub = onSnapshot(colRef, (snap)=>{
      state[nom] = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      render();
    }, (err)=>{ console.error('Erreur de synchro '+nom, err); });
    unsubs.push(unsub);
  });
  render();
}

onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  unsubs.forEach(u=>u());
  unsubs = [];
  if(user){
    try{
      const membreSnap = await getDoc(doc(db,'membres',user.uid));
      if(!membreSnap.exists() && user.email === SUPER_ADMIN_EMAIL){
        // Le super-admin n'est pas forcément rattaché à une boutique : accès direct au panneau Administration.
        currentBoutiqueId = null;
        currentRole = null;
        modeAdminSeul = true;
        currentView = 'apercu';
        demarrerJournalConnexion(null, 'Super-admin');
        render();
        return;
      }
      if(!membreSnap.exists()){
        // Compte créé avant le système de rôles : on le reconnaît comme Propriétaire de sa propre boutique.
        // Ce chemin peut aussi s'exécuter en course avec l'inscription elle-même (view-login.js écrit les
        // mêmes documents juste après createUserWithEmailAndPassword, et onAuthStateChanged peut se
        // déclencher avant que ces écritures n'arrivent) — donc ne jamais toucher ici aux champs
        // d'abonnement (plan/dateCreation) : si le document boutiques/{uid} existe déjà (créé entre-temps
        // par l'inscription, ou boutique payante historique), les règles Firestore interdisent à un
        // Propriétaire de les modifier via une mise à jour, ce qui ferait échouer tout le bloc et
        // afficherait "Aucun accès" à un client qui vient pourtant de créer son compte avec succès.
        try{
          await setDoc(doc(db,'boutiques',user.uid,'utilisateurs',user.uid), { nom:'Propriétaire', email:user.email, role:'Propriétaire', dateAjout:nowISO() }, { merge:true });
          await setDoc(doc(db,'membres',user.uid), { boutiqueId:user.uid, role:'Propriétaire', email:user.email });
          await setDoc(doc(db,'boutiques',user.uid), { existe:true, emailProprietaire:user.email }, { merge:true });
        }catch(e){
          renderSansBoutique();
          return;
        }
        currentBoutiqueId = user.uid;
        currentRole = 'Propriétaire';
        currentView = 'dashboard';
        demarrerJournalConnexion(currentBoutiqueId, currentRole);
        subscribeAll(currentBoutiqueId);
        return;
      }
      const data = membreSnap.data();
      currentBoutiqueId = data.boutiqueId;
      currentRole = data.role;
      currentView = 'dashboard';
      modeAdminSeul = false;
      demarrerJournalConnexion(currentBoutiqueId, currentRole);
      subscribeAll(currentBoutiqueId);
    }catch(e){
      renderSansBoutique();
    }
  } else {
    currentBoutiqueId = null;
    currentRole = null;
    renderAccueil();
  }
});
