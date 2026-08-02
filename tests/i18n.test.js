import '../tests/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { t, langue, setLangue, traduireRole, traduirePaiement } from '../public/js/i18n.js';

describe('t (traduction)', () => {
  test('renvoie la traduction française par défaut', () => {
    assert.equal(t('nav_dashboard'), 'Tableau de bord');
  });
  test('renvoie la clé elle-même si elle est introuvable', () => {
    assert.equal(t('cle_qui_nexiste_pas'), 'cle_qui_nexiste_pas');
  });
});

describe('setLangue', () => {
  test('change la langue courante et déclenche le callback', () => {
    let appele = false;
    setLangue('en', () => { appele = true; });
    assert.equal(langue, 'en');
    assert.equal(t('nav_dashboard'), 'Dashboard');
    assert.equal(appele, true);
    setLangue('fr'); // remet l'état par défaut pour les autres tests
  });
  test("fonctionne sans callback fourni", () => {
    assert.doesNotThrow(() => setLangue('en'));
    setLangue('fr');
  });
});

describe('traduireRole', () => {
  test('traduit les rôles connus', () => {
    assert.equal(traduireRole('Propriétaire'), 'Propriétaire');
    assert.equal(traduireRole('Gérant'), 'Gérant');
    assert.equal(traduireRole('Vendeur'), 'Vendeur');
  });
  test('renvoie la valeur telle quelle si le rôle est inconnu', () => {
    assert.equal(traduireRole('RoleInconnu'), 'RoleInconnu');
  });
});

describe('traduirePaiement', () => {
  test('traduit les modes de paiement connus', () => {
    assert.equal(traduirePaiement('Espèces'), 'Espèces');
    assert.equal(traduirePaiement('Crédit client'), 'Crédit client');
    assert.equal(traduirePaiement('Mobile money'), 'Mobile money');
    assert.equal(traduirePaiement('Dette fournisseur'), 'Dette fournisseur');
  });
  test('renvoie la valeur telle quelle si le mode est inconnu', () => {
    assert.equal(traduirePaiement('Chèque'), 'Chèque');
  });
});
