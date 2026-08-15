# PEBMedia — firemní web

Statický web (`index.html`) + administrace (`admin.html`) + tři Vercel serverless funkce v `api/`.
Žádný framework, žádný build krok — stejná architektura jako u ostatních projektů (Tesařství Šuta apod.):

```
index.html      veřejný web
admin.html      administrace obsahu
css/            styly webu a administrace
js/             logika webu a administrace
data/           content.json — veškerý textový a strukturovaný obsah webu
api/            Vercel serverless funkce (auth, content, contact)
assets/         obrázky (zatím placeholdery portfolia — nahraďte reálnými screenshoty)
```

## Jak to funguje

- Veřejný web (`index.html`) při načtení stáhne `data/content.json` a z něj vykreslí celý obsah.
- V administraci (`admin.html`) obsah upravujete přes formuláře — nic se neprogramuje.
- Uložení v administraci pošle nový obsah na `api/content.js`, který ho commitne do GitHub repozitáře.
  Vercel je napojený na GitHub, takže po commitu web automaticky znovu nasadí aktuální verzi (řádově do minuty).

## Lokální náhled

Kvůli `fetch()` je potřeba web pouštět přes lokální server, ne dvojklikem na soubor:

```
npx serve .
```

Administrace bez nasazených proměnných prostředí půjde zobrazit, ale **přihlášení a ukládání
nebudou fungovat** — to vyžaduje nasazení na Vercel (viz níže).

## Nasazení na Vercel (doporučený postup)

1. Nahrajte tuto složku jako nový repozitář na GitHub.
2. V [vercel.com](https://vercel.com) → **Add New Project** → vyberte repozitář → **Deploy**
   (Vercel sám pozná statický web + `api/` funkce, není potřeba nic nastavovat).
3. V nastavení projektu **Settings → Environment Variables** vyplňte proměnné podle `.env.example`:
   - `ADMIN_PASSWORD` — heslo, kterým se budete přihlašovat do `/admin.html`
   - `ADMIN_TOKEN_SECRET` — libovolný náhodný dlouhý text
   - `GITHUB_TOKEN` — [GitHub personal access token](https://github.com/settings/tokens) s právem zápisu do repozitáře (Contents: Read & write)
   - `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` — údaje o vašem repozitáři
   - `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` — pro odesílání poptávek e-mailem přes [resend.com](https://resend.com) (zdarma do 3000 e-mailů měsíčně)
4. Po uložení proměnných v sekci **Deployments** znovu nasaďte projekt (Redeploy), aby se proměnné načetly.
5. Otevřete `vas-web.vercel.app/admin.html` a přihlaste se heslem z `ADMIN_PASSWORD`.

## Vlastní doména

Ve Vercelu: **Settings → Domains** → přidejte doménu a nasměrujte DNS podle instrukcí (stejný postup jako u předchozích projektů přes WEDOS/jiného registrátora).

## Portfolio obrázky

V `assets/` jsou zatím jednoduché placeholder SVG. V administraci → **Portfolio** stačí u projektu
změnit pole „URL obrázku“ na cestu k reálnému screenshotu (nahrajte obrázky do `assets/` v repozitáři,
nebo použijte externí URL, např. z Vercel Blob Storage či jiného úložiště).

## Bezpečnostní poznámka

`admin.html` není nijak skrytý z URL (`/admin.html` je veřejně dostupný), ale bez znalosti hesla
z `ADMIN_PASSWORD` se do administrace nikdo nedostane a bez `ADMIN_TOKEN_SECRET` nelze nic uložit.
Pro vyšší úroveň zabezpečení lze doplnit Vercel Password Protection nebo omezení podle IP.
