// js/tombola.js — formulář žádosti o voucher do tomboly (/tombola/).
(function () {
  'use strict';
  const form = document.getElementById('tombolaForm');
  if (!form) return;
  const chyba = document.getElementById('tombolaChyba');
  const hotovo = document.getElementById('tombolaHotovo');
  const tlacitko = document.getElementById('tombolaOdeslat');
  const MAX_LOGO = 2 * 1024 * 1024;

  // Datum akce nesmí být v minulosti.
  const datum = form.elements.datum;
  datum.min = new Date().toISOString().slice(0, 10);

  function ukazChybu(text, pole) {
    chyba.textContent = text;
    chyba.hidden = false;
    if (pole) pole.focus();
  }

  function nactiLogo(soubor) {
    return new Promise((resolve, reject) => {
      if (!soubor) { resolve(''); return; }
      if (!/^image\/(png|jpeg|webp)$/.test(soubor.type)) { reject(new Error('Logo musí být obrázek PNG, JPG nebo WebP.')); return; }
      if (soubor.size > MAX_LOGO) { reject(new Error('Logo je větší než 2 MB. Zmenšete ho prosím.')); return; }
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Logo se nepodařilo načíst.'));
      r.readAsDataURL(soubor);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    chyba.hidden = true;

    const povinna = [['akce', 'Vyplňte název akce.'], ['datum', 'Vyberte datum akce.'], ['misto', 'Vyplňte místo konání.'], ['jmeno', 'Vyplňte jméno.'], ['email', 'Vyplňte platný e-mail.']];
    for (const [nazev, zprava] of povinna) {
      const pole = form.elements[nazev];
      if (!pole.value.trim() || !pole.checkValidity()) { ukazChybu(zprava, pole); return; }
    }
    if (!form.elements.souhlas.checked) { ukazChybu('Pro odeslání potřebujeme souhlas se zpracováním údajů.', form.elements.souhlas); return; }

    let logo = '';
    try {
      logo = await nactiLogo(form.elements.logo.files[0]);
    } catch (err) {
      ukazChybu(err.message, form.elements.logo);
      return;
    }

    const data = {
      akce: form.elements.akce.value, typAkce: form.elements.typAkce.value, datum: form.elements.datum.value,
      misto: form.elements.misto.value, hoste: form.elements.hoste.value, odkaz: form.elements.odkaz.value,
      jmeno: form.elements.jmeno.value, organizace: form.elements.organizace.value, email: form.elements.email.value,
      telefon: form.elements.telefon.value, poznamka: form.elements.poznamka.value, web: form.elements.web.value,
      souhlas: form.elements.souhlas.checked, souhlasNabidky: form.elements.souhlasNabidky.checked, logo
    };

    tlacitko.disabled = true;
    tlacitko.textContent = 'Odesílám…';
    try {
      const res = await fetch('../api/tombola', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const json = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
      if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || 'Žádost se teď nepodařilo odeslat. Napište nám prosím na info.pebmedia@gmail.com.');
      form.hidden = true;
      hotovo.hidden = false;
      hotovo.focus();
      if (window.PEBZvuk) window.PEBZvuk.play('success');
    } catch (err) {
      ukazChybu(err.message);
      tlacitko.disabled = false;
      tlacitko.textContent = 'Odeslat žádost';
    }
  });
})();
