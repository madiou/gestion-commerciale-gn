import '../tests/setup.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { statutStock, tagStatut, creditClient, detteFournisseur, avanceFournisseur, soldeFournisseur, resumeArticles, dateFinEssaiGratuit, essaiGratuitExpire, compterUtilisateursParRole, rolesDisponibles, calculerDureeSecondes, formatDureeSecondes, joursRestants, parseCSV, validerLignesProduits, validerLignesClients } from '../public/js/business-logic.js';
import { state } from '../public/js/state.js';

function resetState(){
  state.ventes = [];
  state.achats = [];
  state.paiements = [];
  state.paiementsFournisseurs = [];
  state.retours = [];
}

describe('statutStock', () => {
  test('utilise le seuil du produit quand il est défini', () => {
    assert.equal(statutStock({ stock: 3, seuil: 10 }), 'bas');   // <= 5 (moitié du seuil)
    assert.equal(statutStock({ stock: 8, seuil: 10 }), 'moy');   // <= 10
    assert.equal(statutStock({ stock: 15, seuil: 10 }), 'ok');   // > 10
  });
  test('retombe sur un seuil par défaut de 15 si absent', () => {
    assert.equal(statutStock({ stock: 5 }), 'bas');
    assert.equal(statutStock({ stock: 10 }), 'moy');
    assert.equal(statutStock({ stock: 20 }), 'ok');
  });
});

describe('tagStatut', () => {
  test('renvoie le badge correspondant au statut', () => {
    assert.match(tagStatut('bas'), /class="tag bas"/);
    assert.match(tagStatut('moy'), /class="tag moy"/);
    assert.match(tagStatut('ok'), /class="tag ok"/);
  });
});

describe('creditClient', () => {
  beforeEach(resetState);
  const client = { id: 'c1', nom: 'Alice' };

  test('renvoie 0 sans vente à crédit', () => {
    assert.equal(creditClient(client), 0);
  });
  test('compte le montant à crédit d\'une vente', () => {
    state.ventes = [{ paiement: 'Crédit client', clientId: 'c1', total: 1000, montantCredit: 1000 }];
    assert.equal(creditClient(client), 1000);
  });
  test('gère une vente partiellement à crédit (espèces + crédit)', () => {
    state.ventes = [{ paiement: 'Crédit client', clientId: 'c1', total: 1000, montantCredit: 400 }];
    assert.equal(creditClient(client), 400);
  });
  test('déduit les paiements déjà encaissés', () => {
    state.ventes = [{ paiement: 'Crédit client', clientId: 'c1', total: 1000, montantCredit: 1000 }];
    state.paiements = [{ clientId: 'c1', montant: 400 }];
    assert.equal(creditClient(client), 600);
  });
  test('déduit la part annulée par un retour', () => {
    state.ventes = [{ paiement: 'Crédit client', clientId: 'c1', total: 1000, montantCredit: 1000 }];
    state.retours = [{ clientId: 'c1', montantAnnuleCredit: 300 }];
    assert.equal(creditClient(client), 700);
  });
  test('ne descend jamais sous 0', () => {
    state.ventes = [{ paiement: 'Crédit client', clientId: 'c1', total: 500, montantCredit: 500 }];
    state.paiements = [{ clientId: 'c1', montant: 800 }];
    assert.equal(creditClient(client), 0);
  });
  test('reconnaît un client par son nom si pas d\'identifiant', () => {
    state.ventes = [{ paiement: 'Crédit client', client: 'Alice', total: 200, montantCredit: 200 }];
    assert.equal(creditClient(client), 200);
  });
});

describe('detteFournisseur', () => {
  beforeEach(resetState);
  const fournisseur = { id: 'f1', nom: 'Grossiste Kaloum' };

  test('renvoie 0 sans achat en dette', () => {
    assert.equal(detteFournisseur(fournisseur), 0);
  });
  test('compte le solde impayé d\'un achat', () => {
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 1000, montantPaye: 400 }];
    assert.equal(detteFournisseur(fournisseur), 600);
  });
  test('déduit les paiements déjà versés', () => {
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 1000, montantPaye: 400 }];
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 600 }];
    assert.equal(detteFournisseur(fournisseur), 0);
  });
  test('ne descend jamais sous 0', () => {
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 500, montantPaye: 500 }];
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 200 }];
    assert.equal(detteFournisseur(fournisseur), 0);
  });
});

