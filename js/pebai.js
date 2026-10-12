// js/pebai.js
// PEBAi, AI asistent PEBMedia, v pravém dolním rohu každé stránky webu.
// Na hlavní stránce je okno přímo v HTML, jinde si ho skript vloží sám.
// Teď je ve vývoji: tlačítko je „prasklé“, po otevření svítí červeně a přes chat
// je vrstva s kladívkem (chat je vypnutý atributem inert ve šabloně).

(function () {
  'use strict';

  const koren = () => document.body.getAttribute('data-root') || './';
  const LOGO = '<svg viewBox="0 0 400 400"><rect x="12" y="12" width="376" height="376" rx="88" fill="#0B6E63"></rect><rect x="130" y="88" width="49" height="224" rx="10" fill="#F6F6F3"></rect><rect x="130" y="88" width="140" height="42" rx="10" fill="#F6F6F3"></rect><rect x="228" y="88" width="42" height="126" rx="10" fill="#F6F6F3"></rect><rect x="130" y="172" width="140" height="42" rx="10" fill="#F6F6F3"></rect></svg>';

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /** Vloží okno PEBAi na stránky, kde v HTML není (obchod, tomboly, právní texty…). */
  function vlozitOkno() {
    if (document.getElementById('helpWidget')) return;
    const kontakt = document.getElementById('kontakt') ? '#kontakt' : koren() + 'index.html#kontakt';
    const obal = document.createElement('div');
    obal.innerHTML = `<div class="help-widget" id="helpWidget">
  <div class="help-widget-panel" id="helpWidgetPanel" role="dialog" aria-labelledby="helpWidgetTitle">
    <div class="help-widget-header">
      <span class="pebai-avatar pebai-avatar-lg" aria-hidden="true">${LOGO}<i class="pebai-online"></i></span>
      <div class="help-widget-header-text">
        <div class="help-widget-header-title" id="helpWidgetTitle">PEBAi <span class="pebai-vyvoj">Ve vývoji</span></div>
        <div class="help-widget-header-sub">AI asistent PEBMedia · připravujeme</div>
      </div>
      <button type="button" class="help-widget-icon-btn" id="helpWidgetReset" aria-label="Začít novou konverzaci" title="Nová konverzace"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg></button>
      <button type="button" class="help-widget-icon-btn" id="helpWidgetClose" aria-label="Zavřít PEBAi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>
    </div>
    <div class="help-widget-body">
    <div class="pebai-stavba" role="note" aria-labelledby="pebaiStavbaTitulek">
      <span class="pebai-stavba-ikona"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"></path><path d="m18 15 4-4"></path><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"></path></svg></span>
      <p class="pebai-stavba-titulek" id="pebaiStavbaTitulek">PEBAi je ve vývoji</p>
      <p class="pebai-stavba-text">Na asistentovi ještě pracujeme. Než ho spustíme, napište nám prosím rovnou, rádi poradíme.</p>
      <a class="btn btn-accent pebai-stavba-btn" href="${kontakt}" id="pebaiStavbaKontakt">Napsat nám</a>
      <a class="pebai-stavba-email" href="mailto:info.pebmedia@gmail.com">info.pebmedia@gmail.com</a>
    </div>
    <div class="help-widget-messages" id="helpWidgetMessages" aria-live="polite" inert=""></div>
    <form class="help-widget-form" id="helpWidgetForm" autocomplete="off" inert="">
      <label class="visually-hidden" for="helpWidgetInput">Váš dotaz pro PEBAi</label>
      <textarea id="helpWidgetInput" name="dotaz" rows="1" maxlength="1000" placeholder="Napište, s čím potřebujete pomoct…" enterkeyhint="send"></textarea>
      <button type="submit" aria-label="Odeslat dotaz"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"></path></svg></button>
    </form>
    <div class="help-widget-footer">
      <p class="help-widget-ai-note">PEBAi je zatím ve vývoji. Je to umělá inteligence (Claude) a může se splést. Nezadávejte citlivé údaje. <a href="${koren()}privacy.html#asistent">Více</a></p>
      <a href="${kontakt}" id="helpWidgetContactLink">Raději s člověkem? Napište nám →</a>
    </div>
    </div>
  </div>
  <button class="help-widget-toggle" id="helpWidgetToggle" type="button" aria-label="Otevřít PEBAi, AI asistenta PEBMedia" aria-expanded="false" aria-controls="helpWidgetPanel">
    <svg class="icon-chat" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
    <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>
    <span class="help-widget-toggle-label">Zeptejte se PEBAi</span>
    <span class="pebai-praskliny" aria-hidden="true">
      <svg viewBox="0 0 200 56" preserveAspectRatio="none">
        <path class="pebai-prasklina" d="M47 0 L42 13 L49 22 L41 33 L46 43 L42 56"></path>
        <path class="pebai-prasklina pebai-prasklina-vetev" d="M42 13 L34 16 L30 12"></path>
        <path class="pebai-prasklina pebai-prasklina-vetev" d="M49 22 L55 25"></path>
        <path class="pebai-prasklina pebai-prasklina-vetev" d="M41 33 L33 37"></path>
        <path class="pebai-prasklina pebai-prasklina-vetev" d="M46 43 L52 47"></path>
      </svg>
      <i class="pebai-stek pebai-stek-1"></i><i class="pebai-stek pebai-stek-2"></i>
      <i class="pebai-kapka pebai-kapka-1"></i><i class="pebai-kapka pebai-kapka-2"></i><i class="pebai-kapka pebai-kapka-3"></i><i class="pebai-kapka pebai-kapka-4"></i>
    </span>
  </button>
</div>`;
    document.body.appendChild(obal.firstElementChild);
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
    vlozitOkno();
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
    const UVITANI = 'Dobrý den, jsem PEBAi, asistent PEBMedia. Rád vám poradím s webem, e-shopem, logem nebo s výběrem v našem obchodě. Napište mi, co potřebujete, a společně najdeme nejlepší řešení. Jsem zatím ve vývoji, tak kdybych něco nevěděl, rád vás spojím s kolegy.';
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
      a.innerHTML = LOGO;
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
        // PEBAi je ve vývoji: přes chat je vrstva s kladívkem, pole pro dotaz se neaktivuje.
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
          const res = await fetch(koren() + 'api/chat', {
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
    const stavbaKontakt = document.getElementById('pebaiStavbaKontakt');
    if (stavbaKontakt) {
      stavbaKontakt.addEventListener('click', () => otevrit(false));
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHelpWidget);
  else initHelpWidget();
})();
