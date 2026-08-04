#!/usr/bin/env node
// Exporte l'intégralité de la base Firestore (toutes les boutiques, toutes leurs
// sous-collections, et les collections top-level membres/config/connexions/journalAdmin) dans un
// unique fichier JSON compressé. Parcourt les collections dynamiquement via :listCollectionIds
// plutôt qu'une liste codée en dur, pour rester complet même si une nouvelle sous-collection est
// ajoutée plus tard sans que ce script ne soit mis à jour.
//
// Utilisation locale : npm run backup (utilise le jeton de `firebase login`, comme reset-demo.cjs)
// En CI (.github/workflows/backup.yml) : le jeton vient du secret FIREBASE_REFRESH_TOKEN.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const PROJECT_ID = 'gestion-commerciale-gn';
const BASE_DOCS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getRefreshToken() {
  if (process.env.FIREBASE_REFRESH_TOKEN) return process.env.FIREBASE_REFRESH_TOKEN;
  const cheminConfig = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cheminConfig)) {
    throw new Error(`Aucun jeton trouvé (ni FIREBASE_REFRESH_TOKEN, ni ${cheminConfig}). Lance d'abord: firebase login`);
  }
  const config = JSON.parse(fs.readFileSync(cheminConfig, 'utf8'));
  const refreshToken = config.tokens && config.tokens.refresh_token;
  if (!refreshToken) throw new Error("Aucun refresh_token trouvé. Lance d'abord: firebase login");
  return refreshToken;
}

async function getAccessToken() {
  const refreshToken = await getRefreshToken();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Rafraîchissement du jeton échoué (${r.status}): ${await r.text()}`);
  return (await r.json()).access_token;
}

async function requeteFirestore(token, methode, url) {
  const r = await fetch(url, { method: methode, headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${methode} ${url} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

// Convertit les valeurs typées de l'API REST Firestore (stringValue, mapValue, arrayValue,
// timestampValue...) vers des valeurs JS/JSON simples — l'inverse de versValeurFirestore()
// dans reset-demo.cjs.
function depuisValeurFirestore(v) {
  if (v.nullValue !== undefined) return null;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.referenceValue !== undefined) return v.referenceValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(depuisValeurFirestore);
  if (v.mapValue !== undefined) return depuisChamps(v.mapValue.fields || {});
  return null;
}
function depuisChamps(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) obj[k] = depuisValeurFirestore(v);
  return obj;
}

async function listerCollections(token, cheminParent) {
  const url = `${BASE_DOCS_URL}${cheminParent}:listCollectionIds`;
  const rep = await requeteFirestore(token, 'POST', url);
  return rep.collectionIds || [];
}

async function listerDocuments(token, cheminCollection) {
  const docs = [];
  let pageToken;
  do {
    const qs = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
    const rep = await requeteFirestore(token, 'GET', `${BASE_DOCS_URL}${cheminCollection}?${qs}`);
    (rep.documents || []).forEach((d) => {
      const id = d.name.split('/').pop();
      docs.push({ id, data: depuisChamps(d.fields || {}) });
    });
    pageToken = rep.nextPageToken;
  } while (pageToken);
  return docs;
}

// Exporte récursivement une collection : chaque document, plus ses éventuelles
// sous-collections imbriquées sous la clé __sousCollections.
async function exporterCollection(token, cheminCollection) {
  const docs = await listerDocuments(token, cheminCollection);
  const resultat = {};
  for (const { id, data } of docs) {
    const cheminDoc = `${cheminCollection}/${id}`;
    const nomsSousCollections = await listerCollections(token, cheminDoc);
    let sousCollections;
    if (nomsSousCollections.length) {
      sousCollections = {};
      for (const nom of nomsSousCollections) {
        sousCollections[nom] = await exporterCollection(token, `${cheminDoc}/${nom}`);
      }
    }
    resultat[id] = sousCollections ? { ...data, __sousCollections: sousCollections } : data;
  }
  return resultat;
}

async function main() {
  console.log('Connexion...');
  const token = await getAccessToken();

  console.log('Découverte des collections racine...');
  const collectionsRacine = await listerCollections(token, '');
  console.log(`  ${collectionsRacine.join(', ')}`);

  const export_ = { exporteLe: new Date().toISOString(), projet: PROJECT_ID, collections: {} };
  for (const nom of collectionsRacine) {
    console.log(`Export de "${nom}"...`);
    export_.collections[nom] = await exporterCollection(token, `/${nom}`);
    console.log(`  ${Object.keys(export_.collections[nom]).length} document(s)`);
  }

  const dossierSortie = process.argv[2] || 'backup-tmp';
  fs.mkdirSync(dossierSortie, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const cheminFichier = path.join(dossierSortie, `firestore-${dateStr}.json.gz`);
  fs.writeFileSync(cheminFichier, zlib.gzipSync(JSON.stringify(export_)));

  const tailleMo = (fs.statSync(cheminFichier).size / 1024 / 1024).toFixed(2);
  console.log(`\nTerminé : ${cheminFichier} (${tailleMo} Mo)`);
}

main().catch((e) => {
  console.error('Échec de la sauvegarde :', e.message);
  process.exit(1);
});
