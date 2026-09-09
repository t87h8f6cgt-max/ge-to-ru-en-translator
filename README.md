# GE to RU/EN translator

Chrome MV3 extension (formerly KA-RU-Transl): Georgian (ka) → English / Russian for pages, iframes, native dialogs, and PDFs (including local `file://` with “Allow access to file URLs”).

## Load unpacked

1. Open `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. For local PDFs: extension details → enable **Allow access to file URLs**.

## Use

- Toggle power on, pick EN or RU, then **Перевести страницу** or **Перевести PDF**.
- **Вернуть оригинал** restores API-replaced DOM text on the page.

## Privacy

Public policy: https://t87h8f6cgt-max.github.io/ge-to-ru-en-translator/privacy.html — also [privacy.html](privacy.html) in-repo. Text is sent to `translate.googleapis.com` when not covered by the packed glossary/cache. No remote script injection.

## Chrome Web Store

- Listing copy, permission justifications, and privacy answers: [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md)
- Agent skill (MV3 / publish guidance): `.agents/skills/chrome-extensions/`
- Package for upload:

```bash
bash scripts/package-extension.sh
```

Before submit: host `privacy.html` publicly, fill publisher/email TODOs in `CHROMEWEBSTORE.md`, add ≥1 store screenshot.

## Dev notes

- `glossary-data/` is harvest source material — gitignored; do **not** ship it in the Store zip.
- Packed glossary lives in `glossary-generated.js` + `glossary.js`.
- Version is in `manifest.json`.
