/* ==========================================================================
   PEBMedia — public site renderer
   Čte data/content.json (editovatelné přes admin.html) a vykresluje obsah.
   Pokud fetch selže (typicky při otevření souboru přímo dvojklikem, kdy
   prohlížeč blokuje čtení JSON z disku), použije se offline záloha ze
   souboru js/content-fallback.js, aby stránka nezůstala prázdná.
   Pro plně živý obsah (a fungující admin) web spouštějte přes lokální
   server (např. `npx serve .`) nebo nasazený na Vercelu.
   ========================================================================== */

(function () {
  'use strict';

  const CONTENT_URL = 'data/content.json';

  async function loadContent() {
    try {
      const res = await fetch(CONTENT_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Content fetch failed');
      return await res.json();
    } catch (err) {
      if (window.__PEBMEDIA_FALLBACK_CONTENT__) {
        console.warn('data/content.json se nepodařilo načíst (pravděpodobně náhled přes file://). Používám offline zálohu obsahu z js/content-fallback.js — pro živá data spusťte web přes lokální server nebo jej nasaďte na Vercel.');
        return window.__PEBMEDIA_FALLBACK_CONTENT__;
      }
      console.error('Nepodařilo se načíst data/content.json a offline záloha není dostupná', err);
      document.body.innerHTML =
        '<div style="padding:80px 32px;font-family:sans-serif;max-width:560px;margin:0 auto;text-align:center;">' +
        '<h1 style="font-size:22px;">Obsah se nepodařilo načíst</h1>' +
        '<p style="color:#666;margin-top:12px;">Pokud si stránku prohlížíte lokálně otevřením souboru, spusťte ji prosím přes lokální server (např. <code>npx serve .</code>), protože prohlížeč blokuje načítání JSON souborů přímo z disku.</p>' +
        '</div>';
      return null;
    }
  }

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // Jednoduchá vanilla JS obdoba komponenty CountUp (React Bits) — bez
  // závislosti na Reactu/motion, protože web je čisté HTML/CSS/JS.
  // Rozparsuje text typu "20 000 Kč" na předponu/číslo/příponu a animuje
  // počítání od 0 nahoru, jakmile je prvek vidět na obrazovce.
  function countUpOnView(elNode, { duration = 1500 } = {}) {
    if (!elNode) return;
    const targetText = elNode.textContent.trim();
    const match = targetText.match(/^(\D*)([\d\s.,]*\d)(\D*)$/);
    if (!match) return; // text neobsahuje číslo, necháme beze změny

    const [, prefix, numStr, suffix] = match;
    const targetNum = parseInt(numStr.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(targetNum)) return;

    const formatNum = n => Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ');
    elNode.textContent = `${prefix}0${suffix}`;

    const animate = () => {
      const start = performance.now();
      const step = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        elNode.textContent = `${prefix}${formatNum(targetNum * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
        else elNode.textContent = targetText;
      };
      requestAnimationFrame(step);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animate();
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      io.observe(elNode);
    } else {
      elNode.textContent = targetText;
    }
  }

  /**
   * Text zprávy jako bezpečné DOM uzly: žádné HTML z modelu, jen odstavce
   * a odkazy na https adresy, e-maily a telefon (ochrana proti XSS).
   */
  function textToNodes(text) {
    const frag = document.createDocumentFragment();
    const re = /(https?:\/\/[^\s<>"')]+|(?:www\.)?pebmedia\.cz(?:\/[^\s<>"')]*)?|[\w.+-]+@[\w-]+\.[\w.-]+|\+420(?:\s?\d{3}){3})/g;
    String(text).split(/\n{2,}/).forEach((odstavec, i) => {
      if (i) frag.appendChild(document.createElement('br'));
      if (i) frag.appendChild(document.createElement('br'));
      let last = 0;
      odstavec.replace(re, (m, _g, idx) => {
        frag.appendChild(document.createTextNode(odstavec.slice(last, idx)));
        const cisty = m.replace(/[.,;:!?]+$/, '');
        const a = document.createElement('a');
        if (/@/.test(cisty)) a.href = 'mailto:' + cisty;
        else if (/^\+420/.test(cisty)) a.href = 'tel:' + cisty.replace(/\s/g, '');
        else a.href = /^https?:/.test(cisty) ? cisty : 'https://' + cisty.replace(/^www\./, '');
        if (/^https?:/.test(a.href) && !/^https:\/\/(www\.)?pebmedia\.cz/.test(a.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.textContent = cisty;
        frag.appendChild(a);
        frag.appendChild(document.createTextNode(m.slice(cisty.length)));
        last = idx + m.length;
        return m;
      });
      frag.appendChild(document.createTextNode(odstavec.slice(last)));
    });
    return frag;
  }

  function initHelpWidget() {
    const widget = document.getElementById('helpWidget');
    if (!widget) return;
    const toggle = document.getElementById('helpWidgetToggle');
    const messages = document.getElementById('helpWidgetMessages');
    const contactLink = document.getElementById('helpWidgetContactLink');
    const form = document.getElementById('helpWidgetForm');
    const input = document.getElementById('helpWidgetInput');
    const sendBtn = form ? form.querySelector('button[type="submit"]') : null;
    const resetBtn = document.getElementById('helpWidgetReset');
    const closeBtn = document.getElementById('helpWidgetClose');
    const UVITANI = 'Dobrý den, jsem PEBAi, asistent PEBMedia. Rád vám poradím s webem, e-shopem, logem nebo s výběrem v našem obchodě. Napište mi, co potřebujete, a společně najdeme nejlepší řešení.';
    const ULOZISTE = 'pebai-konverzace';
    let historie = []; // konverzace pro PEBAi (posílá se jen při dotazu)

    // Konverzace přežije přechod mezi stránkami (jen v této záložce, nikam se neposílá).
    function ulozit() {
      try { sessionStorage.setItem(ULOZISTE, JSON.stringify(historie.slice(-16))); } catch (e) { /* soukromé okno */ }
    }
    function nacist() {
      try {
        const data = JSON.parse(sessionStorage.getItem(ULOZISTE) || '[]');
        return Array.isArray(data) ? data.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) : [];
      } catch (e) { return []; }
    }

    function avatar() {
      const a = el('span', 'pebai-avatar');
      a.setAttribute('aria-hidden', 'true');
      a.innerHTML = '<svg viewBox="0 0 400 400"><use href="#logoMarkP"></use></svg>';
      return a;
    }

    function addMessage(text, from) {
      const radek = el('div', 'help-row help-row-' + from);
      const zprava = el('div', 'help-msg help-msg-' + from);
      if (text !== null) zprava.appendChild(textToNodes(text));
      if (from === 'bot') radek.appendChild(avatar());
      radek.appendChild(zprava);
      messages.appendChild(radek);
      messages.scrollTop = messages.scrollHeight;
      return radek;
    }

    function zacitZnovu() {
      messages.innerHTML = '';
      addMessage(UVITANI, 'bot');
    }

    // Stránka může přijít už předgenerovaná (scripts/predgeneruj.js) — začít načisto.
    zacitZnovu();
    historie = nacist();
    historie.forEach((m) => addMessage(m.content, m.role === 'user' ? 'user' : 'bot'));

    function otevrit(stav) {
      widget.classList.toggle('is-open', stav);
      toggle.setAttribute('aria-expanded', String(stav));
      if (stav) {
        messages.scrollTop = messages.scrollHeight;
        if (input && window.matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 120);
      }
    }

    function prizpusobVysku() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      if (sendBtn) sendBtn.disabled = !input.value.trim();
    }

    if (form && input) {
      let odesila = false;
      prizpusobVysku();
      input.addEventListener('input', prizpusobVysku);
      // Enter odešle, Shift+Enter udělá nový řádek.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          form.requestSubmit();
        }
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dotaz = input.value.trim();
        if (!dotaz || odesila) return;
        odesila = true;
        input.value = '';
        prizpusobVysku();
        addMessage(dotaz, 'user');
        historie.push({ role: 'user', content: dotaz });
        const pise = addMessage(null, 'bot');
        const tecky = pise.querySelector('.help-msg');
        tecky.classList.add('help-typing');
        tecky.setAttribute('aria-label', 'PEBAi píše odpověď');
        tecky.innerHTML = '<span></span><span></span><span></span>';
        try {
          const res = await fetch('api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: historie.slice(-16) })
          });
          const json = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
          pise.remove();
          if (json && res.ok && json.reply) {
            historie.push({ role: 'assistant', content: json.reply });
            ulozit();
            addMessage(json.reply, 'bot');
            if (window.PEBZvuk) window.PEBZvuk.play('success');
          } else {
            historie.pop();
            addMessage((json && json.error) || 'PEBAi tady zatím neběží. Napište nám prosím na info.pebmedia@gmail.com, ozveme se obratem.', 'bot');
            if (window.PEBZvuk) window.PEBZvuk.play('error');
          }
        } catch (err) {
          pise.remove();
          historie.pop();
          addMessage('Spojení se nepodařilo. Zkuste to prosím znovu, nebo napište na info.pebmedia@gmail.com.', 'bot');
        } finally {
          odesila = false;
          input.focus();
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        historie = [];
        ulozit();
        zacitZnovu();
        if (input) input.focus();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => { otevrit(false); toggle.focus(); });
    }

    if (contactLink) {
      contactLink.addEventListener('click', () => otevrit(false));
    }

    toggle.addEventListener('click', () => otevrit(!widget.classList.contains('is-open')));

    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target) && e.target.isConnected && widget.classList.contains('is-open')) otevrit(false);
    });

    // Escape zavře widget a vrátí fokus na přepínač (WCAG 2.1.2)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && widget.classList.contains('is-open')) {
        otevrit(false);
        toggle.focus();
      }
    });
  }

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
    (cfg.extras || []).forEach(x => { polozky[x.id] = { id: x.id, name: x.name, price: castka(x.price), extra: true, matches: x.matches, kat: 'extra' }; });
    const balicky = Object.fromEntries(data.packages.items.filter(p => p.visible !== false).map(p => [p.id, p]));
    const cenaPolozky = (p) => p.mesicne ? `od ${kc(p.price)}/měs.` : `od ${kc(p.price)}`;

    const IKONY = {
      web: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      eshop: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
      brand: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z"/></svg>',
      jine: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>'
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
        otazka('Váš návrh');

        const vysledek = el('div', 'kalk-vysledek');
        const cena = el('div', 'kalk-cena-box', `
          <span class="kalk-cena-popis">Orientační cena</span>
          <strong class="kalk-celkem-cena">od ${kc(jednorazove)}</strong>
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
            <a href="#kontakt" class="kalk-balicek-btn">Chci ${bal.b.name} <span aria-hidden="true">→</span></a>`));
        }

        const akce = el('div', 'kalk-akce', `
          <a href="#kontakt" class="btn btn-accent kalk-poptat">${cfg.ctaInquiry}</a>
          <button type="button" class="btn btn-secondary kalk-ai">${cfg.ctaAi}</button>`);
        vysledek.appendChild(akce);
        vysledek.appendChild(el('p', 'kalk-pozn', cfg.note));
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
        akce.querySelector('.kalk-ai').addEventListener('click', (e) => {
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
      const zprava = document.getElementById('f-message');
      if (zprava && (!zprava.value.trim() || zprava.value === posledniText)) {
        zprava.value = text;
        posledniText = text;
      }
      const typ = document.getElementById('f-type');
      if (typ && !typ.value) {
        const kat = new Set(v.map(p => p.kat));
        typ.value = kat.has('cat-web') || kat.has('cat-branding') ? 'Web' : kat.has('cat-security') ? 'Kyberbezpečnost' : v.some(p => p.id === 'svc-tech-2') ? 'Automatizace' : 'AI / jiné';
      }
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

  function starsSvg(count) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += `<svg viewBox="0 0 20 20" style="${i < count ? '' : 'fill:#E3E3DE'}"><path d="M10 1l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L10 14.9 4.4 18l1.4-6.2L1 7.5l6.4-.6L10 1z"/></svg>`;
    }
    return out;
  }

  function referenceTile(r) {
    return `
      <div class="stars">${starsSvg(r.rating)}</div>
      <p class="reference-text">„${r.text}“</p>
      <div class="reference-company">${r.company}</div>
    `;
  }

  function escAttr(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /**
   * Galerie fotek a videí od studentů (content.json → schools.gallery).
   * Fotky mají dvě velikosti (srcset), videa se v mřížce jen naznačí náhledem
   * a přehrají se až v prohlížeči (lightbox) — stránka tak zůstane rychlá.
   */
  function renderSchoolsGallery(data) {
    const wrap = document.getElementById('schoolsGalleryWrap');
    const grid = document.getElementById('schoolsGallery');
    if (!wrap || !grid) return;
    const items = (data.schools.gallery || [])
      .filter(m => m.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    wrap.hidden = items.length === 0;
    grid.dataset.count = String(Math.min(items.length, 4)); // rozložení se přizpůsobí počtu (viz CSS)
    grid.innerHTML = '';

    items.forEach((m, i) => {
      const isVideo = m.type === 'video';
      const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
      // focus = bod zaostření výřezu, např. "center 70%" (kde jsou na fotce lidé)
      const focus = /^[a-z0-9 %.]+$/i.test(m.focus || '') ? ` style="object-position: ${m.focus}"` : '';
      let thumb;
      if (!isVideo) {
        thumb = `<img src="${escAttr(m.srcSmall || m.src)}" srcset="${escAttr(m.srcSmall || m.src)} 800w, ${escAttr(m.src)} ${m.width || 1600}w" sizes="(max-width: 640px) 50vw, 25vw"${dims}${focus} alt="${escAttr(m.alt)}" loading="lazy" decoding="async">`;
      } else if (m.poster) {
        thumb = `<img src="${escAttr(m.poster)}"${dims} alt="${escAttr(m.alt)}" loading="lazy" decoding="async">`;
      } else {
        thumb = `<video src="${escAttr(m.src)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video>`;
      }
      grid.appendChild(el('figure', 'gallery-item reveal' + (isVideo ? ' is-video' : ''), `
        <button type="button" class="gallery-open" data-index="${i}" aria-label="${isVideo ? 'Přehrát video' : 'Zobrazit fotku'}: ${escAttr(m.alt)}">
          ${thumb}
          ${isVideo ? '<span class="gallery-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' : ''}
        </button>
        ${m.caption ? `<figcaption>${m.caption}</figcaption>` : ''}
      `));
    });

    // Výzva k zaslání dalších fotek — vždy jako poslední dlaždice.
    const email = data.general.email;
    grid.appendChild(el('a', 'gallery-invite reveal', `
      <span class="gallery-invite-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>
      <span class="gallery-invite-title">Máte fotky nebo video z plesu?</span>
      <span class="gallery-invite-text">Pošlete nám je a rádi je sem přidáme.</span>
    `));
    const invite = grid.lastElementChild;
    invite.href = `mailto:${email}?subject=${encodeURIComponent('Fotky a videa z maturitního plesu')}`;

    initLightbox(items, grid);
  }

  // Prohlížeč galerie (nativní <dialog>: fokus, Esc a přístupnost řeší prohlížeč).
  const lightbox = { items: [], current: 0, opener: null, ready: false };

  function lightboxShow(i) {
    const { items } = lightbox;
    if (!items.length) return;
    lightbox.current = (i + items.length) % items.length;
    const m = items[lightbox.current];
    const stage = document.getElementById('lightboxStage');
    stage.innerHTML = m.type === 'video'
      ? `<video src="${escAttr(m.src)}" controls autoplay playsinline ${m.poster ? `poster="${escAttr(m.poster)}"` : ''} aria-label="${escAttr(m.alt)}"></video>`
      : `<img src="${escAttr(m.src)}" alt="${escAttr(m.alt)}">`;
    document.getElementById('lightboxCaption').textContent = m.caption || m.alt || '';
    document.getElementById('lightboxCounter').textContent = items.length > 1 ? `${lightbox.current + 1} / ${items.length}` : '';
    document.getElementById('lightboxPrev').hidden = document.getElementById('lightboxNext').hidden = items.length < 2;
  }

  function initLightbox(items, grid) {
    const dialog = document.getElementById('lightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    lightbox.items = items;
    if (grid.dataset.lightboxBound) return;
    grid.dataset.lightboxBound = '1';

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.gallery-open');
      if (!btn) return;
      lightbox.opener = btn;
      lightboxShow(Number(btn.dataset.index));
      dialog.showModal();
    });

    if (lightbox.ready) return; // ovládání dialogu stačí navázat jednou
    lightbox.ready = true;
    document.getElementById('lightboxPrev').addEventListener('click', () => lightboxShow(lightbox.current - 1));
    document.getElementById('lightboxNext').addEventListener('click', () => lightboxShow(lightbox.current + 1));
    document.getElementById('lightboxClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') lightboxShow(lightbox.current - 1);
      if (e.key === 'ArrowRight') lightboxShow(lightbox.current + 1);
    });
    dialog.addEventListener('close', () => {
      document.getElementById('lightboxStage').innerHTML = ''; // zastaví přehrávané video
      if (lightbox.opener) lightbox.opener.focus();
    });
    // Swipe na mobilu
    let startX = null;
    dialog.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    dialog.addEventListener('pointerup', (e) => {
      if (startX === null || lightbox.items.length < 2) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 50) lightboxShow(lightbox.current + (dx < 0 ? 1 : -1));
      startX = null;
    });
  }

  function render(data) {
    const g = data.general, seo = data.seo, hero = data.hero, intro = data.intro;

    // --- SEO / meta ---
    document.title = seo.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', seo.description);

    // --- Brand text ---
    ['logoText', 'footerLogoText'].forEach(id => {
      const n = document.getElementById(id);
      if (n) n.textContent = g.brand;
    });

    // --- Hero ---
    document.getElementById('heroHeadline').textContent = hero.headline;
    document.getElementById('heroText').textContent = hero.text;
    document.getElementById('heroCtaPrimary').textContent = hero.ctaPrimary;
    document.getElementById('heroCtaSecondary').textContent = hero.ctaSecondary;
    document.getElementById('headerCta').textContent = hero.ctaPrimary;

    // --- Intro ---
    document.getElementById('introLead').textContent = intro.text;
    const benefitsEl = document.getElementById('introBenefits');
    benefitsEl.innerHTML = '';
    intro.benefits.forEach(b => benefitsEl.appendChild(el('li', null, b)));

    // --- Services (categories with priced sub-items) ---
    document.getElementById('servicesHeading').textContent = data.services.heading;
    document.getElementById('servicesSubheading').textContent = data.services.subheading;
    const catsWrap = document.getElementById('serviceCategories');
    catsWrap.innerHTML = '';
    data.services.categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach(cat => {
        const itemsHtml = cat.items
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(it => `
            <div class="service-item-row">
              <span class="service-item-name">${it.name}</span>
              <span class="service-item-price">${it.price}</span>
            </div>
          `).join('');
        const card = el('div', 'service-category reveal', `
          <div class="service-category-head">
            <span class="service-category-number">${cat.number}</span>
            <h3 class="service-category-title">${cat.title}</h3>
            <p class="service-category-text">${cat.text}</p>
          </div>
          <div class="service-category-items">${itemsHtml}</div>
          ${cat.note ? `<p class="service-category-note">${cat.note}</p>` : ''}
        `);
        catsWrap.appendChild(card);
      });
    const svcPriceNote = data.services.priceNote;
    const oldSvcNote = document.getElementById('servicesPriceNote');
    if (oldSvcNote) oldSvcNote.remove();
    if (svcPriceNote) {
      catsWrap.insertAdjacentHTML('afterend', `<p class="price-note reveal" id="servicesPriceNote">${svcPriceNote}</p>`);
    }

    // --- Packages (balíčky) ---
    document.getElementById('packagesHeading').textContent = data.packages.heading;
    document.getElementById('packagesSubheading').textContent = data.packages.subheading;
    document.getElementById('packagesPriceNote').textContent = data.packages.priceNote;
    const pkgGrid = document.getElementById('packagesGrid');
    pkgGrid.innerHTML = '';
    data.packages.items
      .filter(p => p.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(p => {
        const card = el('div', 'package-card reveal' + (p.highlight ? ' is-highlight' : ''), `
          ${p.highlight ? `<span class="package-badge">${p.highlight}</span>` : ''}
          <div class="package-name">${p.name}</div>
          <div class="package-price">${p.price}</div>
          <p class="package-description">${p.description}</p>
          <ul class="package-features">
            ${p.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
          <a href="#kontakt" class="btn ${p.highlight ? 'btn-accent' : 'btn-secondary'} package-cta">${p.cta}</a>
        `);
        pkgGrid.appendChild(card);
      });

    initKalkulacka(data);
    initKalkFlip();

    // --- Portfolio ---
    document.getElementById('portfolioHeading').textContent = data.portfolio.heading;
    document.getElementById('portfolioSubheading').textContent = data.portfolio.subheading;
    const grid = document.getElementById('portfolioGrid');
    grid.innerHTML = '';
    data.portfolio.items
      .sort((a, b) => a.order - b.order)
      .forEach(p => {
        const card = el('div', 'portfolio-card reveal' + (p.featured ? ' is-featured' : ''), `
          <div class="portfolio-media">
            <img src="${p.image}" alt="${p.title}" loading="lazy">
          </div>
          <div class="portfolio-body">
            <div>
              <div class="portfolio-title">${p.title}</div>
              <div class="portfolio-meta">${p.category}</div>
              <p class="portfolio-text">${p.text}</p>
              ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-small portfolio-link">Prohlédnout web</a>` : ''}
            </div>
            ${p.year ? `<div class="portfolio-year">${p.year}</div>` : ''}
          </div>
        `);
        grid.appendChild(card);
      });

    // --- References (static 2-column grid) ---
    document.getElementById('referencesHeading').textContent = data.references.heading;
    const refGrid = document.getElementById('referencesGrid');
    refGrid.innerHTML = '';
    data.references.items
      .filter(r => r.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(r => {
        refGrid.appendChild(el('div', 'reference-card reveal', referenceTile(r)));
      });

    // --- About ---
    document.getElementById('aboutHeading').textContent = data.about.heading;
    document.getElementById('aboutText').textContent = data.about.text;
    // Poznámka: v sekci "O nás" je místo fotky/baneru záměrně jen logo (viz index.html #aboutPhoto).

    // --- Schools ---
    document.getElementById('schoolsHeading').textContent = data.schools.heading;
    document.getElementById('schoolsText').textContent = data.schools.text;
    if (data.schools.stat) {
      document.getElementById('schoolsStatValue').textContent = data.schools.stat.value;
      document.getElementById('schoolsStatLabel').textContent = data.schools.stat.label;
    }
    const schoolsLogos = document.getElementById('schoolsLogos');
    schoolsLogos.innerHTML = '';
    (data.schools.logos || []).forEach(s => {
      const item = el('div', 'school-logo', `<img src="${s.logo}" alt="${s.name}" loading="lazy">`);
      if (s.link) {
        const a = document.createElement('a');
        a.href = s.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'school-logo';
        a.innerHTML = `<img src="${s.logo}" alt="${s.name}" loading="lazy">`;
        schoolsLogos.appendChild(a);
      } else {
        schoolsLogos.appendChild(item);
      }
    });

    renderSchoolsGallery(data);

    // --- Process ---
    document.getElementById('processHeading').textContent = data.process.heading;
    const processGrid = document.getElementById('processGrid');
    processGrid.innerHTML = '';
    data.process.steps.forEach(s => {
      processGrid.appendChild(el('div', 'process-step reveal', `
        <div class="process-number">${s.number}</div>
        <div class="process-title">${s.title}</div>
        <div class="process-text">${s.text}</div>
      `));
    });

    // --- FAQ ---
    document.getElementById('faqHeading').textContent = data.faq.heading;
    const faqList = document.getElementById('faqList');
    faqList.innerHTML = '';
    data.faq.items
      .filter(f => f.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(f => {
        const item = el('div', 'faq-item reveal', `
          <button class="faq-question" type="button" aria-expanded="false">
            <span>${f.question}</span>
            <span class="faq-icon"></span>
          </button>
          <div class="faq-answer"><div class="faq-answer-inner">${f.answer}</div></div>
        `);
        const btn = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        btn.addEventListener('click', () => {
          const isOpen = item.classList.contains('is-open');
          faqList.querySelectorAll('.faq-item.is-open').forEach(o => {
            o.classList.remove('is-open');
            o.querySelector('.faq-answer').style.maxHeight = null;
            o.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          });
          if (!isOpen) {
            item.classList.add('is-open');
            answer.style.maxHeight = answer.scrollHeight + 'px';
            btn.setAttribute('aria-expanded', 'true');
          }
        });
        faqList.appendChild(item);
      });

    initHelpWidget();

    // --- CTA ---
    document.getElementById('ctaHeading').textContent = data.ctaSection.heading;
    document.getElementById('ctaText').textContent = data.ctaSection.text;
    document.getElementById('ctaButton').textContent = data.ctaSection.cta;

    // --- Contact ---
    document.getElementById('contactHeading').textContent = data.contact.heading;
    document.getElementById('contactText').textContent = data.contact.text;
    document.getElementById('contactEmail').textContent = g.email;
    document.getElementById('contactPhone').textContent = g.phone;
    document.getElementById('contactIco').textContent = g.ico;
    const typeSelect = document.getElementById('f-type');
    typeSelect.innerHTML = '<option value="">Vyberte typ projektu</option>';
    data.contact.projectTypes.forEach(t => {
      const opt = el('option', null, t);
      opt.value = t;
      typeSelect.appendChild(opt);
    });

    // --- Footer ---
    document.getElementById('footerText').textContent = data.footer.text;
    document.getElementById('footerEmail').textContent = g.email;
    document.getElementById('footerPhone').textContent = g.phone;
    document.getElementById('footerCopyright').textContent = data.footer.copyright;
    document.getElementById('footerPrivacy').href = data.footer.privacyLink;
    document.getElementById('footerInstagram').href = g.social.instagram || '#';
    // LinkedIn a Facebook zatím nejsou založené — odkazy v patičce dočasně skryté (viz index.html).

    initInteractions(data);
  }

  /**
   * Navigace: posuvná "pilulka" pod odkazem, na kterém je myš, a zvýraznění
   * sekce, kterou má návštěvník právě na obrazovce (aria-current pro čtečky).
   */
  function initNavIndicator() {
    const nav = document.querySelector('.main-nav');
    const indicator = nav && nav.querySelector('.nav-indicator');
    if (!nav || !indicator) return;
    const links = Array.from(nav.querySelectorAll('a'));
    let activeLink = null;

    const moveTo = (link) => {
      if (!link) { indicator.classList.remove('is-visible'); return; }
      indicator.style.width = `${link.offsetWidth}px`;
      indicator.style.transform = `translateX(${link.offsetLeft}px)`;
      indicator.classList.add('is-visible');
    };

    links.forEach((link) => {
      link.addEventListener('mouseenter', () => moveTo(link));
      link.addEventListener('focus', () => moveTo(link));
    });
    nav.addEventListener('mouseleave', () => moveTo(activeLink));
    nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget)) moveTo(activeLink); });
    window.addEventListener('resize', () => moveTo(activeLink), { passive: true });

    if (!('IntersectionObserver' in window)) return;
    const sections = links
      .map((link) => {
        const id = (link.getAttribute('href') || '').startsWith('#') ? link.getAttribute('href').slice(1) : null;
        const section = id && document.getElementById(id);
        return section ? { link, section } : null;
      })
      .filter(Boolean);

    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      const current = sections.find((s) => visible.has(s.section));
      const next = current ? current.link : null;
      if (next === activeLink) return;
      if (activeLink) { activeLink.classList.remove('is-active'); activeLink.removeAttribute('aria-current'); }
      activeLink = next;
      if (activeLink) { activeLink.classList.add('is-active'); activeLink.setAttribute('aria-current', 'location'); }
      if (!nav.matches(':hover')) moveTo(activeLink);
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s.section));
  }

  function initInteractions(data) {
    const g = data.general;

    // Sticky header shadow
    const header = document.getElementById('siteHeader');
    const progressBar = document.getElementById('scrollProgress');
    let scrollTicking = false;
    const onScroll = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        header.classList.toggle('is-scrolled', window.scrollY > 8);
        if (progressBar) {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          progressBar.style.setProperty('--progress', max > 0 ? Math.min(window.scrollY / max, 1).toFixed(4) : 0);
        }
        scrollTicking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    initNavIndicator();

    // Mobile menu
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobileNav');
    hamburger.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('is-open');
      hamburger.classList.toggle('is-open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    const closeMobileNav = () => {
      mobileNav.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));

    // Escape zavře mobilní menu a vrátí fokus na hamburger (WCAG 2.1.2)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
        closeMobileNav();
        hamburger.focus();
      }
    });

    // Reveal on scroll
    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealEls.forEach(e => io.observe(e));
    } else {
      revealEls.forEach(e => e.classList.add('is-visible'));
    }

    // Animované počítání čísla ve statistice sekce "Školy" (viz countUpOnView výše)
    countUpOnView(document.getElementById('schoolsStatValue'));

    // Contact form (odesíláno nativním POST na Web3Forms — bez fetch/AJAX,
    // aby formulář fungoval spolehlivě i bez CORS. Web3Forms po odeslání
    // přesměruje zpět na náš web pomocí "redirect", kde zobrazíme poděkování.)
    const form = document.getElementById('contactForm');
    if (form) {
      const successEl = document.getElementById('formSuccess');
      const errorEl = document.getElementById('formError');
      const formErrorEmail = document.getElementById('formErrorEmail');
      if (formErrorEmail) formErrorEmail.textContent = g.email;

      // Návratová URL se skládá dynamicky, aby fungovala i po přepnutí
      // na vlastní doménu pebmedia.cz.
      const nextField = document.getElementById('formNext');
      if (nextField) {
        const base = window.location.origin + window.location.pathname;
        nextField.value = `${base}?sent=1#kontakt`;
      }

      form.addEventListener('submit', () => {
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Odesílám…';
        // Formulář se odešle běžným (nativním) POST požadavkem prohlížeče —
        // žádný preventDefault, žádný fetch.
      });

      // Po návratu z Web3Forms (?sent=1) zobrazíme poděkování a vyčistíme URL.
      const params = new URLSearchParams(window.location.search);
      if (params.get('sent') === '1') {
        successEl.classList.add('is-visible');
        errorEl.classList.remove('is-visible');
        params.delete('sent');
        const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + '#kontakt';
        window.history.replaceState({}, '', cleanUrl);
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  loadContent().then(data => { if (data) render(data); });
})();
