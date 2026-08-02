import { defineConfig, devices } from '@playwright/test';

// Tests end-to-end contre l'application réelle servie par l'émulateur Hosting, elle-même
// connectée aux émulateurs Auth + Firestore (voir la bascule `?e2e=1` dans firebase-config.js) —
// jamais contre le projet Firebase de production, pour ne prendre aucun risque avec les données
// réelles des boutiques clientes. Lancer via `npm run test:e2e`.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run emulators:e2e',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
