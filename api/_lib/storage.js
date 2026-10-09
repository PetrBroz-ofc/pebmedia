// api/_lib/storage.js
// Ukládání a čtení souborů v PRIVÁTNÍM úložišti Vercel Blob.
//
// BEZPEČNOST: všechno (produkty, objednávky, odběratelé, počítadla) se ukládá
// s access: 'private' — soubory nemají žádnou veřejnou URL a číst je jde jen
// se serverovým tokenem BLOB_READ_WRITE_TOKEN. Zákazník se k souboru dostane
// výhradně přes api/download.js po ověření podepsaného tokenu.
//
// Potřebuje proměnnou prostředí BLOB_READ_WRITE_TOKEN — tu Vercel vyplní
// automaticky, jakmile v projektu připojíte Blob Store (Storage → Create → Blob,
// při zakládání zvolte PRIVATE přístup).

const { put, get, head, BlobPreconditionFailedError } = require('@vercel/blob');

const ACCESS = 'private';
const PREFIX = 'produkty/';
const BEZPECNY_NAZEV = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

function isSafeFilename(filename) {
  return typeof filename === 'string' && BEZPECNY_NAZEV.test(filename) && !filename.includes('..');
}

/**
 * Nahraje produkt (Buffer) do privátního úložiště jako produkty/<filename>.
 * Používá ho scripts/nahraj-produkty.js.
 */
async function uploadFile(filename, buffer, contentType) {
  if (!isSafeFilename(filename)) throw new Error(`Neplatný název souboru: ${filename}`);
  return put(PREFIX + filename, buffer, {
    access: ACCESS,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

/**
 * Otevře produkt pro streamování zákazníkovi.
 * @returns {Promise<{stream: ReadableStream, blob: object}|null>}
 */
async function openFile(filename) {
  if (!isSafeFilename(filename)) return null;
  // Primárně produkty/<soubor> (nahrávací skript), jinak <soubor> v kořeni úložiště
  // (tak ho uloží ruční nahrání přes Vercel → Storage → Blob → Upload).
  for (const pathname of [PREFIX + filename, filename]) {
    const result = await get(pathname, { access: ACCESS, useCache: false });
    if (result && result.statusCode === 200) return result;
  }
  return null;
}

/** Celý soubor jako Buffer (pro přílohu e-mailu). Vrací null, když neexistuje. */
async function readFileBuffer(filename) {
  const file = await openFile(filename);
  if (!file) return null;
  return Buffer.from(await new Response(file.stream).arrayBuffer());
}

/**
 * Přečte JSON záznam. Vrací { data, etag } nebo null, když neexistuje.
 */
async function readJson(pathname) {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return { data: JSON.parse(text), etag: result.blob.etag };
}

/**
 * Zapíše JSON záznam.
 *  - onlyIfNew: true  → zapíše jen pokud záznam ještě neexistuje (vrací false, když existuje)
 *  - ifMatch: etag    → zapíše jen pokud se záznam mezitím nezměnil (vrací false při kolizi)
 * @returns {Promise<boolean>} true = zapsáno
 */
async function writeJson(pathname, data, { onlyIfNew = false, ifMatch } = {}) {
  try {
    await put(pathname, JSON.stringify(data, null, 2), {
      access: ACCESS,
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: !onlyIfNew,
      ifMatch
    });
    return true;
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) return false;
    if (onlyIfNew && (await exists(pathname))) return false;
    throw err;
  }
}

async function exists(pathname) {
  try {
    await head(pathname);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Atomicky upraví JSON záznam (read → změna → zápis s kontrolou etagu, při
 * souběhu se zopakuje). `update` dostane aktuální data (nebo null) a vrátí
 * nová data, nebo undefined pro "nic neměnit".
 * @returns {Promise<object|null>} výsledná data
 */
async function updateJson(pathname, update, pokusy = 5) {
  for (let i = 0; i < pokusy; i++) {
    const current = await readJson(pathname);
    const next = update(current ? current.data : null);
    if (next === undefined) return current ? current.data : null;
    const ok = current
      ? await writeJson(pathname, next, { ifMatch: current.etag })
      : await writeJson(pathname, next, { onlyIfNew: true });
    if (ok) return next;
  }
  throw new Error(`Záznam ${pathname} se nepodařilo atomicky upravit (souběh).`);
}

/** Uloží libovolný soubor (Buffer) do privátního úložiště pod danou cestou. */
async function ulozitSoubor(pathname, buffer, contentType) {
  return put(pathname, buffer, { access: ACCESS, contentType, addRandomSuffix: false, allowOverwrite: false });
}

/** Přečte libovolný soubor z privátního úložiště jako Buffer (null, když neexistuje). */
async function nacistSoubor(pathname) {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

module.exports = { uploadFile, openFile, readFileBuffer, readJson, writeJson, updateJson, ulozitSoubor, nacistSoubor, isSafeFilename, PREFIX };
