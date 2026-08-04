import { test, expect } from '@playwright/test';

// Le panneau Administration (réservé au super-admin, identifié par son email — voir
// SUPER_ADMIN_EMAIL dans state.js) permet de créer une boutique de test jetable puis de la
// supprimer, pour vérifier le bouton de suppression de bout en bout sans toucher à la boutique de
// démo partagée avec les autres specs.
const SUPER_ADMIN_EMAIL = 'mahdiou.diallo@gmail.com';
const SUPER_ADMIN_PASSWORD = 'motdepasseAdmin123';
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

async function creerOuRecupererSuperAdmin() {
  const signUp = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD, returnSecureToken: true })
  });
  const data = await signUp.json();
  if (data.error && data.error.message !== 'EMAIL_EXISTS') {
    throw new Error('Échec de création du compte super-admin de test : ' + JSON.stringify(data.error));
  }
}

test('le super-admin peut créer puis supprimer définitivement une boutique', async ({ page }) => {
  await creerOuRecupererSuperAdmin();

  await page.goto('/?e2e=1');
  await page.locator('#acc-connexion').click();
  await page.locator('#login-email').fill(SUPER_ADMIN_EMAIL);
  await page.locator('#login-pass').fill(SUPER_ADMIN_PASSWORD);
  await page.locator('#login-submit').click();
  await expect(page.locator('.nav-btn[data-view="admin"]')).toBeVisible({ timeout: 15000 });
  await page.locator('.nav-btn[data-view="admin"]').click();

  const nomBoutiqueTest = `Boutique Jetable ${Date.now()}`;
  await page.locator('#adm-nouvelle-boutique').click();
  await page.locator('#ab-nom').fill(nomBoutiqueTest);
  await page.locator('#ab-email').fill(`jetable-${Date.now()}@exemple.com`);
  await page.locator('#ab-pass').fill('motdepasse123');
  await page.locator('#ab-save').click();

  const ligne = page.locator('#admin-table tr', { hasText: nomBoutiqueTest });
  await expect(ligne).toBeVisible({ timeout: 10000 });

  await ligne.locator('[data-role="supprimer-boutique"]').click();
  await expect(page.locator('.csec-box')).toBeVisible();
  await page.locator('#csec-mdp').fill(SUPER_ADMIN_PASSWORD);
  await page.locator('#csec-confirmer').click();

  await expect(page.locator('#msg-admin')).toContainText('supprimée', { timeout: 10000 });
  await expect(page.locator('#admin-table')).not.toContainText(nomBoutiqueTest);
});
