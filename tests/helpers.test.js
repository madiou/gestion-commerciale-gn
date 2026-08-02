import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { money, todayISO, nowISO, fmtDate, fmtDateHeure, fmtDateHeureAvecFuseau, datetimeLocalParDefaut } from '../public/js/helpers.js';

const FR = new Intl.NumberFormat('fr-FR');

describe('money', () => {
  test('formate un montant entier avec le suffixe GNF', () => {
    assert.equal(money(1000), FR.format(1000) + ' GNF');
  });
  test('arrondit les décimales', () => {
    assert.equal(money(1000.6), FR.format(1001) + ' GNF');
  });
  test('traite undefined/null comme 0', () => {
    assert.equal(money(undefined), FR.format(0) + ' GNF');
    assert.equal(money(null), FR.format(0) + ' GNF');
  });
  test('gère les montants négatifs', () => {
    assert.equal(money(-500), FR.format(-500) + ' GNF');
  });
});

describe('todayISO / nowISO', () => {
  test('todayISO renvoie une date au format AAAA-MM-JJ', () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  });
  test('nowISO renvoie une date-heure ISO complète', () => {
    assert.match(nowISO(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  test('todayISO est le préfixe de nowISO', () => {
    assert.ok(nowISO().startsWith(todayISO()));
  });
});

describe('fmtDate', () => {
  test('convertit AAAA-MM-JJ en JJ/MM/AAAA', () => {
    assert.equal(fmtDate('2026-07-21'), '21/07/2026');
  });
  test('renvoie un tiret cadratin pour une valeur vide ou invalide', () => {
    assert.equal(fmtDate(''), '—');
    assert.equal(fmtDate(null), '—');
    assert.equal(fmtDate(undefined), '—');
    assert.equal(fmtDate('pas une date'), '—');
  });
  test('ignore un suffixe après la date sans produire de texte brut', () => {
    assert.equal(fmtDate('2026-07-15T11:6:00.000Z'), '15/07/2026');
  });
});

describe('fmtDateHeure', () => {
  test('renvoie un tiret cadratin pour une valeur vide', () => {
    assert.equal(fmtDateHeure(''), '—');
    assert.equal(fmtDateHeure(null), '—');
    assert.equal(fmtDateHeure(undefined), '—');
  });
  test('formate une date-heure ISO valide avec le séparateur " à "', () => {
    const res = fmtDateHeure('2026-07-21T14:30:00.000Z');
    assert.ok(res.includes(' à '));
  });
  test('tolère une heure/minute non paddée au lieu d\'afficher la chaîne brute', () => {
    const res = fmtDateHeure('2026-07-15T11:6:00.000Z');
    assert.ok(res.includes(' à '), `attendu un format "date à heure", reçu: "${res}"`);
    assert.ok(!res.includes('T11:6'), `ne doit jamais afficher la chaîne brute, reçu: "${res}"`);
  });
  test('retombe proprement sur la date seule si vraiment illisible', () => {
    assert.equal(fmtDateHeure('texte-invalide'), '—');
  });
});

describe('fmtDateHeureAvecFuseau', () => {
  test('renvoie un tiret cadratin pour une valeur vide', () => {
    assert.equal(fmtDateHeureAvecFuseau(''), '—');
    assert.equal(fmtDateHeureAvecFuseau(null), '—');
  });
  test('ajoute le fuseau horaire entre parenthèses après la date-heure', () => {
    const res = fmtDateHeureAvecFuseau('2026-07-21T14:30:00.000Z');
    assert.ok(res.includes(' à '), `attendu un format "date à heure (fuseau)", reçu: "${res}"`);
    assert.match(res, /\([^)]+\)$/, `attendu une parenthèse en fin de chaîne, reçu: "${res}"`);
  });
});

describe('datetimeLocalParDefaut', () => {
  test('renvoie le format attendu par un input datetime-local', () => {
    assert.match(datetimeLocalParDefaut(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
