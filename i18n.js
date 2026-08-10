// PEB MEDIA — i18n: čeština jako výchozí jazyk, němčina se nasazuje
// automaticky u návštěvníků z Německa/Rakouska/Švýcarska/Lichtenštejnska
// na základě IP geolokace (client-side, bez nutnosti backendu).
//
// Pozn. pro Petra: detekce běží přes veřejné API ipapi.co (zdarma do
// ~30 000 dotazů/měsíc, bez klíče). Než se odpověď vrátí, stránka ukazuje
// češtinu — u statického webu bez SSR/edge funkce nejde jazyk vybrat
// dřív, než prohlížeč stránku vůbec načte. Pro opravdu okamžité (bez
// probliknutí) přepnutí by šlo později přidat Vercel Edge Middleware,
// které si IP přečte už na serveru a rovnou vrátí správnou verzi.

(function () {
  const STORAGE_KEY = 'peb_lang';
  const GERMAN_SPEAKING_COUNTRIES = ['DE', 'AT', 'CH', 'LI'];

  const TRANSLATIONS = {
    cs: {
      skip: "Přeskočit na obsah",
      skipBack: "Zpět na práci",
      nav: {
        work: "Práce",
        capabilities: "Schopnosti",
        about: "O nás",
        contact: "Kontakt",
        country: "Česká republika"
      },
      hero: {
        tags: 'WEB <span>/</span> BEZPEČNOST <span>/</span> 3D <span>/</span> DIGITÁL',
        statement: "Nezávislé digitální studio, které staví weby, digitální produkty a nekonvenční řešení.",
        viewWork: "Zobrazit práci →",
        startProject: "Začít projekt →",
        scroll: "Scroll"
      },
      work: {
        title: "Vybraná<br>práce",
        cat: {
          elrevmont: "Web / Design / Vývoj →",
          zatrapa: "Web / CMS / Administrace",
          restaurantos: "Produkt / UI / Vývoj",
          suta: "Web / Design / Vývoj"
        },
        open: "Otevřít případovou studii →"
      },
      ph: {
        desktop: "Náhled na desktopu — zástupný obsah",
        project: "Náhled projektu — zástupný obsah",
        product: "Náhled produktu — zástupný obsah",
        portrait: "Portrét — zástupný obsah",
        desktopShot: "Screenshot desktopu — zástupný obsah",
        mobileShot: "Screenshot mobilu — zástupný obsah",
        closeup: "Detail rozhraní — zástupný obsah"
      },
      dont: {
        title: "Co<br>neděláme",
        item1: "Nestavíme weby jen proto, abychom <strong>zaplnili portfolio.</strong>",
        item2: "Nepoužíváme šablony, když projekt potřebuje něco <strong>na míru.</strong>",
        item3: "Nepředstíráme, že každý problém potřebuje <strong>AI.</strong>",
        item4: "A neschováváme se za <strong>velký agenturní tým.</strong>"
      },
      cap: {
        title: "Schopnosti",
        count: "5 oblastí",
        web: { name: "Web", details: "Weby<br>Redesigny<br>Landing pages<br>Webové aplikace" },
        security: { name: "Bezpečnost", details: "Autorizované bezpečnostní testy<br>Bezpečnostní audity webů<br>Analýza zranitelností<br>Bezpečnostní reporty" },
        "3d": { name: "3D", details: "3D modelování<br>Vizualizace<br>Modelování produktů<br>Technické vizualizace" },
        digital: { name: "Digitál", details: "AI integrace<br>Automatizace<br>Vlastní nástroje<br>Digitální koncepty" },
        design: { name: "Design", details: "UI / UX<br>Vizuální identita<br>Digitální design<br>Kreativní směřování" }
      },
      about: {
        p1: "PEB Media je nezávislé digitální studio založené Petrem Brožem v České republice.",
        p2: "Studio spojuje vývoj webu, design, technologie, bezpečnost a 3D a vytváří praktická digitální řešení pro firmy i produkty.",
        p3: "U větších nebo specializovaných projektů PEB Media spolupracuje s externími specialisty.",
        based: { label: "Sídlo", value: "Liberecký kraj, ČR" },
        founded: { label: "Založil" },
        since: { label: "Působí od" }
      },
      approach: {
        title: "Jak<br>přemýšlíme",
        item1: "Pochopit skutečný problém.",
        item2: "Odstranit zbytečnou složitost.",
        item3: "Navrhnout nejjednodušší silné řešení.",
        item4: "Postavit ho pořádně.",
        item5: "Neustále ho zlepšovat."
      },
      contact: {
        title: "Máte něco<br>na mysli?",
        sub: "Řekněte nám, co stavíte, opravujete nebo se snažíte zlepšit."
      },
      form: {
        name: "Jméno",
        company: "Firma",
        email: "E-mail",
        budget: "Rozpočet",
        budgetPlaceholder: "Nepovinné",
        type: "Typ projektu",
        typeOptions: ["Web", "Redesign", "Kybernetická bezpečnost", "3D", "AI / Automatizace", "Design", "Jiné"],
        message: "Zpráva",
        submit: "Zahájit konverzaci →",
        note: "Odpovíme do 1–2 pracovních dnů",
        statusPlaceholder: "Zpráva připravena — napojte formulář na svůj vlastní endpoint (Vercel function / e-mail) pro odesílání."
      },
      footer: {
        tagline: "Nezávislé digitální studio<br>Česká republika",
        navigate: "Navigace",
        connect: "Spojte se",
        built: "Vytvořil Petr Brož"
      },
      status: { available: "· K dispozici pro projekty" },
      cs: {
        allWork: "← Veškerá práce",
        category: "Kategorie",
        year: "Rok",
        industry: "Odvětví",
        challenge: "Zadání",
        approach: "Přístup",
        result: "Výsledek",
        next: "Další projekt"
      },
      meta: {
        title: "PEB Media — Nezávislé digitální studio, Česká republika",
        description: "PEB Media je nezávislé digitální studio založené Petrem Brožem v České republice — vývoj webů, bezpečnostní testování, 3D vizualizace a digitální design.",
        ogTitle: "PEB Media — Nezávislé digitální studio",
        ogDescription: "Vývoj webů, bezpečnostní testování, 3D vizualizace a digitální design. Založil Petr Brož, Česká republika."
      },
      caseMeta: {
        title: "Případová studie — PEB Media",
        description: "Případová studie od PEB Media, nezávislého digitálního studia z České republiky."
      }
    },

    de: {
      skip: "Zum Inhalt springen",
      skipBack: "Zurück zur Arbeit",
      nav: {
        work: "Arbeit",
        capabilities: "Fähigkeiten",
        about: "Über uns",
        contact: "Kontakt",
        country: "Tschechien"
      },
      hero: {
        tags: 'WEB <span>/</span> SICHERHEIT <span>/</span> 3D <span>/</span> DIGITAL',
        statement: "Unabhängiges Digitalstudio für Websites, digitale Produkte und unkonventionelle Lösungen.",
        viewWork: "Arbeiten ansehen →",
        startProject: "Projekt starten →",
        scroll: "Scrollen"
      },
      work: {
        title: "Ausgewählte<br>Arbeiten",
        cat: {
          elrevmont: "Web / Design / Entwicklung →",
          zatrapa: "Web / CMS / Admin-System",
          restaurantos: "Produkt / UI / Entwicklung",
          suta: "Web / Design / Entwicklung"
        },
        open: "Fallstudie öffnen →"
      },
      ph: {
        desktop: "Desktop-Vorschau — Platzhalter",
        project: "Projektvorschau — Platzhalter",
        product: "Produktvorschau — Platzhalter",
        portrait: "Porträt — Platzhalter",
        desktopShot: "Desktop-Screenshot — Platzhalter",
        mobileShot: "Mobile-Screenshot — Platzhalter",
        closeup: "Detailansicht — Platzhalter"
      },
      dont: {
        title: "Was wir<br>nicht tun",
        item1: "Wir bauen keine Websites nur, um ein <strong>Portfolio zu füllen.</strong>",
        item2: "Wir verwenden keine Templates, wenn ein Projekt etwas <strong>Individuelles</strong> braucht.",
        item3: "Wir tun nicht so, als bräuchte jedes Problem <strong>KI.</strong>",
        item4: "Und wir verstecken uns nicht hinter einem <strong>großen Agenturteam.</strong>"
      },
      cap: {
        title: "Fähigkeiten",
        count: "5 Bereiche",
        web: { name: "Web", details: "Websites<br>Redesigns<br>Landing Pages<br>Webanwendungen" },
        security: { name: "Sicherheit", details: "Autorisierte Sicherheitstests<br>Web-Sicherheitsaudits<br>Schwachstellenanalyse<br>Sicherheitsberichte" },
        "3d": { name: "3D", details: "3D-Modellierung<br>Visualisierung<br>Produktmodellierung<br>Technische Visualisierung" },
        digital: { name: "Digital", details: "KI-Integrationen<br>Automatisierung<br>Eigene Tools<br>Digitale Konzepte" },
        design: { name: "Design", details: "UI / UX<br>Visuelle Identität<br>Digitales Design<br>Kreativkonzeption" }
      },
      about: {
        p1: "PEB Media ist ein unabhängiges Digitalstudio, gegründet von Petr Brož in Tschechien.",
        p2: "Das Studio verbindet Webentwicklung, Design, Technologie, Sicherheit und 3D zu praktischen digitalen Lösungen für Unternehmen und Produkte.",
        p3: "Bei größeren oder spezialisierten Projekten arbeitet PEB Media mit externen Fachleuten zusammen.",
        based: { label: "Sitz", value: "Region Liberec, Tschechien" },
        founded: { label: "Gegründet von" },
        since: { label: "Tätig seit" }
      },
      approach: {
        title: "Wie wir<br>denken",
        item1: "Das eigentliche Problem verstehen.",
        item2: "Unnötige Komplexität entfernen.",
        item3: "Die einfachste starke Lösung entwerfen.",
        item4: "Es richtig bauen.",
        item5: "Es stetig verbessern."
      },
      contact: {
        title: "Sie haben etwas<br>vor?",
        sub: "Erzählen Sie uns, was Sie bauen, reparieren oder verbessern möchten."
      },
      form: {
        name: "Name",
        company: "Unternehmen",
        email: "E-Mail",
        budget: "Budget",
        budgetPlaceholder: "Optional",
        type: "Projektart",
        typeOptions: ["Website", "Redesign", "Cybersicherheit", "3D", "KI / Automatisierung", "Design", "Sonstiges"],
        message: "Nachricht",
        submit: "Gespräch beginnen →",
        note: "Antwort innerhalb von 1–2 Werktagen",
        statusPlaceholder: "Nachricht bereit — verbinden Sie das Formular mit Ihrem eigenen Endpoint (Vercel-Funktion / E-Mail) zum Versenden."
      },
      footer: {
        tagline: "Unabhängiges Digitalstudio<br>Tschechien",
        navigate: "Navigation",
        connect: "Kontakt",
        built: "Erstellt von Petr Brož"
      },
      status: { available: "· Verfügbar für Projekte" },
      cs: {
        allWork: "← Alle Arbeiten",
        category: "Kategorie",
        year: "Jahr",
        industry: "Branche",
        challenge: "Die Herausforderung",
        approach: "Der Ansatz",
        result: "Das Ergebnis",
        next: "Nächstes Projekt"
      },
      meta: {
        title: "PEB Media — Unabhängiges Digitalstudio, Tschechien",
        description: "PEB Media ist ein unabhängiges Digitalstudio von Petr Brož in Tschechien — Webentwicklung, Sicherheitstests, 3D-Visualisierung und digitales Design.",
        ogTitle: "PEB Media — Unabhängiges Digitalstudio",
        ogDescription: "Webentwicklung, Sicherheitstests, 3D-Visualisierung und digitales Design. Gegründet von Petr Brož, Tschechien."
      },
      caseMeta: {
        title: "Fallstudie — PEB Media",
        description: "Eine Fallstudie von PEB Media, einem unabhängigen Digitalstudio aus Tschechien."
      }
    }
  };

  function getKey(dict, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
  }

  let currentLang = localStorage.getItem(STORAGE_KEY) || 'cs';
  window.PEB_LANG = currentLang;

  function applyLang(lang) {
    if (!TRANSLATIONS[lang]) lang = 'cs';
    currentLang = lang;
    window.PEB_LANG = lang;
    document.documentElement.lang = lang;
    const dict = TRANSLATIONS[lang];

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const val = getKey(dict, el.getAttribute('data-i18n'));
      if (typeof val === 'string') el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const val = getKey(dict, el.getAttribute('data-i18n-html'));
      if (typeof val === 'string') el.innerHTML = val;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const val = getKey(dict, el.getAttribute('data-i18n-placeholder'));
      if (typeof val === 'string') el.setAttribute('placeholder', val);
    });

    document.querySelectorAll('[data-i18n-options]').forEach((el) => {
      const vals = getKey(dict, el.getAttribute('data-i18n-options'));
      if (Array.isArray(vals)) {
        Array.from(el.options).forEach((opt, i) => { if (vals[i]) opt.textContent = vals[i]; });
      }
    });

    const isCaseStudy = !!document.getElementById('cs-title');
    const metaDict = isCaseStudy ? dict.caseMeta : dict.meta;
    if (metaDict) {
      const titleEl = document.getElementById('page-title');
      if (titleEl && !isCaseStudy) titleEl.textContent = metaDict.title;
      const descEl = document.getElementById('page-description');
      if (descEl) descEl.setAttribute('content', metaDict.description);
      const ogTitle = document.getElementById('og-title');
      if (ogTitle && metaDict.ogTitle) ogTitle.setAttribute('content', metaDict.ogTitle);
      const ogDesc = document.getElementById('og-description');
      if (ogDesc && metaDict.ogDescription) ogDesc.setAttribute('content', metaDict.ogDescription);
      const ogLocale = document.getElementById('og-locale');
      if (ogLocale) ogLocale.setAttribute('content', lang === 'de' ? 'de_DE' : 'cs_CZ');
    }

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });

    document.dispatchEvent(new CustomEvent('peb:langchange', { detail: { lang } }));
  }

  async function detectLangByIP() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('geo lookup failed');
      const data = await res.json();
      const cc = (data.country_code || '').toUpperCase();
      return GERMAN_SPEAKING_COUNTRIES.includes(cc) ? 'de' : 'cs';
    } catch (e) {
      const nav = (navigator.language || 'cs').toLowerCase();
      return nav.startsWith('de') ? 'de' : 'cs';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyLang(currentLang);

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        localStorage.setItem(STORAGE_KEY, lang);
        applyLang(lang);
      });
    });

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      detectLangByIP().then((lang) => {
        if (lang !== currentLang) applyLang(lang);
      });
    }
  });

  window.PEB_I18N = { applyLang, TRANSLATIONS };
})();
