// scripts/indexnow.js
// Ohlásí všechny stránky ze sitemap.xml vyhledávačům přes IndexNow
// (Bing, Seznam, Yandex, Naver…; https://www.indexnow.org).
// Spouštět až po nasazení, kdy je ověřovací soubor <klíč>.txt dostupný na webu:
//   npm run indexnow
// Klíč není tajný – leží veřejně v kořeni webu a jen dokazuje, že web patří nám.

const fs = require('fs');
const path = require('path');

const KOREN = path.join(__dirname, '..');
const HOST = 'pebmedia.cz';
const klicSoubor = fs.readdirSync(KOREN).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!klicSoubor) throw new Error('Chybí soubor s IndexNow klíčem (32 hex znaků .txt) v kořeni webu.');
const key = fs.readFileSync(path.join(KOREN, klicSoubor), 'utf8').trim();

const sitemap = fs.readFileSync(path.join(KOREN, 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

(async () => {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${klicSoubor}`, urlList })
  });
  console.log(`IndexNow: ${res.status} ${res.statusText} (${urlList.length} adres)`);
  if (!res.ok && res.status !== 202) process.exitCode = 1;
})();