describe('soldeFournisseur / avanceFournisseur (accompte versé avant réception de marchandise)', () => {
  beforeEach(resetState);
  const fournisseur = { id: 'f1', nom: 'Grossiste Kaloum' };

  test('un paiement sans aucun achat en dette devient une avance', () => {
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 100000 }];
    assert.equal(soldeFournisseur(fournisseur), -100000);
    assert.equal(detteFournisseur(fournisseur), 0);
    assert.equal(avanceFournisseur(fournisseur), 100000);
  });
  test('un paiement supérieur à la dette laisse le surplus en avance (ne le fait pas disparaître)', () => {
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 1000, montantPaye: 0 }];
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 1500 }];
    assert.equal(soldeFournisseur(fournisseur), -500);
    assert.equal(detteFournisseur(fournisseur), 0);
    assert.equal(avanceFournisseur(fournisseur), 500);
  });
  test('un nouvel achat en dette réduit automatiquement une avance existante', () => {
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 100000 }];
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 60000, montantPaye: 0 }];
    assert.equal(soldeFournisseur(fournisseur), -40000);
    assert.equal(avanceFournisseur(fournisseur), 40000);
    assert.equal(detteFournisseur(fournisseur), 0);
  });
  test('un achat qui dépasse l\'avance disponible ne laisse qu\'une dette nette', () => {
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 40000 }];
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 100000, montantPaye: 0 }];
    assert.equal(soldeFournisseur(fournisseur), 60000);
    assert.equal(detteFournisseur(fournisseur), 60000);
    assert.equal(avanceFournisseur(fournisseur), 0);
  });
  test('solde nul quand tout est exactement équilibré', () => {
    state.achats = [{ paiement: 'Dette fournisseur', fournisseurId: 'f1', total: 1000, montantPaye: 0 }];
    state.paiementsFournisseurs = [{ fournisseurId: 'f1', montant: 1000 }];
    assert.equal(soldeFournisseur(fournisseur), 0);
    assert.equal(detteFournisseur(fournisseur), 0);
    assert.equal(avanceFournisseur(fournisseur), 0);
  });
});

describe('dateFinEssaiGratuit', () => {
  test('ajoute 6 mois à la date de création', () => {
    assert.equal(dateFinEssaiGratuit('2026-01-15'), '2026-07-15');
  });
  test('renvoie null sans date de création', () => {
    assert.equal(dateFinEssaiGratuit(null), null);
    assert.equal(dateFinEssaiGratuit(undefined), null);
  });
  test('renvoie null pour une date illisible', () => {
    assert.equal(dateFinEssaiGratuit('pas-une-date'), null);
  });
});

describe('essaiGratuitExpire', () => {
  test('non expiré avant la fin des 6 mois', () => {
    assert.equal(essaiGratuitExpire('2026-01-15', new Date('2026-06-01')), false);
  });
  test('expiré après la fin des 6 mois', () => {
    assert.equal(essaiGratuitExpire('2026-01-15', new Date('2026-08-01')), true);
  });
  test('jamais expiré sans date de création (boutiques antérieures à cette règle)', () => {
    assert.equal(essaiGratuitExpire(null, new Date('2030-01-01')), false);
  });
});

describe('compterUtilisateursParRole', () => {
  test('compte chaque rôle', () => {
    const utilisateurs = [{ role: 'Propriétaire' }, { role: 'Vendeur' }, { role: 'Vendeur' }, { role: 'Gérant' }];
    assert.deepEqual(compterUtilisateursParRole(utilisateurs), { 'Propriétaire': 1, 'Vendeur': 2, 'Gérant': 1 });
  });
  test('tableau vide ou absent', () => {
    assert.deepEqual(compterUtilisateursParRole([]), {});
    assert.deepEqual(compterUtilisateursParRole(undefined), {});
  });
});

