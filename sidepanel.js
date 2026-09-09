import * as pdfjsLib from "./lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "lib/pdf.worker.min.mjs"
);

const MAX_PAGES = 40;
const MAX_CHARS = 60000;
const CHUNK = 40;

const metaEl = document.getElementById("meta");
const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
const runBtn = document.getElementById("run");
const copyBtn = document.getElementById("copy");

let lastText = "";

function setStatus(text, state = "") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function isPdfUrl(url) {
  if (!url) return false;
  if (!/^(https?|file):/i.test(url)) return false;
  try {
    const path = decodeURIComponent(url.split("?")[0].split("#")[0]);
    if (/\.pdf$/i.test(path)) return true;
  } catch (_) {}
  return /\.pdf($|\?|#)/i.test(url);
}

async function extractPdfPages(url) {
  let res;
  try {
    res = await fetch(url, { credentials: "omit", cache: "force-cache" });
  } catch (err) {
    if (/^file:/i.test(url)) {
      throw new Error(
        "Нет доступа к локальным файлам. В chrome://extensions → GE to RU/EN translator включите «Allow access to file URLs»."
      );
    }
    throw new Error(`Не удалось открыть PDF: ${err?.message || err}`);
  }
  if (!res.ok) {
    if (/^file:/i.test(url)) {
      throw new Error(
        "Нет доступа к локальным файлам. В chrome://extensions → GE to RU/EN translator включите «Allow access to file URLs»."
      );
    }
    throw new Error(`Не удалось скачать PDF (HTTP ${res.status})`);
  }
  const data = new Uint8Array(await res.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pages = [];
  let totalChars = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = itemsToText(content.items);
    pages.push({ page: i, text });
    totalChars += text.length;
    if (totalChars >= MAX_CHARS) {
      pages.push({
        page: i + 1,
        text: "",
        note: `…обрезано: лимит ${MAX_CHARS} символов (страницы 1–${i} из ${pdf.numPages})`,
      });
      break;
    }
  }

  if (pdf.numPages > MAX_PAGES && totalChars < MAX_CHARS) {
    pages.push({
      page: MAX_PAGES + 1,
      text: "",
      note: `…обрезано: первые ${MAX_PAGES} из ${pdf.numPages} страниц`,
    });
  }

  return { pages, numPages: pdf.numPages };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getTargetLang() {
  const data = await chrome.storage.local.get("targetLang");
  return data.targetLang === "en" ? "en" : "ru";
}

async function ensurePowerOn() {
  const data = await chrome.storage.local.get("powerOn");
  return data.powerOn === true;
}

/** Merge PDF text items into readable paragraphs */
function itemsToText(items) {
  if (!items?.length) return "";
  let line = "";
  let lastY = null;
  const lines = [];
  for (const item of items) {
    const str = item.str || "";
    if (!str) continue;
    const y = item.transform?.[5];
    if (lastY != null && y != null && Math.abs(y - lastY) > 6) {
      if (line.trim()) lines.push(line.trim());
      line = str;
    } else {
      const gap = item.hasEOL ? "\n" : "";
      if (gap) {
        line += str;
        if (line.trim()) lines.push(line.trim());
        line = "";
      } else {
        line += (line && !/\s$/.test(line) && !/^\s/.test(str) ? " " : "") + str;
      }
    }
    if (y != null) lastY = y;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

function splitForTranslate(text) {
  const parts = text
    .split(/\n{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length && text.trim()) return [text.trim()];
  // merge tiny lines into ~400-char chunks to reduce API calls
  const chunks = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + "\n" + p).length > 450 && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function translateChunks(chunks, targetLang) {
  const out = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += CHUNK) {
    const slice = chunks.slice(i, i + CHUNK);
    setStatus(`Перевод… ${Math.min(i + slice.length, chunks.length)}/${chunks.length}`);
    const res = await chrome.runtime.sendMessage({
      type: "TRANSLATE_BATCH",
      texts: slice,
      targetLang,
      sourceLang: "auto",
    });
    if (!res?.ok) throw new Error(res?.error || "Ошибка перевода");
    res.translated.forEach((t, idx) => {
      out[i + idx] = typeof t === "string" ? t : slice[idx];
    });
  }
  return out;
}

function renderPages(translatedPages) {
  outEl.hidden = false;
  outEl.innerHTML = "";
  const blocks = [];
  for (const p of translatedPages) {
    const wrap = document.createElement("section");
    wrap.className = "page";
    const label = document.createElement("span");
    label.className = "page-label";
    label.textContent = p.note || `Страница ${p.page}`;
    wrap.appendChild(label);
    if (p.text) {
      const body = document.createElement("div");
      body.textContent = p.text;
      wrap.appendChild(body);
      blocks.push(p.text);
    }
    outEl.appendChild(wrap);
  }
  lastText = blocks.join("\n\n");
  copyBtn.disabled = !lastText;
}

async function translateActivePdf() {
  if (!(await ensurePowerOn())) {
    setStatus("Сначала включите расширение в попапе", "err");
    return;
  }
  const tab = await getActiveTab();
  const url = tab?.url || "";
  if (!isPdfUrl(url)) {
    setStatus(
      "Откройте PDF в Chrome (с диска file:// или по ссылке .pdf)",
      "err"
    );
    metaEl.textContent = url || "Нет активной вкладки";
    return;
  }

  metaEl.textContent = url;
  runBtn.disabled = true;
  copyBtn.disabled = true;
  outEl.hidden = true;
  setStatus("Читаю PDF…", "");

  try {
    const targetLang = await getTargetLang();
    const { pages, numPages } = await extractPdfPages(url);
    const hasText = pages.some((p) => p.text && p.text.trim());
    if (!hasText) {
      throw new Error(
        "В PDF нет текстового слоя (возможно скан). OCR пока не поддерживается."
      );
    }

    const translatedPages = [];
    for (const p of pages) {
      if (p.note && !p.text) {
        translatedPages.push(p);
        continue;
      }
      const chunks = splitForTranslate(p.text);
      const translated = await translateChunks(chunks, targetLang);
      translatedPages.push({
        page: p.page,
        text: translated.join("\n"),
      });
    }

    renderPages(translatedPages);
    setStatus(
      `Готово → ${targetLang.toUpperCase()} (страниц в файле: ${numPages})`,
      "ok"
    );
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", () => translateActivePdf());

copyBtn.addEventListener("click", async () => {
  if (!lastText) return;
  try {
    await navigator.clipboard.writeText(lastText);
    setStatus("Скопировано", "ok");
  } catch {
    setStatus("Не удалось скопировать", "err");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.pdfTranslateRequest?.newValue) {
    translateActivePdf();
  }
});

(async () => {
  const tab = await getActiveTab();
  metaEl.textContent = tab?.url || "Нет активной вкладки";
  const data = await chrome.storage.local.get("pdfTranslateRequest");
  if (data.pdfTranslateRequest) {
    await chrome.storage.local.remove("pdfTranslateRequest");
    translateActivePdf();
  } else if (isPdfUrl(tab?.url || "")) {
    setStatus("Можно перевести этот PDF", "ok");
  }
})();
