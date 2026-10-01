# Kontaktní formulář — návod na vložení

Responzivní kontaktní formulář (jméno, e-mail, zpráva) s validací na straně prohlížeče. Formulář sám o sobě nic neodesílá na server — níže jsou dvě jednoduché možnosti, jak ho během pár minut napojit.

## Co je v balíčku

- `index.html` — ukázková stránka s formulářem (pro náhled)
- `styl.css` — veškeré styly komponenty
- `skript.js` — validace a odeslání dat
- `README.md` — tento návod
- `LICENCE.txt` — licenční podmínky použití

## Jak komponentu vložit do vlastního webu

1. Zkopírujte `styl.css` a `skript.js` do svého projektu.
2. Do `<head>` přidejte `<link rel="stylesheet" href="styl.css">` a před `</body>` `<script src="skript.js"></script>`.
3. Zkopírujte HTML formuláře z `index.html` (blok mezi komentáři `<!-- ===== KONTAKTNÍ FORMULÁŘ — začátek komponenty ===== -->` a `... — konec komponenty -->`) na své stránce.

## Napojení na odeslání — možnost A: Formspree (nejjednodušší, bez kódování)

1. Založte si zdarma účet na [formspree.io](https://formspree.io) a vytvořte nový formulář.
2. Formspree vám přidělí adresu ve tvaru `https://formspree.io/f/VASE_ID`.
3. V souboru `skript.js` najděte řádek:
   ```js
   var ENDPOINT_URL = '';
   ```
   a vyplňte do něj svou adresu z Formspree.
4. Hotovo — odeslané zprávy uvidíte v rozhraní Formspree a volitelně i ve svém e-mailu.

## Napojení na odeslání — možnost B: vlastní endpoint

Pokud máte vlastní backend nebo serverless funkci (např. na Vercelu), nastavte `ENDPOINT_URL` na její adresu, např. `/api/kontakt`. Endpoint musí přijímat `POST` požadavek s JSON tělem `{ jmeno, email, zprava }` a vracet HTTP stavus 200 při úspěchu.

## Přístupnost

- Všechna pole mají vlastní `<label>`.
- Chybové hlášky se zobrazují přímo u pole a stav odeslání (`kf-status`) je čtečkám obrazovky oznámen pomocí `aria-live="polite"`.

## Přizpůsobení vzhledu

Barvy upravíte v bloku `:root` na začátku `styl.css`.
