import { test, expect } from '@playwright/test';

// Parcours d'inscription depuis la page d'accueil (bouton "Essayer gratuitement"), pour un nouveau
// client qui crée sa propre boutique — distinct de vente.spec.js qui utilise le compte de démo
// pré-créé par global-setup.js.
test('un nouveau client peut créer son compte et sa boutique depuis la page d\'accueil', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.locator('#acc-essai').click();

  await expect(page.locator('#login-nom-boutique')).toBeVisible();
  await page.locator('#login-nom-boutique').fill('Boutique Nouvelle Cliente');
  await page.locator('#login-email').fill(`nouvelle-cliente-${Date.now()}@exemple.com`);
  await page.locator('#login-pass').fill('motdepasse123');
  await page.locator('#login-submit').click();

  // onAuthStateChanged (auth.js) se déclenche systématiquement avant que les écritures Firestore de
  // l'inscription (view-login.js) n'aient atteint le serveur — c'est le chemin de repli "compte créé
  // avant le système de rôles" qui gère cette course, pas une exception dans le flux normal. S'il
  // touchait aux champs d'abonnement (plan/dateCreation) lors de cette reprise, les règles Firestore
  // le rejetteraient et l'utilisateur resterait bloqué sur l'écran "Aucun accès trouvé" — régression
  // vérifiée ici.
  await expect(page.locator('.nav-btn[data-view="dashboard"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('body')).not.toContainText('Aucun accès trouvé');
});
