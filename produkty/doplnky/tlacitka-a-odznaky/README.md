# Tlačítka a odznaky — návod na vložení

Sada stylovaných tlačítek (primární, sekundární, obrysové, ghost, nebezpečná akce) a odznaků (badges) v několika variantách a velikostech.

## Co je v balíčku

- `index.html` — ukázková stránka se všemi variantami (pro náhled)
- `styl.css` — veškeré styly komponenty
- `README.md` — tento návod
- `LICENCE.txt` — licenční podmínky použití

Tato komponenta nepotřebuje žádný JavaScript — jde čistě o CSS třídy.

## Jak komponentu vložit do vlastního webu

1. Zkopírujte soubor `styl.css` do svého projektu (nebo jeho obsah vložte do svého existujícího CSS souboru).
2. Do `<head>` své stránky přidejte:
   ```html
   <link rel="stylesheet" href="styl.css">
   ```
3. Použijte libovolné z připravených tříd, např.:
   ```html
   <button class="ta-btn ta-btn-primary">Odeslat</button>
   <span class="ta-badge ta-badge-success">Aktivní</span>
   ```

## Přehled tříd

**Tlačítka** (základ `ta-btn` + jedna varianta):
`ta-btn-primary`, `ta-btn-secondary`, `ta-btn-outline`, `ta-btn-ghost`, `ta-btn-danger`.
Velikosti: přidejte navíc `ta-btn-sm` (malé) nebo `ta-btn-lg` (velké).

**Odznaky** (základ `ta-badge` + jedna varianta):
`ta-badge-neutral`, `ta-badge-success`, `ta-badge-warning`, `ta-badge-danger`, `ta-badge-accent`, `ta-badge-outline`.

## Přizpůsobení vzhledu

Barvy najdete na začátku souboru `styl.css` v bloku `:root` — stačí upravit proměnné podle barevné palety vašeho webu:

```css
:root {
  --ta-accent: #0B6E63;
  --ta-accent-dark: #063E38;
}
```