describe('rolesDisponibles', () => {
  test('gratuit : seul Vendeur est autorisé, un seul compte en plus du propriétaire', () => {
    const proprio = [{ id: 'p1', role: 'Propriétaire' }];
    assert.deepEqual(rolesDisponibles('gratuit', proprio, null), ['Vendeur']);
  });
  test('gratuit : plus aucun rôle dispo une fois le compte supplémentaire déjà créé', () => {
    const utilisateurs = [{ id: 'p1', role: 'Propriétaire' }, { id: 'v1', role: 'Vendeur' }];
    assert.deepEqual(rolesDisponibles('gratuit', utilisateurs, null), []);
  });
  test('standard : Gérant et Vendeur dispo tant que le total < 3', () => {
    const utilisateurs = [{ id: 'p1', role: 'Propriétaire' }];
    assert.deepEqual(rolesDisponibles('standard', utilisateurs, null), ['Gérant', 'Vendeur']);
  });
  test('standard : plus rien une fois 3 comptes atteints', () => {
    const utilisateurs = [{ id: 'p1', role: 'Propriétaire' }, { id: 'g1', role: 'Gérant' }, { id: 'v1', role: 'Vendeur' }];
    assert.deepEqual(rolesDisponibles('standard', utilisateurs, null), []);
  });
  test('pro : plafond strict par rôle (1 Gérant, 2 Vendeurs)', () => {
    const proprio = [{ id: 'p1', role: 'Propriétaire' }];
    assert.deepEqual(rolesDisponibles('pro', proprio, null).sort(), ['Gérant', 'Vendeur']);
    const unGerant = [...proprio, { id: 'g1', role: 'Gérant' }];
    assert.deepEqual(rolesDisponibles('pro', unGerant, null), ['Vendeur']);
    const deuxVendeurs = [...proprio, { id: 'v1', role: 'Vendeur' }, { id: 'v2', role: 'Vendeur' }];
    assert.deepEqual(rolesDisponibles('pro', deuxVendeurs, null), ['Gérant']);
    const complet = [...proprio, { id: 'g1', role: 'Gérant' }, { id: 'v1', role: 'Vendeur' }, { id: 'v2', role: 'Vendeur' }];
    assert.deepEqual(rolesDisponibles('pro', complet, null), []);
  });
  test('pro : idExclu permet à un utilisateur de conserver son propre rôle au plafond', () => {
    const utilisateurs = [{ id: 'p1', role: 'Propriétaire' }, { id: 'g1', role: 'Gérant' }];
    assert.deepEqual(rolesDisponibles('pro', utilisateurs, 'g1').sort(), ['Gérant', 'Vendeur']);
  });
  test('entreprise : aucune limite', () => {
    const utilisateurs = [{ id: 'p1', role: 'Propriétaire' }, { id: 'g1', role: 'Gérant' }, { id: 'g2', role: 'Gérant' }, { id: 'v1', role: 'Vendeur' }];
    assert.deepEqual(rolesDisponibles('entreprise', utilisateurs, null), ['Gérant', 'Vendeur']);
  });
});

describe('calculerDureeSecondes', () => {
  test('calcule la durée en secondes entre deux dates ISO', () => {
    assert.equal(calculerDureeSecondes('2026-01-01T10:00:00.000Z', '2026-01-01T10:05:00.000Z'), 300);
  });
  test('ne descend jamais sous 0 (horloge en retard ou ping antérieur à la connexion)', () => {
    assert.equal(calculerDureeSecondes('2026-01-01T10:05:00.000Z', '2026-01-01T10:00:00.000Z'), 0);
  });
  test('renvoie null si une des deux dates manque', () => {
    assert.equal(calculerDureeSecondes(null, '2026-01-01T10:00:00.000Z'), null);
    assert.equal(calculerDureeSecondes('2026-01-01T10:00:00.000Z', null), null);
  });
});

describe('formatDureeSecondes', () => {
  test("moins d'une minute", () => {
    assert.equal(formatDureeSecondes(30), "Moins d'une minute");
  });
  test('minutes seules sous une heure', () => {
    assert.equal(formatDureeSecondes(125), '2 min');
  });
  test('heures et minutes au-delà d\'une heure', () => {
    assert.equal(formatDureeSecondes(3900), '1 h 5 min');
  });
  test('valeur absente ou invalide', () => {
    assert.equal(formatDureeSecondes(null), '—');
    assert.equal(formatDureeSecondes(undefined), '—');
    assert.equal(formatDureeSecondes(NaN), '—');
  });
});

describe('joursRestants', () => {
  test('positif pour une date future', () => {
    assert.equal(joursRestants('2026-01-10', new Date('2026-01-05T08:00:00Z')), 5);
  });
  test('négatif pour une date déjà passée', () => {
    assert.equal(joursRestants('2026-01-01', new Date('2026-01-05T08:00:00Z')), -4);
  });
  test('null sans date', () => {
    assert.equal(joursRestants(null), null);
    assert.equal(joursRestants(undefined), null);
  });
});

