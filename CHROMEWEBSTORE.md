# Chrome Web Store Listing — GE to RU/EN translator

> Last Updated: 2026-09-09  
> Source of truth for Developer Dashboard fields. Do **not** include this file in the Store ZIP.

## Store Listing

**Extension Name** [REQUIRED]

GE to RU/EN translator

**Short Description** [REQUIRED]

<!-- Max 132 characters -->

Translate Georgian pages, dialogs and PDFs to Russian or English — handy for gov sites in Georgia and more.

<!-- RU alternative: Перевод грузинских страниц, окон и PDF на английский или русский — для сайтов госуслуг и любых других. -->

**Detailed Description** [REQUIRED]

GE to RU/EN translator helps Russian- and English-speaking users read Georgian websites when a site has no built-in page translation — or when that translation is incomplete or incorrect. It is tuned for the sites people use most often in Georgia, including everyday government services.

What you can do
• Translate the current page, including text that appears later in popups and forms
• Translate content inside nested frames when the site embeds other services
• Translate native browser confirm/alert messages when they contain Georgian text
• Open a side panel to extract and translate PDF text (online PDFs and local files if you allow file access)

How to use
1. Click the extension icon and turn the power switch on
2. Choose English or Russian
3. Press “Перевести страницу” for the open tab, or “Перевести PDF” for a PDF
4. Press “Вернуть оригинал” to restore the page text when you used on-page translation

Privacy
Translation uses a packed glossary on your device when possible. Otherwise, page or PDF text snippets may be sent to Google’s translate service to obtain a result. Settings and a local translation cache stay on your device. The extension does not sell your data and does not load remote translation scripts into pages.

Need help? Email Aikhienvald@icloud.com or open an issue on the project homepage.

**Category** [REQUIRED]

Productivity

**Single Purpose** [REQUIRED]

Translate Georgian webpage, dialog, iframe, and PDF text into English or Russian.

**Primary Language** [REQUIRED]

Russian

<!-- Store listing UI copy is primarily Russian; English short description available above. -->


## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `store-assets/screenshot-1-1280x800.jpg` |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes

1. ✅ rs.ge cabinet after RU translation (modules grid + sidebar) — `store-assets/screenshot-1-1280x800.jpg` (padded to 1280×800).
2. Side panel with translated PDF (recommended next).
3. Popup EN/RU controls over a Georgian page (optional).

### Icons

Toolbar / store icons redrawn: minimalist Georgian five-cross flag with centered **RU/EN** badge (`icons/icon16.png`, `icon48.png`, `icon128.png`). Source master: `store-assets/icon-source.png`.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Grants temporary access when the user opens the toolbar popup and starts translation or restore on the active tab. |
| `scripting` | permissions | Injects and runs the page content script / CSS and MAIN-world dialog hooks so Georgian text in the DOM (and native confirm/alert/prompt) can be replaced with the chosen language. |
| `storage` | permissions | Saves power on/off, preferred language (EN/RU), per-site enable flags, PDF side-panel handoff, and a local translation cache so repeated phrases translate faster offline. |
| `webNavigation` | permissions | Detects when late-loading frames finish loading so nested Georgian content (common on Georgian e-gov portals) can be translated after the user enabled the site. Also used to enumerate frames when broadcasting translate/restore from the popup. |
| `sidePanel` | permissions | Opens the PDF translation side panel from the popup (“Перевести PDF”) without navigating away from the PDF tab. |
| `http://*/*` | host_permissions | Reads and updates visible text on any HTTP page the user chooses to translate (Georgian sites are not limited to a fixed domain list). |
| `https://*/*` | host_permissions | Same as HTTP for HTTPS pages, including cross-origin iframes that content scripts must run in. |
| `file:///*` | host_permissions | Allows translating PDFs and pages opened from disk when the user enables “Allow access to file URLs” for this extension. |
| `https://translate.googleapis.com/*` | host_permissions | Sends text batches to Google’s public translate HTTP endpoint when the local glossary/cache does not cover a string. No remote script is downloaded or executed. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

<!-- “Website content” text may leave the device for translation. Local settings/cache stay on-device. -->

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | Yes | Yes (when glossary/cache miss) | Translate Georgian page/PDF strings to EN/RU | Yes — Google Translate HTTP API (`translate.googleapis.com`) processes the text; see Google’s privacy policy |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

### Local-only data (not “collection” for third parties)

- Power state, target language, enabled hostnames, translation cache: `chrome.storage.local` on the user’s device.
- Users can clear extension storage via Chrome’s site/extension data controls.


## Privacy Policy

**Privacy Policy URL** [REQUIRED]

https://t87h8f6cgt-max.github.io/ge-to-ru-en-translator/privacy.html

Hosted via GitHub Pages from this repository.


## Distribution

**Visibility**: Public  
**Regions**: All regions  
<!-- Optional later: prioritize Georgia + regions with Russian/English users -->


## Developer Info

**Publisher Name** [REQUIRED]

Aleksandr Anisimov

**Contact Email** [REQUIRED]

Aikhienvald@icloud.com

**Support URL / Email** [RECOMMENDED]

https://github.com/t87h8f6cgt-max/ge-to-ru-en-translator/issues  
Also: Aikhienvald@icloud.com

**Homepage URL** [RECOMMENDED]

https://github.com/t87h8f6cgt-max/ge-to-ru-en-translator


## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.4.1 | 2026-09-09 | Renamed to “GE to RU/EN translator”; store icon + screenshot assets | Draft |
| 2.4.0 | 2026-09-09 | API-only EN/RU (no remote GT widget/eval); dialog hook token hardening; iframe translate throttle; privacy.html + packaging hygiene | Draft |


## Review Notes

### Known Issues / Limitations

- Uses the unofficial/public `translate.googleapis.com` HTTP endpoint (client=gtx). Prefer disclosing this clearly in privacy answers; rate limits or breakage are possible.
- Broad `http(s)://*/*` host access is intentional: users translate arbitrary Georgian pages, not a fixed allowlist. Justify as single-purpose translation.
- Content scripts run in `all_frames` so nested e-gov iframes work; reviewers may ask why — answer: Georgian portals embed cross-origin services (e.g. registry widgets).
- Local `file://` PDF translation requires the user to enable “Allow access to file URLs”.
- Packed glossary (`glossary-generated.js`) is large; do not ship `glossary-data/` harvest dumps in the ZIP.
- Icons: Georgian flag + RU/EN (`icons/icon*.png`); Store screenshot 1 ready in `store-assets/`.
- No remote code execution: translation JS is packaged; only translation *text* is sent to Google’s API.

### Pre-submit checklist (quick)

- [ ] Host privacy policy URL and set it above + in CWS dashboard — done (GitHub Pages)
- [x] Fill publisher name + contact email
- [x] Add ≥1 store screenshot
- [ ] Build ZIP excluding `.git/`, `glossary-data/`, `CHROMEWEBSTORE.md`, `.cursor/`, `.agents/`, `README.md` (optional exclude), `node_modules/`
- [ ] Confirm single purpose matches listing and code
- [ ] Copy permission justifications into CWS permission justification fields

### Rejection History

<!-- | Date | Reason | Fix Applied | Resubmitted | -->
