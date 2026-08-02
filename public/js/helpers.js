export const FR = new Intl.NumberFormat('fr-FR');
export const money = n => FR.format(Math.round(n||0)) + ' GNF';
// Devise des tarifs d'abonnement (plans Standard/Pro/Entreprise) uniquement — distincte de money()
// qui reste en GNF pour les montants métier (ventes, achats, etc.).
const USD = new Intl.NumberFormat('en-US', { minimumFractionDigits:0, maximumFractionDigits:2 });
export const moneyUSD = n => '$' + USD.format(Number(n)||0);
export const todayISO = () => new Date().toISOString().slice(0,10);
export const nowISO = () => new Date().toISOString();
export const datetimeLocalParDefaut = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtDate = iso => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso || '');
  if(!m) return '—';
  return `${m[3].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[1]}`;
};
export const fmtDateHeure = iso => {
  if(!iso) return '—';
  let d = new Date(iso);
  if(isNaN(d.getTime())){
    // Certaines données historiques stockent l'heure sans zéro de tête (ex: "11:6" au lieu
    // de "11:06"), que le parseur natif refuse. On retente avec une lecture tolérante avant
    // d'abandonner, pour ne jamais afficher la chaîne brute non formatée à l'écran.
    const parties = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(iso);
    if(parties) d = new Date(Date.UTC(+parties[1], +parties[2]-1, +parties[3], +parties[4], +parties[5], +parties[6]));
  }
  if(isNaN(d.getTime())) return fmtDate(iso);
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
};
// Comme fmtDateHeure, mais avec le fuseau horaire du navigateur entre parenthèses — utile quand
// la donnée est consultée depuis un fuseau différent de celui de la boutique concernée (ex : le
// super-admin qui consulte le journal des connexions depuis un autre pays), pour éviter toute
// ambiguïté sur l'heure affichée.
export const fmtDateHeureAvecFuseau = iso => {
  const base = fmtDateHeure(iso);
  if(base === '—') return base;
  let tz = '';
  try{
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZoneName:'short' }).formatToParts(isNaN(d.getTime()) ? new Date() : d);
    tz = (parts.find(p=>p.type==='timeZoneName')||{}).value || '';
  }catch(e){}
  return tz ? `${base} (${tz})` : base;
};
export function flash(el,msg,type){
  if(!el) return;
  el.textContent = msg; el.className = 'msg '+type; el.style.display='block';
  setTimeout(()=>{ el.style.display='none'; }, 3500);
}
export function redimensionnerImage(file, maxDim){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else { if(h>maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = ()=>reject(new Error('Image invalide'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}
