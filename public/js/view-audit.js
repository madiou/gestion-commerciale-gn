import { state } from './state.js';
import { t } from './i18n.js';
import { fmtDateHeure } from './helpers.js';

function libelleAction(action){
  return {
    suppression: t('audit_action_suppression'),
    changement_role: t('audit_action_changement_role'),
    creation: t('audit_action_creation'),
    remboursement: t('audit_action_remboursement'),
    modification_stock: t('audit_action_modification_stock'),
  }[action] || action;
}
function libelleCible(cible){
  return { client: t('audit_cible_client'), produit: t('audit_cible_produit'), fournisseur: t('audit_cible_fournisseur'), utilisateur: t('audit_cible_utilisateur') }[cible] || cible;
}

export function viewAudit(){
  const entrees = state.journalAudit.slice().sort((a,b)=>(b.dateHeure||'').localeCompare(a.dateHeure||''));
  return `
  <div class="panel">
    <table>
      <tr><th>${t('date_heure')}</th><th>${t('effectue_par')}</th><th>${t('action')}</th><th>${t('cible')}</th><th>${t('details')}</th></tr>
      ${entrees.length ? entrees.map(e=>`<tr>
        <td>${fmtDateHeure(e.dateHeure)}</td>
        <td>${e.utilisateurNom||e.utilisateurEmail||'—'}</td>
        <td>${libelleAction(e.action)}</td>
        <td>${libelleCible(e.cible)}${e.nomCible?` — ${e.nomCible}`:''}</td>
        <td>${e.details||'—'}</td>
      </tr>`).join('') : `<tr><td colspan="5" style="color:var(--texte-att);">${t('aucune_entree_audit')}</td></tr>`}
    </table>
  </div>`;
}
export function wireAudit(){}
