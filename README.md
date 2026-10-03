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

Administrace (`admin.html`) byla ze stránek dočasně odebrána a tento repozitář s ní v tuto chvíli
nepočítá — proto k ní níže popsaný obchod také nic nepřidává (žádný přehled objednávek apod.),
dokud administrace znovu nevznikne a nebude chráněná přihlášením.

## Obchod (vouchery, doplňky pro web, e-booky)

Malý obchod s digitálním obsahem na `/obchod/`. Funguje na stejné architektuře jako zbytek webu
(žádný framework), platby ale vyžadují běh na Vercelu (viz níže) — **na samotném GitHub Pages
obchod nebude fungovat**, protože tam neběží serverless funkce z `api/`.

```
data/shop.json           katalog produktů — jediný zdroj pravdy pro ceny (ověřuje se vždy na serveru)
api/checkout.js          vytvoří Stripe Checkout Session
api/stripe-webhook.js    zpracuje úspěšnou platbu, vygeneruje kód voucheru / odkaz ke stažení, pošle e-mail
api/download.js          ověří podepsaný odkaz a pošle soubor ke stažení (platnost + limit počtu stažení)
api/free-download.js     vyřídí zdarma e-book (e-mail + volitelný souhlas s newsletterem)
api/_lib/                sdílená logika (tokeny, Stripe, e-maily, privátní úložiště, ochrana API, čtení shop.json)
obchod/                  stránky obchodu (kategorie, detaily produktů, děkujeme/zrušeno, podmínky)
assets/obchod/           statické náhledy doplňků (obrázky — NE zdrojový kód)
scripts/nahraj-produkty.js   pomocný skript pro nahrání .zip balíčků (a e-booku) do Vercel Blob
vercel.json              bezpečnostní hlavičky (CSP, HSTS, ochrana proti vložení do iframe…)
.vercelignore            co se nikdy nenahraje na Vercel (hlavně produkty/)
```

### Zabezpečení obchodu

- **Placené soubory nikdy nejsou v repozitáři ani na webu.** Složka `produkty/` (zdrojáky a ZIPy
  doplňků, e-booky) existuje jen lokálně — je v `.gitignore` i `.vercelignore`. Na web se dávají
  jen obrázkové náhledy v `assets/obchod/`. Repozitář je veřejný, takže cokoli se commitne, je vidět.
- **Privátní úložiště:** produkty, objednávky, e-maily odběratelů i počítadla jsou ve Vercel Blob
  s přístupem `private` — nemají žádnou veřejnou URL.
- **Cena se bere jen ze serveru** (`data/shop.json`) a webhook si stav platby znovu ověří přímo ve
  Stripe API (zaplaceno, CZK, přesná částka). Podvržená nebo nezaplacená objednávka nic nespustí.
- **Webhook je idempotentní:** opakované doručení stejné platby nevygeneruje druhý voucher.
- **Odkazy ke stažení** jsou podepsané (HMAC), časově omezené a s atomicky hlídaným limitem stažení.
- **Ochrana proti zneužití:** kontrola Origin, rate limit na všech endpointech, honeypot u formuláře
  zdarma, limit pokusů o přihlášení do administrace.
- Skrytý produkt (`"skryto": true` v `shop.json`) se na webu nezobrazí a nejde koupit ani stáhnout.

### Co je potřeba nastavit, než obchod půjde reálně použít

1. **Nasadit web na Vercel** (viz sekce výše) — bez toho `/api/*` funkce neběží vůbec.
2. **Založit účet na [Stripe](https://stripe.com)** a zatím zůstat v **testovacím režimu** (přepínač
   vlevo dole v Stripe Dashboardu). V **Developers → API keys** zkopírovat `sk_test_...` klíč do
   proměnné `STRIPE_SECRET_KEY` ve Vercelu.
3. V Stripe **Developers → Webhooks → Add endpoint** nastavit adresu
   `https://VASE-DOMENA/api/stripe-webhook`, naslouchat na události `checkout.session.completed` a `checkout.session.async_payment_succeeded`
   a zkopírovaný „Signing secret“ (`whsec_...`) vložit do `STRIPE_WEBHOOK_SECRET`.
4. Ve Vercelu **Storage → Create Database → Blob** s přístupem **Private** připojit k projektu (token
   `BLOB_READ_WRITE_TOKEN` se nastaví automaticky).
5. Doplnit zbylé proměnné podle `.env.example`: `PUBLIC_BASE_URL` (adresa webu),
   `DOWNLOAD_SIGNING_SECRET` (náhodný text, min. 32 znaků — příkaz na vygenerování je v `.env.example`), `RESEND_API_KEY` +
   `CONTACT_FROM_EMAIL` (odesílání e-mailů s kódy/odkazy ke stažení).
6. Nahrát skutečné soubory ke stažení do Blob úložiště. Pro pět hotových doplňků jsou .zip
   balíčky už připravené v `produkty/_zip-dist/` — stačí lokálně nastavit `BLOB_READ_WRITE_TOKEN`
   (zkopírovat z Vercelu) a spustit `node scripts/nahraj-produkty.js`. Až bude hotový reálný obsah
   volného e-booku „Neplaťte zbytečně“, dejte PDF do `produkty/ebooky/neplatte-zbytecne.pdf`,
   skript spusťte znovu a v `data/shop.json` u e-booku doplňte popis a smažte `"skryto": true`.
7. Nechat zkontrolovat návrh obchodních podmínek (`obchod/podminky/`) právníkem — je označený
   `TODO` komentářem v kódu a není to finální právní text.

### Jak otestovat v testovacím režimu Stripe

1. Na `/obchod/doplnky/` otevřete libovolný produkt, zaškrtněte souhlas se zahájením plnění a
   klikněte na tlačítko koupit — přesměruje na Stripe Checkout.
2. Na platební stránce použijte [testovací kartu Stripe](https://docs.stripe.com/testing)
   `4242 4242 4242 4242`, libovolné budoucí datum expirace a libovolný CVC.
3. Po „zaplacení“ Stripe přesměruje na `/obchod/dekuji/` a zavolá webhook — během pár sekund by
   měl na zadaný e-mail dorazit odkaz ke stažení (resp. kód voucheru u vouchery).
4. Zrušení platby na platební stránce přesměruje na `/obchod/zruseno/` a nic se neúčtuje.
5. U volného e-booku na `/obchod/ebooky/` vyzkoušejte formulář se samotným e-mailem (bez platby).

Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe-webhook`) lze použít i pro
lokální testování webhooku bez nutnosti nasazovat každou změnu na Vercel.
