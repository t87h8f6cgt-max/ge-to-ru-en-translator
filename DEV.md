# Developer notes

Internal notes for building and packaging. End-user docs live in [README.md](README.md).

## Load unpacked

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.  
2. Local PDFs: extension details → **Allow access to file URLs**.

## Package for Chrome Web Store

```bash
bash scripts/package-extension.sh
```

Do **not** ship `glossary-data/`, `.cursor/`, or `CHROMEWEBSTORE.md` in the upload ZIP (the script already excludes them).

## Store listing draft

See [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md) for permission justifications and dashboard copy.

## Source layout

- Packed glossary: `glossary-generated.js` + `glossary.js`  
- Version: `manifest.json`  
- Privacy page (GitHub Pages): `privacy.html` + `index.html`
