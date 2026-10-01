// api/_lib/storage.js
// Ukládání a čtení souborů v privátním úložišti Vercel Blob.
//
// POZNÁMKA K BEZPEČNOSTI: Vercel Blob nemá v základu "opravdu privátní" soubory
// s autentizací — nahrané soubory dostanou veřejnou, ale neuhodnutelnou URL
// (obsahuje náhodný řetězec). Skutečné hlídání přístupu probíhá v api/download.js,
// který klientovi NIKDY nedá přímou Blob URL, jen po ověření podepsaného tokenu
// soubor sám stáhne a přepošle (proxy). To je nejjednodušší bezpečné řešení bez
// potřeby dalšího účtu (Supabase apod.) — pokud by bylo potřeba silnější zabezpečení,
// lze později přejít na Supabase Storage se signed URL.
//
// Potřebuje proměnnou prostředí BLOB_READ_WRITE_TOKEN — tu Vercel vyplní
// automaticky, jakmile v projektu připojíte Blob Store (Storage → Create → Blob).

const { put, head } = require('@vercel/blob');

const PREFIX = 'produkty/';

/**
 * Nahraje soubor (Buffer) do úložiště pod daným názvem. Používá se mimo tento
 * web (ručně přes malý nahrávací skript nebo Vercel dashboard) — zde je jen
 * pro úplnost a případné budoucí použití.
 */
async function uploadFile(filename, buffer, contentType) {
  // addRandomSuffix: false => stabilní, předvídatelná cesta (produkty/<filename>),
  // aby ji šlo zpětně najít podle názvu souboru z data/shop.json. Skutečná ochrana
  // před stažením bez zaplacení je v api/download.js (ověření podepsaného tokenu),
  // ne v "tajnosti" této cesty — proto doporučujeme volit názvy souborů, které
  // nejsou nikde jinde veřejně publikované.
  const result = await put(PREFIX + filename, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false
  });
  return result; // { url, pathname, ... }
}

/**
 * Najde uložený soubor podle názvu (prohledá existující blob podle pathname
 * prefixu — v praxi: název souboru si Petr po nahrání uloží/najde ve Vercel
 * Blob dashboardu a případně upraví v data/shop.json na přesný pathname).
 */
async function getFileInfo(filename) {
  try {
    return await head(PREFIX + filename);
  } catch (e) {
    return null;
  }
}

module.exports = { uploadFile, getFileInfo, PREFIX };
