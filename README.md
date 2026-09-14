# GE to RU/EN translator

Chrome extension that translates **Georgian** websites and PDFs into **Russian** or **English** — useful for government portals and everyday pages in Georgia (rs.ge, my.gov.ge, and others).

## Why it exists / Зачем это нужно

Made for Russian- and English-speaking people who need to use Georgian sites that have no built-in page translation — or where the built-in one is wrong or incomplete. The translator is tuned for the sites people open most often (especially e-gov and everyday services).

Расширение создано для русскоязычных и англоязычных пользователей — в основном чтобы удобнее пользоваться сайтами без нормального встроенного перевода страниц (или когда он работает плохо). Переводчик заточен под самые часто используемые сайты.

This is my first Chrome extension. Feedback is welcome — please be kind if something is rough around the edges.

## What it does

- Translates the current page, including text that appears later in popups and forms  
- Works inside nested frames when a site embeds other services  
- Translates native browser confirm/alert dialogs when they contain Georgian text  
- Opens a side panel to extract and translate PDF text (online or from your computer)

## How to use

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/) (search “GE to RU/EN translator”).  
2. Click the icon → turn power **on** → pick **English** or **Русский**.  
3. Press **Перевести страницу**, or enable **Всегда переводить этот сайт** so next visits auto-translate.  
4. Optional: **Подсветить оставшийся грузинский**, right-click **Перевести выделение**, or **Сообщить о плохом переводе**.  
5. **Вернуть оригинал** restores on-page text.

### FAQ

**Local PDF from disk**  
`chrome://extensions` → this extension → enable **Allow access to file URLs**, reopen the PDF, then **Перевести PDF**.

**Part of the page still Georgian (iframes)**  
Gov sites often embed other domains. Wait a moment or press **Перевести страницу** again. Use highlight mode to see leftovers.

**Selection only**  
Select text → right-click → **Перевести выделение (GE→RU/EN)**.

### Local PDF files

If the PDF is opened from disk (`file://…`), open `chrome://extensions`, find **GE to RU/EN translator**, and enable **Allow access to file URLs**.

## Privacy

Some page or PDF text may be sent to Google’s translate service when it is not covered by the built-in glossary. Settings stay on your device.

Full policy: [Privacy Policy](https://t87h8f6cgt-max.github.io/ge-to-ru-en-translator/privacy.html)

## Support

- Support page: https://t87h8f6cgt-max.github.io/ge-to-ru-en-translator/support.html  
- Email: [Aikhienvald@icloud.com](mailto:Aikhienvald@icloud.com)  
- Issues: [GitHub Issues](https://github.com/t87h8f6cgt-max/ge-to-ru-en-translator/issues)

Publisher: **Aleksandr Anisimov**
