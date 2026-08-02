import { state, limitesDuPlan } from './state.js';
import { t } from './i18n.js';
import { money, fmtDate } from './helpers.js';
import { statutStock, tagStatut, ventesCeMois, debutPeriode, renderContent } from './app-shell.js';
import { creditClient } from './view-clients.js';

let dashboardPeriode = 'jour';

function derniersJours(n){
  const jours = [];
  const auj = new Date();
  for(let i=n-1;i>=0;i--){
    const d = new Date(auj);
    d.setDate(d.getDate()-i);
    jours.push(d.toISOString().slice(0,10));
  }
  return jours;
}

function caParJour(){
  const jours = derniersJours(14);
  const totaux = {};
  jours.forEach(j=>totaux[j]=0);
  state.ventes.forEach(v=>{ if(totaux[v.date]!==undefined) totaux[v.date]+=v.total; });
  state.retours.forEach(r=>{ if(totaux[r.date]!==undefined) totaux[r.date]-=r.total; });
  return jours.map(j=>({ date:j, valeur:totaux[j] }));
}

function valeurNiceMax(val){
  if(val<=0) return 10000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val/magnitude;
  const nice = norm<=1 ? 1 : norm<=2 ? 2 : norm<=5 ? 5 : 10;
  return nice*magnitude;
}

function valeurCompacte(n){
  if(n>=1000000) return (n/1000000).toFixed(1).replace('.0','')+'M';
  if(n>=1000) return Math.round(n/1000)+'k';
  return String(Math.round(n));
}

