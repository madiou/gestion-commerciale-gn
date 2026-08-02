import { test, expect } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PRODUIT_NOM } from './demo-data.js';

// `?e2e=1` bascule firebase-config.js vers les émulateurs Auth/Firestore (voir ce fichier) —
// sans ce paramètre, l'app pointerait vers le vrai projet Firebase de production.
async function seConnecter(page) {
  await page.goto('/?e2e=1');
  await page.locator('#acc-connexion').click();
  await page.locator('#login-email').fill(DEMO_EMAIL);
  await page.locator('#login-pass').fill(DEMO_PASSWORD);
  await page.locator('#login-submit').click();
  await expect(page.locator('.nav-btn[data-view="dashboard"]')).toBeVisible({ timeout: 15000 });
  // subscribeAll() ouvre une douzaine d'écouteurs onSnapshot Firestore dont les premières
  // livraisons arrivent chacune de façon asynchrone et déclenchent un re-rendu complet ; si on
  // remplit un champ de formulaire avant que ça se soit stabilisé, un de ces re-rendus tardifs
  // l'efface (les champs texte ne sont pas liés à un état persistant). `networkidle` ne convient
  // pas ici : les écouteurs Firestore sont des connexions persistantes (WebChannel), le réseau
  // n'est donc jamais vraiment "idle". On attend simplement que ça se stabilise.
  await page.waitForTimeout(800);
}

test('connexion, enregistrement d\'une vente, puis vérification dans le journal', async ({ page }) => {
  await seConnecter(page);

  await page.locator('.nav-btn[data-view="vente"]').click();
  await expect(page.locator('#v-produit')).toBeVisible();

  const optionValue = await page.locator('#v-produit option', { hasText: DEMO_PRODUIT_NOM }).getAttribute('value');
  await page.locator('#v-produit').selectOption(optionValue);
  await page.locator('#v-qte').fill('3');
  await page.locator('#v-add').click();
  await expect(page.locator('#v-lignes-zone')).toContainText(DEMO_PRODUIT_NOM);
  await expect(page.locator('#v-lignes-zone')).toContainText('30 000'); // 3 x 10 000

  await page.locator('#v-client').fill('Client E2E');
  await page.locator('#v-save').click();
  await expect(page.locator('#msg-vente')).toContainText('Vente enregistrée');
  await expect(page.locator('.stock-panel')).toContainText('Client E2E', { timeout: 10000 });

  await page.locator('.nav-btn[data-view="journal"]').click();
  await expect(page.locator('.panel table')).toContainText('Client E2E');
  await expect(page.locator('.panel table')).toContainText('30 000');
});

test('le stock diminue après une vente', async ({ page }) => {
  await seConnecter(page);
  await page.locator('.nav-btn[data-view="stock"]').click();
  const ligneProduit = page.locator('table tr', { hasText: DEMO_PRODUIT_NOM });
  await expect(ligneProduit).toBeVisible();
  const texteAvant = await ligneProduit.innerText();

  await page.locator('.nav-btn[data-view="vente"]').click();
  const optionValue = await page.locator('#v-produit option', { hasText: DEMO_PRODUIT_NOM }).getAttribute('value');
  await page.locator('#v-produit').selectOption(optionValue);
  await page.locator('#v-qte').fill('1');
  await page.locator('#v-add').click();
  await page.locator('#v-save').click();

  await page.locator('.nav-btn[data-view="stock"]').click();
  await expect(ligneProduit).not.toHaveText(texteAvant, { timeout: 10000 });
});

test('déconnexion ramène à l\'écran de connexion', async ({ page }) => {
  await seConnecter(page);
  await page.locator('#btn-logout').click();
  await expect(page.locator('#acc-connexion')).toBeVisible({ timeout: 10000 });
});
