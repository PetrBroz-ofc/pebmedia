// js/zvuky.js
// Jemné zvuky rozhraní. Pravidla (podle skillu use-sound):
//  - ve výchozím stavu VYPNUTO; zapíná se přepínačem v hlavičce a volba se pamatuje,
//  - zvuk hraje jen po akci uživatele (klik, klávesa), nikdy při načtení nebo scrollu,
//  - každý zvuk jen doplňuje změnu, kterou je vidět (zvuk nikdy nenese informaci sám),
//  - zvuky se syntetizují přes Web Audio, takže se nic nestahuje.
// Ostatní skripty mohou volat window.PEBZvuk.play('success' | 'error' | …).

(function () {
  'use strict';

  const KLIC = 'pebmedia-zvuky';
  const HLASITOST = 0.3;
  let zapnuto = false;
  let ctx = null;

  try { zapnuto = window.localStorage.getItem(KLIC) === 'on'; } catch (e) { /* soukromý režim */ }

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Jeden tón: frekvence od→do, délka v ms, tvar vlny, relativní hlasitost. */
  function ton(a, { od, do: doFreq = od, ms, typ = 'sine', hlas = 1, zpozdeni = 0 }) {
    const t0 = a.currentTime + zpozdeni / 1000;
    const t1 = t0 + ms / 1000;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = typ;
    osc.frequency.setValueAtTime(od, t0);
    osc.frequency.exponentialRampToValueAtTime(doFreq, t1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(HLASITOST * hlas, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  // Výška tónu nese směr: nahoru = otevřít/potvrdit, dolů = zavřít/zpět.
  const ZVUKY = {
    tap: (a) => ton(a, { od: 1400, do: 900, ms: 55, typ: 'triangle', hlas: 0.7 }),
    open: (a) => ton(a, { od: 420, do: 760, ms: 140, hlas: 0.8 }),
    close: (a) => ton(a, { od: 760, do: 420, ms: 130, hlas: 0.7 }),
    toggleOn: (a) => { ton(a, { od: 660, ms: 70 }); ton(a, { od: 990, ms: 90, zpozdeni: 70 }); },
    toggleOff: (a) => { ton(a, { od: 660, ms: 70, hlas: 0.8 }); ton(a, { od: 440, ms: 90, hlas: 0.8, zpozdeni: 70 }); },
    success: (a) => { ton(a, { od: 659, ms: 160 }); ton(a, { od: 988, ms: 260, zpozdeni: 130 }); },
    error: (a) => ton(a, { od: 220, do: 200, ms: 280, typ: 'triangle', hlas: 0.9 })
  };

  function play(nazev, { vynutit = false } = {}) {
    if ((!zapnuto && !vynutit) || !ZVUKY[nazev]) return;
    const a = audio();
    if (a) ZVUKY[nazev](a);
  }

  function nastavPrepinac(btn) {
    btn.setAttribute('aria-pressed', String(zapnuto));
    btn.setAttribute('aria-label', zapnuto ? 'Vypnout zvuky' : 'Zapnout zvuky');
    btn.title = zapnuto ? 'Zvuky jsou zapnuté' : 'Zvuky jsou vypnuté';
  }

  function prepnout(btn) {
    zapnuto = !zapnuto;
    try { window.localStorage.setItem(KLIC, zapnuto ? 'on' : 'off'); } catch (e) { /* nevadí */ }
    nastavPrepinac(btn);
    play(zapnuto ? 'toggleOn' : 'toggleOff', { vynutit: true }); // potvrzení právě přepnuté volby
  }

  // Stav ovládacího prvku (aria-expanded) se mění až v jeho vlastním handleru,
  // proto se na něj podíváme o tik později a podle něj zvolíme otevřít/zavřít.
  function podleStavu(el) {
    setTimeout(() => play(el.getAttribute('aria-expanded') === 'true' ? 'open' : 'close'), 0);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.id === 'soundToggle') { prepnout(t); return; }
    if (t.matches('.faq-question, #hamburger, #helpWidgetToggle')) { podleStavu(t); return; }
    if (t.matches('.gallery-open')) { play('open'); return; }
    if (t.matches('.lightbox-close')) return; // zvuk obstará událost "close" dialogu
    if (t.matches('.btn, .main-nav a, .mobile-nav a, .lightbox-btn, .help-widget-question-btn')) play('tap');
  });

  // Zavření galerie (i klávesou Esc nebo kliknutím mimo).
  const lightbox = document.getElementById('lightbox');
  if (lightbox) lightbox.addEventListener('close', () => play('close'));

  const btn = document.getElementById('soundToggle');
  if (btn) nastavPrepinac(btn);

  window.PEBZvuk = { play, zapnuto: () => zapnuto };
})();
