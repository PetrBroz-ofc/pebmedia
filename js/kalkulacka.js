// js/kalkulacka.js
// Kalkulačka „Spočítejte si svůj návrh“ (průvodce: co potřebujete → upřesnění →
// doplňky → cena). Používá ji hlavní stránka (karta pod ceníkem, otevírá se
// otočením tlačítka) i přehled obchodu (karta je vidět rovnou).
// Ceny bere z data/content.json: ceník (services), rychlá pomoc (quickHelp),
// balíčky (packages) a kroky průvodce (calculator). Služby s pevnou cenou jdou
// zaplatit přes Stripe (api/checkout), ostatní vedou na nezávaznou poptávku.

(function () {
  'use strict';

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  const koren = () => document.body.getAttribute('data-root') || './';

  // Kalkulačka „Spočítejte si svůj návrh“ jako průvodce: co potřebujete → upřesnění → doplňky → cena.
  // Ceny bere z ceníku (data.services), balíčky z data.packages a kroky z data.calculator.
  function initKalkulacka(data) {
    const root = document.getElementById('kalk');
    const cfg = data.calculator;
    if (!root || !cfg || !cfg.start) return;
    const krokEl = document.getElementById('kalkKrok');
    const progres = document.querySelector('.kalk-progres i');

    const castka = (text) => { const m = String(text).replace(/\s/g, '').match(/\d+/); return m ? Number(m[0]) : 0; };
    const kc = (n) => n.toLocaleString('cs-CZ') + ' Kč';
    const polozky = {};
    data.services.categories.forEach(cat => cat.items.forEach(i => {
      polozky[i.id] = { id: i.id, name: i.name, price: castka(i.price), mesicne: /měsíc/i.test(i.price), kat: cat.id };
    }));
    ((data.quickHelp && data.quickHelp.items) || []).forEach(q => {
      polozky[q.id] = { id: q.id, name: q.name, price: castka(q.price), pevna: true, lhuta: q.time, produkt: 'sluzba-' + q.id.replace(/^qh-/, ''), kat: 'rychla' };
    });
    (cfg.extras || []).forEach(x => { polozky[x.id] = { id: x.id, name: x.name, price: castka(x.price), extra: true, matches: x.matches, kat: 'extra' }; });
    const balicky = Object.fromEntries(data.packages.items.filter(p => p.visible !== false).map(p => [p.id, p]));
    const cenaPolozky = (p) => p.pevna ? kc(p.price) : p.mesicne ? `od ${kc(p.price)}/měs.` : `od ${kc(p.price)}`;
    // Na hlavní stránce je poptávkový formulář přímo pod kalkulačkou, jinde (obchod) se na něj přejde.
    const naHlavni = Boolean(document.getElementById('contactForm'));
    const kontaktHref = naHlavni ? '#kontakt' : koren() + 'index.html#kontakt';

    const IKONY = {
      web: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      eshop: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
      brand: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z"/></svg>',
      jine: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
      rychla: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>'
    };
    const FAJFKA = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    let cesta = null;   // klíč z cfg.paths
    let hlavni = [];    // výběr z kroku „upřesnění“
    let doplnky = [];   // výběr z kroku „co k tomu“
    let krok = 0;

    const kroky = () => {
      const p = cesta && cfg.paths[cesta];
      return ['start', 'hlavni'].concat(!p || p.addons ? ['doplnky'] : [], ['vysledek']); // dokud není cesta, počítáme s doplňky
    };
    const vyber = () => hlavni.concat(doplnky).map(id => polozky[id]).filter(Boolean);

    // Nejlevnější balíček, který obsahuje všechno vybrané (měsíční služby se počítají zvlášť).
    function najdiBalicek(v) {
      const ceneno = v.filter(p => !p.extra && !p.mesicne);
      const extra = v.filter(p => p.extra);
      if (!ceneno.some(p => p.kat === 'cat-web')) return null;
      let nejlepsi = null;
      (cfg.packageRules || []).forEach(r => {
        const b = balicky[r.packageId];
        if (!b || !ceneno.every(p => r.covers[p.id])) return;
        if (!extra.every(x => x.matches.some(m => b.features.includes(m)))) return;
        const cena = castka(b.price);
        if (!nejlepsi || cena < nejlepsi.cena) nejlepsi = { b, r, cena };
      });
      return nejlepsi;
    }

    function dalsi() { if (krok < kroky().length - 1) { krok++; vykresli(1); } }
    function zpet() { if (krok > 0) { krok--; vykresli(-1); } }

    function tlacitkoVolby(p, aktivni, onClick) {
      const b = el('button', 'kalk-moznost' + (aktivni ? ' is-active' : ''),
        `<span class="kalk-moznost-check" aria-hidden="true">${FAJFKA}</span><span class="kalk-moznost-nazev">${p.name}</span><span class="kalk-moznost-cena">${cenaPolozky(p)}</span>`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(aktivni));
      b.addEventListener('click', () => onClick(b));
      return b;
    }

    function paticka(primarni) {
      const p = el('div', 'kalk-paticka');
      const z = el('button', 'kalk-zpet', '<span aria-hidden="true">←</span> Zpět');
      z.type = 'button';
      z.addEventListener('click', zpet);
      p.appendChild(z);
      if (primarni) p.appendChild(primarni);
      return p;
    }

    function vykresli(smer = 0) {
      const seznam = kroky();
      const typ = seznam[krok];
      const celkem = seznam.length - 1;
      krokEl.textContent = typ === 'vysledek' ? 'Hotovo' : `Krok ${krok + 1} ${celkem === 3 || celkem === 4 ? 'ze' : 'z'} ${celkem}`;
      if (progres) progres.style.width = Math.round(((krok + 1) / seznam.length) * 100) + '%';

      const panel = el('div', 'kalk-panel' + (smer > 0 ? ' is-vpred' : smer < 0 ? ' is-zpet' : ''));
      const otazka = (text) => { const h = el('h3', 'kalk-otazka', text); h.tabIndex = -1; panel.appendChild(h); return h; };

      if (typ === 'start') {
        otazka(cfg.start.question);
        const mrizka = el('div', 'kalk-dlazdice');
        cfg.start.options.forEach(o => {
          const b = el('button', 'kalk-dlazdice-btn' + (cesta === o.path ? ' is-active' : ''),
            `<span class="kalk-ikona" aria-hidden="true">${IKONY[o.icon] || ''}</span><span class="kalk-dlazdice-nazev">${o.label}</span><span class="kalk-dlazdice-popis">${o.desc}</span>`);
          b.type = 'button';
          b.addEventListener('click', () => {
            if (cesta !== o.path) { cesta = o.path; hlavni = []; doplnky = []; }
            dalsi();
          });
          mrizka.appendChild(b);
        });
        panel.appendChild(mrizka);
      }

      if (typ === 'hlavni') {
        const p = cfg.paths[cesta];
        otazka(p.question);
        const wrap = el('div', 'kalk-moznosti');
        const pokracovat = el('button', 'btn btn-accent kalk-dal', 'Pokračovat');
        pokracovat.type = 'button';
        pokracovat.disabled = !hlavni.length;
        pokracovat.addEventListener('click', dalsi);
        p.items.forEach(id => {
          const pol = polozky[id];
          if (!pol) return;
          wrap.appendChild(tlacitkoVolby(pol, hlavni.includes(id), (b) => {
            if (p.type === 'single') {
              hlavni = [id];
              wrap.querySelectorAll('.kalk-moznost').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
              setTimeout(dalsi, 260);
            } else {
              hlavni = hlavni.includes(id) ? hlavni.filter(x => x !== id) : hlavni.concat(id);
              b.classList.toggle('is-active', hlavni.includes(id));
              b.setAttribute('aria-pressed', String(hlavni.includes(id)));
              pokracovat.disabled = !hlavni.length;
            }
            if (window.PEBZvuk) window.PEBZvuk.play('tap');
          }));
        });
        panel.appendChild(wrap);
        panel.appendChild(paticka(p.type === 'single' ? null : pokracovat));
      }

      if (typ === 'doplnky') {
        const p = cfg.paths[cesta];
        otazka(p.addons.question);
        panel.appendChild(el('p', 'kalk-napoveda', 'Vyberte, co se vám hodí. Klidně nic.'));
        const wrap = el('div', 'kalk-moznosti');
        const spocitat = el('button', 'btn btn-accent kalk-dal');
        spocitat.type = 'button';
        const popisek = () => { spocitat.innerHTML = doplnky.length ? 'Spočítat cenu' : 'Nic dalšího, spočítat'; };
        popisek();
        spocitat.addEventListener('click', dalsi);
        p.addons.items.forEach(id => {
          const pol = polozky[id];
          if (!pol) return;
          wrap.appendChild(tlacitkoVolby(pol, doplnky.includes(id), () => {
            if (doplnky.includes(id)) {
              doplnky = doplnky.filter(x => x !== id);
            } else {
              // Web a logo jdou vybrat jen jednou (jeden typ webu, jedno logo).
              if (pol.kat === 'cat-web' || pol.kat === 'cat-branding') doplnky = doplnky.filter(x => polozky[x].kat !== pol.kat);
              doplnky = doplnky.concat(id);
            }
            wrap.querySelectorAll('.kalk-moznost').forEach((x, i) => {
              const on = doplnky.includes(p.addons.items[i]);
              x.classList.toggle('is-active', on);
              x.setAttribute('aria-pressed', String(on));
            });
            popisek();
            if (window.PEBZvuk) window.PEBZvuk.play('tap');
          }));
        });
        panel.appendChild(wrap);
        panel.appendChild(paticka(spocitat));
      }

      if (typ === 'vysledek') {
        const v = vyber();
        const jednorazove = v.filter(p => !p.mesicne).reduce((s, p) => s + p.price, 0);
        const mesicne = v.filter(p => p.mesicne).reduce((s, p) => s + p.price, 0);
        const extra = v.filter(p => p.extra);
        const bal = najdiBalicek(v);
        const kZaplaceni = v.length === 1 && v[0].pevna ? v[0] : null;
        otazka('Váš návrh');

        const vysledek = el('div', 'kalk-vysledek');
        const cena = el('div', 'kalk-cena-box', `
          <span class="kalk-cena-popis">${kZaplaceni ? 'Pevná cena' : 'Orientační cena'}</span>
          <strong class="kalk-celkem-cena">${kZaplaceni ? '' : 'od '}${kc(jednorazove)}</strong>
          ${kZaplaceni ? `<span class="kalk-mesicne">${kZaplaceni.lhuta}</span>` : ''}
          ${mesicne ? `<span class="kalk-mesicne">+ od ${kc(mesicne)} měsíčně</span>` : ''}`);
        vysledek.appendChild(cena);
        vysledek.appendChild(el('ul', 'kalk-rozpis', v.map(p => `<li><span>${p.name}</span><span>${cenaPolozky(p)}</span></li>`).join('')));

        if (bal) {
          const pokryte = new Set(v.filter(p => !p.extra && !p.mesicne).flatMap(p => bal.r.covers[p.id]));
          extra.forEach(x => x.matches.forEach(m => pokryte.add(m)));
          const navic = bal.b.features.filter(f => !pokryte.has(f));
          const rozdil = bal.cena - jednorazove;
          const malym = (t) => /^.[a-zá-ž]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; // SEO zůstane SEO
          const nazvy = extra.map((x, i) => i ? malym(x.name.split(' (')[0]) : x.name.split(' (')[0]);
          const vcetne = extra.length ? ` ${nazvy.join(', ').replace(/, ([^,]*)$/, ' a $1')} ${extra.length > 1 ? 'jsou' : 'je'} v něm v ceně.` : '';
          vysledek.appendChild(el('div', 'kalk-balicek', `
            <p class="kalk-balicek-stitek">${rozdil <= 0 ? 'Vyjde levněji' : 'Tip'}</p>
            <p><strong>${bal.b.name}</strong> za ${bal.b.price.replace(/^Od /, 'od ')} obsahuje všechno, co jste vybrali.${vcetne}${navic.length ? ' A k tomu:' : ''}</p>
            ${navic.length ? `<ul>${navic.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
            <p class="kalk-balicek-rozdil">${rozdil > 0 ? `Oproti samotným položkám +${kc(rozdil)}.` : rozdil < 0 ? `Oproti samotným položkám ušetříte <strong>${kc(-rozdil)}</strong>.` : 'Stojí stejně jako samotné položky a dostanete víc.'}</p>
            <a href="${kontaktHref}" class="kalk-balicek-btn">Chci ${bal.b.name} <span aria-hidden="true">→</span></a>`));
        }

        if (kZaplaceni) {
          const platba = el('div', 'kalk-platba', `
            <label class="kalk-souhlas"><input type="checkbox"> <span>Žádám o zahájení služby před uplynutím lhůty pro odstoupení. Beru na vědomí, že při odstoupení uhradím poměrnou část a po úplném provedení služby právo na odstoupení zaniká (<a href="${koren()}obchod/podminky/#odstoupeni">podmínky</a>).</span></label>
            <button type="button" class="btn btn-accent kalk-zaplatit">Zaplatit online ${kc(kZaplaceni.price)}</button>
            <p class="kalk-platba-chyba" role="alert" hidden></p>`);
          vysledek.appendChild(platba);
          napojPlatbu(platba, kZaplaceni);
        }
        const akce = el('div', 'kalk-akce', `
          <a href="${kontaktHref}" class="btn ${kZaplaceni ? 'btn-secondary' : 'btn-accent'} kalk-poptat">${kZaplaceni ? 'Nejdřív se zeptat' : cfg.ctaInquiry}</a>
          ${document.getElementById('helpWidget') ? `<button type="button" class="btn btn-secondary kalk-ai">${cfg.ctaAi}</button>` : ''}`);
        vysledek.appendChild(akce);
        vysledek.appendChild(el('p', 'kalk-pozn', kZaplaceni ? 'Cena je konečná (nejsme plátci DPH). Termín běží od chvíle, kdy nám pošlete přístupy k webu.' : cfg.note));
        panel.appendChild(vysledek);

        const znovu = el('button', 'kalk-zpet', 'Spočítat znovu');
        znovu.type = 'button';
        znovu.addEventListener('click', () => { cesta = null; hlavni = []; doplnky = []; krok = 0; vykresli(-1); });
        const pat = paticka(znovu);
        panel.appendChild(pat);

        // --- Přenos výběru do poptávky a do PEBAi ---
        const shrnuti = v.map(p => `- ${p.name} (${cenaPolozky(p)})`).join('\n');
        const cenaText = `od ${kc(jednorazove)}` + (mesicne ? ` + od ${kc(mesicne)} měsíčně` : '');
        akce.querySelector('.kalk-poptat').addEventListener('click', () => {
          vyplnPoptavku(`Dobrý den,\nmám zájem o:\n${shrnuti}\n\nOrientační cena z kalkulačky: ${cenaText}.\nProsím o nezávaznou nabídku.`, v);
        });
        const balBtn = vysledek.querySelector('.kalk-balicek-btn');
        if (balBtn) balBtn.addEventListener('click', () => {
          vyplnPoptavku(`Dobrý den,\nmám zájem o balíček ${bal.b.name} (${bal.b.price.replace(/^Od /, 'od ')}).\n\nV kalkulačce jsem měl(a) vybráno:\n${shrnuti}\n\nProsím o nezávaznou nabídku.`, v);
        });
        if (akce.querySelector('.kalk-ai')) akce.querySelector('.kalk-ai').addEventListener('click', (e) => {
          e.stopPropagation(); // jinak by klik mimo widget asistenta hned zase zavřel
          const widget = document.getElementById('helpWidget');
          const input = document.getElementById('helpWidgetInput');
          if (!widget || !input) return;
          if (!widget.classList.contains('is-open')) document.getElementById('helpWidgetToggle').click();
          input.value = `V kalkulačce mám vybráno: ${v.map(p => p.name).join(', ')} (orientačně ${cenaText}). Co byste mi doporučili?`;
          input.dispatchEvent(new Event('input'));
          setTimeout(() => input.focus(), 150);
        });
        if (window.PEBZvuk) window.PEBZvuk.play('success');
      }

      root.innerHTML = '';
      root.appendChild(panel);
      if (smer) {
        const h = panel.querySelector('.kalk-otazka');
        if (h) h.focus({ preventScroll: true });
      }
    }

    let posledniText = '';
    function vyplnPoptavku(text, v) {
      const typProjektu = typPodleVyberu(v);
      if (!naHlavni) {
        try { sessionStorage.setItem('pebmedia-poptavka', JSON.stringify({ text, typ: typProjektu })); } catch (e) { /* soukromé okno */ }
        return;
      }
      const zprava = document.getElementById('f-message');
      if (zprava && (!zprava.value.trim() || zprava.value === posledniText)) {
        zprava.value = text;
        posledniText = text;
      }
      const typ = document.getElementById('f-type');
      if (typ && !typ.value) {
        typ.value = typProjektu;
      }
    }

    function typPodleVyberu(v) {
      const kat = new Set(v.map(p => p.kat));
      return v.some(p => p.id === 'svc-web-4' || p.id === 'svc-web-5') ? 'E-shop' : kat.has('cat-web') || kat.has('rychla') ? 'Web' : kat.has('cat-branding') ? 'Logo / branding' : kat.has('cat-security') ? 'Kyberbezpečnost' : v.some(p => p.id === 'svc-tech-2') ? 'Automatizace' : 'AI / jiné';
    }

    // Platba služby s pevnou cenou přes Stripe (cenu bere server z obchodu, ne z prohlížeče).
    function napojPlatbu(box, polozka) {
      const souhlas = box.querySelector('input[type="checkbox"]');
      const btn = box.querySelector('.kalk-zaplatit');
      const chyba = box.querySelector('.kalk-platba-chyba');
      const ukaz = (t) => { chyba.textContent = t; chyba.hidden = false; if (window.PEBZvuk) window.PEBZvuk.play('error'); };
      btn.addEventListener('click', async () => {
        chyba.hidden = true;
        if (!souhlas.checked) { ukaz('Pro objednání je potřeba zaškrtnout žádost o zahájení služby.'); souhlas.focus(); return; }
        btn.disabled = true;
        const puvodni = btn.textContent;
        btn.textContent = 'Přesměrovávám na platbu…';
        try {
          const res = await fetch(koren() + 'api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: polozka.produkt, souhlasOdstoupeni: true }) });
          const json = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
          if (!res.ok || !json || !json.url) throw new Error((json && json.error) || 'Online platby tu zatím nefungují. Objednejte prosím přes poptávku nebo na info.pebmedia@gmail.com.');
          const url = new URL(json.url);
          if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Neplatná adresa platby.');
          window.location.href = url.href;
        } catch (err) {
          ukaz(err.message);
          btn.disabled = false;
          btn.textContent = puvodni;
        }
      });
    }

    vykresli();
  }

  // Tlačítko „Spočítejte si to“ pod ceníkem: otočí se a ukáže kartu kalkulačky, křížek ji otočí zpátky.
  function initKalkFlip() {
    const obal = document.getElementById('kalkulacka');
    if (!obal) return;
    const tlacitko = document.getElementById('kalkOtevrit');
    const karta = document.getElementById('kalkKarta');
    const zavrit = document.getElementById('kalkZavrit');
    const POLOVINA = 220; // ms na otočení o 90°
    let bezi = false;
    const klid = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Prvek schovaný na hraně (natočený o 90°) zobrazí a nechá ho dotočit do 0°.
    function dotoc(prvek, trida) {
      prvek.classList.add(trida);
      prvek.hidden = false;
      setTimeout(() => prvek.classList.remove(trida), 20);
    }

    function otevrit({ posunout = false } = {}) {
      if (bezi || !karta.hidden) return;
      bezi = true;
      tlacitko.setAttribute('aria-expanded', 'true');
      const hotovo = () => {
        tlacitko.hidden = true;
        tlacitko.classList.remove('is-flip-out');
        if (klid()) karta.hidden = false; else dotoc(karta, 'is-flip-in');
        obal.classList.add('is-open');
        setTimeout(() => {
          bezi = false;
          if (posunout) karta.scrollIntoView({ block: 'start', behavior: klid() ? 'auto' : 'smooth' });
          const prvni = karta.querySelector('#kalk .kalk-otazka');
          if (prvni) prvni.focus({ preventScroll: true });
        }, klid() ? 0 : 460);
      };
      if (window.PEBZvuk) window.PEBZvuk.play('open');
      if (klid()) { hotovo(); return; }
      tlacitko.classList.add('is-flip-out');
      setTimeout(hotovo, POLOVINA);
    }

    function zavritKartu() {
      if (bezi || karta.hidden) return;
      bezi = true;
      const hotovo = () => {
        karta.hidden = true;
        karta.classList.remove('is-flip-in');
        obal.classList.remove('is-open');
        tlacitko.setAttribute('aria-expanded', 'false');
        if (klid()) tlacitko.hidden = false; else dotoc(tlacitko, 'is-flip-out');
        setTimeout(() => { bezi = false; tlacitko.focus({ preventScroll: true }); }, klid() ? 0 : POLOVINA + 40);
      };
      if (window.PEBZvuk) window.PEBZvuk.play('close');
      if (klid()) { hotovo(); return; }
      karta.classList.add('is-flip-in');
      setTimeout(hotovo, POLOVINA + 60);
    }

    tlacitko.addEventListener('click', () => otevrit());
    zavrit.addEventListener('click', zavritKartu);
    karta.addEventListener('keydown', (e) => { if (e.key === 'Escape') zavritKartu(); });

    // Odkaz na #kalkulacka (třeba od PEBAi) kartu otevře; při vstupu na web je ale vždy nejdřív jen tlačítko.
    const zOdkazu = () => { if (location.hash === '#kalkulacka') otevrit({ posunout: true }); };
    window.addEventListener('hashchange', zOdkazu);
    document.addEventListener('click', (e) => {
      const odkaz = e.target.closest && e.target.closest('a[href$="#kalkulacka"]');
      if (odkaz) { e.preventDefault(); otevrit({ posunout: true }); }
    });
  }

  window.PEBKalkulacka = { init: initKalkulacka, initFlip: initKalkFlip };
})();
