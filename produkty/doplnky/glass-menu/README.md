# Glass menu — návod na vložení

Sticky navigace se skleněným (glassmorphism) efektem, mobilním hamburger menu a plnou přístupností ovládání klávesnicí.

## Co je v balíčku

- `index.html` — ukázková stránka s komponentou (pro náhled)
- `styl.css` — veškeré styly komponenty
- `skript.js` — logika otevírání/zavírání menu a efekt při scrollu
- `README.md` — tento návod
- `LICENCE.txt` — licenční podmínky použití

## Jak komponentu vložit do vlastního webu

1. Zkopírujte do svého projektu soubory `styl.css` a `skript.js` (nebo jejich obsah vložte do svých existujících souborů).
2. Do `<head>` své stránky přidejte:
   ```html
   <link rel="stylesheet" href="styl.css">
   ```
3. Na konec `<body>` (nebo před uzavírací `</body>`) přidejte:
   ```html
   <script src="skript.js"></script>
   ```
4. Zkopírujte HTML značení menu z `index.html` (celý blok mezi komentáři `<!-- ===== GLASS MENU — začátek komponenty ===== -->` a `<!-- ===== GLASS MENU — konec komponenty ===== -->`) na místo, kam chcete hlavičku umístit — typicky úplně nahoru do `<body>`.
5. Upravte položky menu (texty a odkazy `href`) a logo podle svého webu.

## Přizpůsobení vzhledu

Barvy, zaoblení a font najdete na začátku souboru `styl.css` v bloku `:root` — stačí upravit proměnné, např.:

```css
:root {
  --gm-accent: #0B6E63;   /* hlavní barva */
  --gm-accent-ink: #063E38;
  --gm-radius: 14px;      /* zaoblení lišty */
}
```

## Přístupnost

- Hamburger tlačítko má `aria-expanded` a `aria-label`, které se mění podle stavu.
- Menu lze zavřít klávesou `Escape`.
- Odkazy i tlačítko mají viditelný stav při navigaci klávesnicí (focus).

## Poznámka k prohlížečům

Sklený efekt využívá CSS vlastnost `backdrop-filter`. Ve velmi starých prohlížečích se menu zobrazí jen s plným barevným pozadím bez rozmazání — funkčnost tím není nijak omezena.