describe('parseCSV', () => {
  test('analyse un CSV simple avec en-tête', () => {
    const { entetes, lignes } = parseCSV('nom,telephone\nAlice,622000000\nBob,623000000');
    assert.deepEqual(entetes, ['nom', 'telephone']);
    assert.deepEqual(lignes, [{ nom:'Alice', telephone:'622000000' }, { nom:'Bob', telephone:'623000000' }]);
  });
  test('gère les champs entre guillemets contenant des virgules', () => {
    const { lignes } = parseCSV('nom,adresse\n"Dupont, Marie","Kaloum, Conakry"');
    assert.deepEqual(lignes, [{ nom:'Dupont, Marie', adresse:'Kaloum, Conakry' }]);
  });
  test('gère les guillemets échappés ("") à l\'intérieur d\'un champ', () => {
    const { lignes } = parseCSV('notes\n"Le client a dit ""bonjour"""');
    assert.equal(lignes[0].notes, 'Le client a dit "bonjour"');
  });
  test('ignore les lignes vides', () => {
    const { lignes } = parseCSV('nom\nAlice\n\nBob\n');
    assert.equal(lignes.length, 2);
  });
  test('chaîne vide ou absente ne plante pas', () => {
    assert.deepEqual(parseCSV(''), { entetes:[], lignes:[] });
    assert.deepEqual(parseCSV(null), { entetes:[], lignes:[] });
  });
  test('détecte automatiquement le point-virgule (Excel en paramètres régionaux francophones)', () => {
    const { entetes, lignes } = parseCSV('nom;telephone\nAlice;622000000\nBob;623000000');
    assert.deepEqual(entetes, ['nom', 'telephone']);
    assert.deepEqual(lignes, [{ nom:'Alice', telephone:'622000000' }, { nom:'Bob', telephone:'623000000' }]);
  });
  test('retire le BOM UTF-8 en tête de fichier', () => {
    const { lignes } = parseCSV('﻿nom\nAlice');
    assert.deepEqual(lignes, [{ nom:'Alice' }]);
  });
});

describe('validerLignesProduits', () => {
  test('accepte une ligne valide de produit fini', () => {
    const { valides, erreurs } = validerLignesProduits([{ nom:'T-shirt', type:'produit_fini', stock:'20', prix_achat:'50000', prix_vente:'80000', seuil:'5' }]);
    assert.equal(erreurs.length, 0);
    assert.deepEqual(valides[0], { numero:'', nom:'T-shirt', categorie:'', type:'fini', stock:20, prix_achat:50000, prix_vente:80000, seuil:5 });
  });
  test('rejette une ligne sans nom', () => {
    const { valides, erreurs } = validerLignesProduits([{ nom:'', prix_vente:'1000' }]);
    assert.equal(valides.length, 0);
    assert.equal(erreurs.length, 1);
    assert.match(erreurs[0].raison, /nom manquant/);
  });
  test('rejette un produit fini sans prix de vente valide', () => {
    const { valides, erreurs } = validerLignesProduits([{ nom:'Sans prix' }]);
    assert.equal(valides.length, 0);
    assert.match(erreurs[0].raison, /prix_vente invalide/);
  });
  test('une matière première n\'a pas besoin de prix de vente', () => {
    const { valides, erreurs } = validerLignesProduits([{ nom:'Farine', type:'matiere_premiere', stock:'100' }]);
    assert.equal(erreurs.length, 0);
    assert.equal(valides[0].type, 'matiere_premiere');
    assert.equal(valides[0].prix_vente, 0);
  });
  test('valeurs numériques manquantes retombent sur des valeurs par défaut', () => {
    const { valides } = validerLignesProduits([{ nom:'Produit minimal', prix_vente:'1000' }]);
    assert.equal(valides[0].stock, 0);
    assert.equal(valides[0].prix_achat, 0);
    assert.equal(valides[0].seuil, 15);
  });
});

describe('validerLignesClients', () => {
  test('accepte une ligne valide', () => {
    const { valides, erreurs } = validerLignesClients([{ nom:'Alice', telephone:'622000000', adresse:'Kaloum', notes:'VIP', date_inscription:'2026-01-15' }]);
    assert.equal(erreurs.length, 0);
    assert.deepEqual(valides[0], { nom:'Alice', telephone:'622000000', adresse:'Kaloum', notes:'VIP', date_inscription:'2026-01-15' });
  });
  test('rejette une ligne sans nom', () => {
    const { valides, erreurs } = validerLignesClients([{ nom:'  ' }]);
    assert.equal(valides.length, 0);
    assert.equal(erreurs.length, 1);
  });
  test('date_inscription absente devient null (l\'appelant applique la date du jour)', () => {
    const { valides } = validerLignesClients([{ nom:'Bob' }]);
    assert.equal(valides[0].date_inscription, null);
  });
});

describe('resumeArticles', () => {
  test('renvoie une chaîne vide sans lignes', () => {
    assert.equal(resumeArticles([]), '');
    assert.equal(resumeArticles(undefined), '');
  });
  test('liste les noms séparés par une virgule (1 ou 2 articles)', () => {
    assert.equal(resumeArticles([{ nom: 'Riz' }]), 'Riz');
    assert.equal(resumeArticles([{ nom: 'Riz' }, { nom: 'Sucre' }]), 'Riz, Sucre');
  });
  test('résume au-delà de 2 articles avec un compteur', () => {
    const lignes = [{ nom: 'Riz' }, { nom: 'Sucre' }, { nom: 'Huile' }];
    assert.equal(resumeArticles(lignes), 'Riz, Sucre +1 article(s)');
  });
});