function graphiqueTendanceHTML(){
  const data = caParJour();
  const total = data.reduce((s,d)=>s+d.valeur,0);
  if(state.ventes.length===0 && total===0){
    return `<div style="color:var(--texte-att);font-size:13px;padding:20px 0;">${t('pas_assez_donnees')}</div>`;
  }
  const max = valeurNiceMax(Math.max(...data.map(d=>d.valeur), 1));
  const W=700, H=220, ml=44, mr=10, mt=16, mb=28;
  const pw=W-ml-mr, ph=H-mt-mb;
  const band = pw/data.length;
  const barW = Math.min(24, band-10);
  const barX0 = (band-barW)/2;
  const grille = [0, max*0.5, max].map(p=>{
    const y = mt+ph-(p/max)*ph;
    return `<line x1="${ml}" y1="${y.toFixed(1)}" x2="${W-mr}" y2="${y.toFixed(1)}" class="grille"/><text x="${ml-8}" y="${(y+4).toFixed(1)}" class="axe" text-anchor="end">${valeurCompacte(p)}</text>`;
  }).join('');
  const barres = data.map((d,i)=>{
    const x = ml + i*band + barX0;
    const h = max>0 ? (d.valeur/max)*ph : 0;
    const y = mt+ph-h;
    const r = Math.min(4, h/2);
    const chemin = h<=0.5 ? '' :
      `M${x.toFixed(1)},${(mt+ph).toFixed(1)} L${x.toFixed(1)},${(y+r).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x+r).toFixed(1)},${y.toFixed(1)} L${(x+barW-r).toFixed(1)},${y.toFixed(1)} Q${(x+barW).toFixed(1)},${y.toFixed(1)} ${(x+barW).toFixed(1)},${(y+r).toFixed(1)} L${(x+barW).toFixed(1)},${(mt+ph).toFixed(1)} Z`;
    const jourLabel = d.date.slice(8,10);
    return `<g class="barre-jour" tabindex="0" role="img" aria-label="${fmtDate(d.date)} : ${money(d.valeur)}" data-date="${fmtDate(d.date)}" data-valeur="${money(d.valeur)}">
      <rect x="${(x-4).toFixed(1)}" y="${mt}" width="${(barW+8).toFixed(1)}" height="${ph}" fill="transparent"/>
      ${chemin?`<path d="${chemin}" class="barre"/>`:`<line x1="${x.toFixed(1)}" y1="${(mt+ph).toFixed(1)}" x2="${(x+barW).toFixed(1)}" y2="${(mt+ph).toFixed(1)}" class="barre-vide"/>`}
      <text x="${(x+barW/2).toFixed(1)}" y="${H-8}" class="axe" text-anchor="middle">${jourLabel}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow:visible;">${grille}${barres}</svg>`;
}

export function viewDashboard(){
  const debut = debutPeriode(dashboardPeriode);
  const vPeriode = state.ventes.filter(v=>v.date>=debut);
  const rPeriode = state.retours.filter(r=>r.date>=debut);
  const ca = vPeriode.reduce((s,v)=>s+v.total,0) - rPeriode.reduce((s,r)=>s+r.total,0);
  const benefice = vPeriode.reduce((s,v)=>s+v.lignes.reduce((s2,l)=>s2+(l.prix_vente-l.cout)*l.qte,0),0)
    - rPeriode.reduce((s,r)=>s+r.lignes.reduce((s2,l)=>s2+(l.prix_vente-(l.cout||0))*l.qte,0),0);
  const creditsClients = state.clients.reduce((s,c)=>s+creditClient(c),0) + (()=>{
    // Ventes à crédit sans fiche client associée (client comptant impossible normalement, garde-fou)
    const sansFiche = state.ventes.filter(v=>v.paiement==='Crédit client' && !state.clients.find(c=>c.id===v.clientId || c.nom===v.client));
    return sansFiche.reduce((s,v)=>s+v.total,0);
  })();
  const produitsBas = state.produits.filter(p=>statutStock(p)!=='ok');
  const ventesParProduit = {};
  vPeriode.forEach(v=>v.lignes.forEach(l=>{ ventesParProduit[l.nom]=(ventesParProduit[l.nom]||0)+l.qte; }));
  const top = Object.entries(ventesParProduit).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxTop = top.length? top[0][1] : 1;

  const nbProduits = state.produits.length;
  const nbVentesMois = ventesCeMois().length;
  const limites = limitesDuPlan(state.plan);
  const procheLimiteProduits = isFinite(limites.produits) && nbProduits >= limites.produits*0.8;
  const procheLimiteVentes = isFinite(limites.ventesMois) && nbVentesMois >= limites.ventesMois*0.8;
  const banniereFreemium = (procheLimiteProduits || procheLimiteVentes) ? `
    <div class="msg err" style="display:block;margin-bottom:16px;">
      ${procheLimiteProduits?`${t('proche_limite_produits')} (${nbProduits}/${limites.produits}). `:''}
      ${procheLimiteVentes?`${t('proche_limite_ventes')} (${nbVentesMois}/${limites.ventesMois}). `:''}
      ${t('envisagez_payant')}
    </div>` : '';

  return `
  <div class="pill-toggle">
    ${['jour','semaine','mois','trimestre','semestre','annee'].map(p=>`<button data-p="${p}" class="${dashboardPeriode===p?'active':''}">${t(p)}</button>`).join('')}
  </div>
  ${banniereFreemium}
  <div class="stats">
    <div class="stat-card"><div class="label">${t('ca_jour').replace(' (jour)','').replace(' (today)','')}</div><div class="valeur">${money(ca)}</div><div class="delta">${vPeriode.length} ${t('ventes_sur_periode')}</div></div>
    <div class="stat-card"><div class="label">${t('benefice_jour').replace(' (jour)','').replace(' (today)','')}</div><div class="valeur">${money(benefice)}</div></div>
    <div class="stat-card"><div class="label">${t('credits_clients')}</div><div class="valeur">${money(creditsClients)}</div></div>
    <div class="stat-card ${produitsBas.length?'alerte':''}"><div class="label">${t('stock_faible')}</div><div class="valeur">${produitsBas.length}</div><div class="delta">${produitsBas.length?t('reappro'):t('aucune_alerte')}</div></div>
  </div>
  <div class="panel" style="margin-bottom:16px;">
    <h3>${t('tendance_ventes')} <span style="text-transform:none;font-weight:400;color:var(--texte-att);letter-spacing:0;">(${t('derniers_14_jours')})</span></h3>
    ${graphiqueTendanceHTML()}
  </div>
  <div class="panels">
    <div class="panel">
      <h3>${t('top_produits').replace(' (total)','')}</h3>
      ${top.length? top.map(([nom,qte])=>`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13px;">
          <div style="width:110px;flex-shrink:0;color:var(--texte-att);">${nom}</div>
          <div style="flex:1;background:#EEEAE0;border-radius:4px;height:16px;overflow:hidden;"><div style="height:100%;background:linear-gradient(90deg,var(--vert),var(--vert-clair));width:${(qte/maxTop*100).toFixed(0)}%;"></div></div>
          <div style="width:60px;text-align:right;font-weight:600;">${qte} u.</div>
        </div>`).join('') : `<div style="color:var(--texte-att);font-size:13px;">${t('pas_de_ventes')}</div>`}
    </div>
    <div class="panel">
      <h3>${t('alertes_stock')}</h3>
      <table>
        <tr><th>${t('produit')}</th><th>${t('restant')}</th><th>${t('statut')}</th></tr>
        ${state.produits.slice().sort((a,b)=>a.stock-b.stock).map(p=>`<tr><td>${p.nom}</td><td>${p.stock}</td><td>${tagStatut(statutStock(p))}</td></tr>`).join('')}
      </table>
    </div>
  </div>`;
}
function positionnerTooltip(g, x, y){
  let tip = document.getElementById('tendance-tooltip');
  if(!tip){
    tip = document.createElement('div');
    tip.id = 'tendance-tooltip';
    tip.style.cssText = 'position:fixed;background:var(--vert-fonce);color:#fff;padding:6px 10px;border-radius:5px;font-size:12px;line-height:1.5;pointer-events:none;z-index:100;white-space:nowrap;transform:translate(-50%,-100%);';
    document.body.appendChild(tip);
  }
  tip.textContent = '';
  const fort = document.createElement('strong');
  fort.textContent = g.dataset.valeur;
  tip.appendChild(fort);
  tip.appendChild(document.createElement('br'));
  tip.appendChild(document.createTextNode(g.dataset.date));
  tip.style.display = 'block';
  tip.style.left = x+'px';
  tip.style.top = (y-10)+'px';
}
function masquerTooltip(){
  const tip = document.getElementById('tendance-tooltip');
  if(tip) tip.style.display = 'none';
}

export function wireDashboard(){
  document.querySelectorAll('.pill-toggle button').forEach(b=>b.addEventListener('click', ()=>{ dashboardPeriode=b.dataset.p; renderContent(); wireDashboard(); }));
  document.querySelectorAll('.barre-jour').forEach(g=>{
    g.addEventListener('mousemove', e=>positionnerTooltip(g, e.clientX, e.clientY));
    g.addEventListener('mouseleave', masquerTooltip);
    g.addEventListener('focus', ()=>{ const r=g.getBoundingClientRect(); positionnerTooltip(g, r.left+r.width/2, r.top); });
    g.addEventListener('blur', masquerTooltip);
  });
}
