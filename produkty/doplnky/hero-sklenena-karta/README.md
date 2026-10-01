# Hero sekce se skleněnou kartou — návod na vložení

Úvodní sekce webu s nadpisem, textem a tlačítky na skleněné (glass) kartě nad dekorativním barevným pozadím.

## Co je v balíčku

- `index.html` — ukázková stránka s komponentou (pro náhled)
- `styl.css` — veškeré styly komponenty
- `README.md` — tento návod
- `LICENCE.txt` — licenční podmínky použití

Tato komponenta nepotřebuje žádný JavaScript.

## Jak komponentu vložit do vlastního webu

1. Zkopírujte soubor `styl.css` do svého projektu (nebo jeho obsah vložte do svého existujícího CSS souboru).
2. Do `<head>` své stránky přidejte:
   ```html
   <link rel="stylesheet" href="styl.css">
   ```
3. Zkopírujte HTML značení z `index.html` (blok mezi komentáři `<!-- ===== HERO SE SKLENĚNOU KARTOU — začátek komponenty ===== -->` a `<!-- ===== HERO SE SKLENĚNOU KARTOU — konec komponenty ===== -->`) na místo, kam chcete hero sekci umístit — typicky hned na začátek `<body>`.
4. Upravte nadpis, text a tlačítka (texty a odkazy `href`) podle svého webu.

## Přizpůsobení vzhledu

Hlavní barvy a fonty najdete na začátku souboru `styl.css` v bloku `:root`:

```css
:root {
  --hsk-accent: #0B6E63;       /* barva primárního tlačítka */
  --hsk-accent-dark: #063E38;
  --hsk-card-bg: rgba(255, 255, 255, 0.55); /* průhlednost skleněné karty */
}
```

Dekorativní pozadí (barevné kruhy) upravíte v pravidle `.hsk-bg` — stačí změnit barvy v `radial-gradient`.

## Poznámka k prohlížečům

Sklený efekt využívá CSS vlastnost `backdrop-filter`. Ve velmi starých prohlížečích se karta zobrazí jen s plným pozadím bez rozmazání — čitelnost textu tím není ovlivněna.
