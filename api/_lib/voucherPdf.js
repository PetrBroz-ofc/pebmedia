// api/_lib/voucherPdf.js
// Vytvoří PDF voucheru ze stejné šablony a se stejným rozložením polí jako
// aplikace pro správu voucherů (pebmedia-vocuhery, DEFAULT_TEMPLATE_CONFIG).
// Font IBM Plex Mono (licence OFL) je přibalený, aby v PDF fungovala čeština.

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ASSETS = path.join(__dirname, '..', '_assets');

// Pozice v pixelech šablony (2576 × 1222), y = účaří textu měřené shora.
const POLE = {
  id: { x: 1130, y: 730, size: 44, font: 'SemiBold', color: '#16181d' },
  amount: { x: 1130, y: 500, size: 118, font: 'Bold', color: '#1b4d4d' },
  date: { x: 1650, y: 730, size: 40, font: 'Medium', color: '#16181d' }
};

function barva(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const formatCastka = (kc) => `${Number(kc).toLocaleString('cs-CZ')} Kč`.replace(/\s/g, ' ');
function formatDatum(iso) {
  const [r, m, d] = String(iso).split('-');
  return `${d}. ${m}. ${r}`;
}

/**
 * @param {{ kod: string, hodnotaKc: number, platnostDo: string }} voucher
 * @returns {Promise<Buffer>} PDF
 */
async function vytvoritVoucherPdf({ kod, hodnotaKc, platnostDo }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Voucher PEBMedia ${kod}`);
  pdf.setAuthor('PEBMedia');

  const sablona = await pdf.embedPng(fs.readFileSync(path.join(ASSETS, 'voucher-template.png')));
  const { width, height } = sablona;
  const strana = pdf.addPage([width, height]);
  strana.drawImage(sablona, { x: 0, y: 0, width, height });

  const fonty = {};
  for (const vaha of ['Bold', 'SemiBold', 'Medium']) {
    fonty[vaha] = await pdf.embedFont(fs.readFileSync(path.join(ASSETS, `IBMPlexMono-${vaha}.ttf`)), { subset: true });
  }
  const napis = (text, pole) => strana.drawText(text, {
    x: pole.x, y: height - pole.y, size: pole.size, font: fonty[pole.font], color: barva(pole.color)
  });
  napis(kod, POLE.id);
  napis(formatCastka(hodnotaKc), POLE.amount);
  if (platnostDo) napis(formatDatum(platnostDo), POLE.date);

  return Buffer.from(await pdf.save());
}

module.exports = { vytvoritVoucherPdf };
