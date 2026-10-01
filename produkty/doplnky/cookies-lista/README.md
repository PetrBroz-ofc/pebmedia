# Cookies lišta — návod na vložení

Lišta se souhlasem s cookies s rovnocenně velkým tlačítkem „Odmítnout" vedle „Přijmout" a podrobným nastavením. Nenačítá žádné nepotřebné cookies/skripty dřív, než uživatel udělí souhlas.

## Co je v balíčku

- `index.html` — ukázková stránka s lištou a modálem nastavení (pro náhled)
- `styl.css` — veškeré styly komponenty
- `skript.js` — logika souhlasu a ukládání volby
- `README.md` — tento návod
- `LICENCE.txt` — licenční podmínky použití

## Jak komponentu vložit do vlastního webu

1. Zkopírujte `styl.css` a `skript.js` do svého projektu.
2. Do `<head>` přidejte `<link rel="stylesheet" href="styl.css">` a před `</body>` `<script src="skript.js"></script>`.
3. Zkopírujte HTML lišty a modálu z `index.html` (blok mezi komentáři `<!-- ===== COOKIES LIŠTA — začátek komponenty ===== -->` a `... — konec komponenty -->`) na konec `<body>` své stránky.
4. V textu lišty upravte odkaz na své vlastní zásady cookies (`/zasady-cookies`).

## Napojení vlastních skriptů (analytika, reklama)

V souboru `skript.js` najděte funkci `applyConsent(consent)` — volá se vždy až POTÉ, co uživatel udělí souhlas (nikdy předem). Do ní doplňte načítání svých skriptů podmíněně podle `consent.analytics` / `consent.marketing`, např.:

```js
function applyConsent(consent) {
  if (consent.analytics) {
    var s = document.createElement('script');
    s.src = 'https://www.googletagmanager.com/gtag/js?id=VAS_ID';
    document.head.appendChild(s);
  }
}
```

**Důležité:** žádný analytický ani marketingový skript (Google Analytics, Facebook Pixel apod.) nesmí být na stránce načten dřív, než tuto funkci skript zavolá se souhlasem uživatele.

## Chování

- Volba uživatele se ukládá do `localStorage` pod klíčem `pebCookieConsent` — lišta se příště už nezobrazuje.
- Tlačítka „Přijmout vše" a „Odmítnout" jsou vizuálně stejně výrazná (žádné z nich není skryté nebo méně viditelné).
- Tlačítko „Nastavení" otevře modál s jednotlivými kategoriemi cookies.

## Přizpůsobení vzhledu

Barvy upravíte v bloku `:root` na začátku `styl.css`.
