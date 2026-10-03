// api/_lib/shop.js
// Načtení katalogu produktů ze souboru data/shop.json a jeho ověření na serveru.
// DŮLEŽITÉ: cena a hodnota voucheru se vždy berou z tohoto souboru, nikdy z dat
// poslaných z prohlížeče — klient posílá jen productId.

const fs = require('fs');
const path = require('path');

let cache = null;

function loadShop() {
  if (cache) return cache;
  const file = path.join(process.cwd(), 'data', 'shop.json');
  const raw = fs.readFileSync(file, 'utf8');
  cache = JSON.parse(raw);
  return cache;
}

function findProduct(productId) {
  const shop = loadShop();
  // Skrytý produkt (bez dodaného obsahu) nejde koupit ani stáhnout.
  return (shop.products || []).find((p) => p.id === productId && !p.skryto) || null;
}

module.exports = { loadShop, findProduct };
