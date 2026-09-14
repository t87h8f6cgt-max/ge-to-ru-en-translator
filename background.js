/**
 * Background: packed Google translate API (no remote script eval).
 */

importScripts("glossary-generated.js", "glossary.js");

const GEORGIAN_RE = /[\u10A0-\u10FF\u1C90-\u1CBF]/;
const MAX_PACK_CHARS = 6000;
const MAX_PACK_ITEMS = 40;
const CACHE_KEY = "kaRuCache_v12";
const MAX_CACHE = 8000;

/** @type {Map<string, string>} */
const cache = new Map();
let cacheLoaded = false;
let cacheDirty = false;
let cacheFlushTimer = null;
let packConcurrency = 4;
let rateLimitedUntil = 0;
/** @type {Map<string, number>} */
const iframeTranslateAt = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheKey(text, target) {
  return `${target}::${text}`;
}

async function ensureCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    const saved = data?.[CACHE_KEY];
    if (saved && typeof saved === "object") {
      for (const [k, v] of Object.entries(saved)) {
        if (typeof k === "string" && typeof v === "string" && !stillGeorgian(v)) {
          cache.set(k, v);
        }
      }
    }
  } catch (_) {}
}

function scheduleCacheFlush() {
  cacheDirty = true;
  clearTimeout(cacheFlushTimer);
  cacheFlushTimer = setTimeout(flushCache, 2000);
}

async function flushCache() {
  if (!cacheDirty) return;
  cacheDirty = false;
  const obj = {};
  let i = 0;
  for (const [k, v] of cache) {
    if (stillGeorgian(v)) continue;
    obj[k] = v;
    if (++i >= MAX_CACHE) break;
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: obj });
  } catch (_) {}
}

function cacheSet(text, target, translated) {
  if (!translated || stillGeorgian(translated)) return;
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(cacheKey(text, target), translated);
  scheduleCacheFlush();
}

function normalizeBatchItem(item) {
  if (typeof item === "string") return item;
  if (Array.isArray(item)) {
    if (typeof item[0] === "string") return item[0];
    if (Array.isArray(item[0]) && typeof item[0][0] === "string") return item[0][0];
  }
  return null;
}

function parseBatchResponse(data, count) {
  if (!Array.isArray(data) || !data.length) return null;
  // ["a","b"] or [["a"],["b"]] or [[["a","src"],...], ...]
  if (data.length === count || (data.length && typeof data[0] === "string")) {
    const out = data.map(normalizeBatchItem);
    if (out.length === count && out.every((x) => typeof x === "string")) return out;
  }
  // classic translate_a/single shape for one string
  if (Array.isArray(data[0]) && count === 1) {
    const joined = data[0].map((part) => part?.[0] ?? "").join("");
    return [joined];
  }
  return null;
}

async function translateGoogleBatch(texts, sl, tl) {
  if (!texts.length) return [];
  const now = Date.now();
  if (now < rateLimitedUntil) await sleep(rateLimitedUntil - now);

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const body = new URLSearchParams();
      for (const text of texts) body.append("q", text);
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body,
        }
      );
      if (res.status === 429 || res.status === 503) {
        packConcurrency = 1;
        const wait = 1200 * (attempt + 1);
        rateLimitedUntil = Date.now() + wait;
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
      const data = await res.json();
      const parsed = parseBatchResponse(data, texts.length);
      if (!parsed) throw new Error("bad batch response");
      if (packConcurrency < 4) packConcurrency = 4;
      return parsed;
    } catch (err) {
      lastErr = err;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastErr || new Error("translate failed");
}

function buildPacks(texts) {
  const packs = [];
  let current = [];
  let size = 0;
  for (const text of texts) {
    const cost = text.length + 8;
    if (current.length >= MAX_PACK_ITEMS || (current.length && size + cost > MAX_PACK_CHARS)) {
      packs.push(current);
      current = [];
      size = 0;
    }
    if (cost > MAX_PACK_CHARS && !current.length) {
      packs.push([text]);
      continue;
    }
    current.push(text);
    size += cost;
  }
  if (current.length) packs.push(current);
  return packs;
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  const lim = Math.max(1, Math.min(Math.floor(limit), items.length || 1));
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: lim }, run));
  return results;
}

async function translatePackTo(texts, sl, tl) {
  if (!texts.length) return [];
  try {
    return await translateGoogleBatch(texts, sl, tl);
  } catch (_) {}

  if (texts.length === 1) return [texts[0]];

  const mid = Math.ceil(texts.length / 2);
  const [a, b] = await Promise.all([
    translatePackTo(texts.slice(0, mid), sl, tl),
    translatePackTo(texts.slice(mid), sl, tl),
  ]);
  return a.concat(b);
}

async function translateAll(texts, sl, tl) {
  const packs = buildPacks(texts);
  const out = new Array(texts.length);
  await mapPool(packs, packConcurrency, async (pack, packIdx) => {
    let offset = 0;
    for (let i = 0; i < packIdx; i++) offset += packs[i].length;
    const translated = await translatePackTo(pack, sl, tl);
    translated.forEach((t, i) => {
      out[offset + i] = t;
    });
  });
  return out;
}

function looksAlreadyTarget(text, target) {
  if (!text) return true;
  if (stillGeorgian(text)) return false;
  if (target === "ru") {
    const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = (text.match(/[A-Za-z]/g) || []).length;
    return cyr > 0 && cyr >= lat;
  }
  if (target === "en") {
    const lat = (text.match(/[A-Za-z]/g) || []).length;
    const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
    return lat > 0 && lat >= cyr && !stillGeorgian(text);
  }
  return false;
}

/** Protect IBANs, IDs, dates, phones, emails, URLs, long digit codes from API mangling */
const PROTECT_RE =
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b|\b\d{4}[./\-]\d{1,2}[./\-]\d{1,2}\b|\b\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\b|\b(?:\+?\d[\d\s\-()]{6,}\d)\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|https?:\/\/[^\s<>"']+|\b[A-Z]{1,6}[-/]?\d{3,}\b|\b\d{6,}\b|\b\d+[.,]\d{2,}\b|№\s*\d+/gi;

function protectSensitive(text) {
  const tokens = [];
  const protectedText = String(text).replace(PROTECT_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `\uE000${i}\uE001`;
  });
  return { protectedText, tokens };
}

function restoreSensitive(text, tokens) {
  return String(text).replace(/\uE000(\d+)\uE001/g, (_, n) => tokens[Number(n)] ?? "");
}

function isCodeHeavyNoGeorgianWords(text) {
  const stripped = String(text)
    .replace(PROTECT_RE, " ")
    .replace(/[\s\d.,\-_/\\#:№()[+%\]]+/g, "");
  return !GEORGIAN_RE.test(stripped);
}

async function translateBatch(texts, target, opts = {}) {
  await ensureCache();
  const sourceLang = opts.sourceLang === "auto" ? "auto" : "ka";
  const result = new Array(texts.length);
  const pending = [];

  texts.forEach((text, index) => {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      result[index] = text;
      return;
    }
    if (sourceLang === "ka") {
      if (!GEORGIAN_RE.test(trimmed) || isCodeHeavyNoGeorgianWords(trimmed)) {
        result[index] = applyPostFixes(text, target);
        return;
      }
    } else if (looksAlreadyTarget(trimmed, target) || !/[A-Za-zА-Яа-яЁё\u10A0-\u10FF]/.test(trimmed)) {
      result[index] = applyPostFixes(text, target);
      return;
    }

    if (sourceLang === "ka" || stillGeorgian(trimmed)) {
      const exact = applyGlossary(trimmed, target);
      if (exact !== trimmed && !stillGeorgian(exact)) {
        const final = applyPostFixes(exact, target);
        cacheSet(trimmed, target, final);
        result[index] = text.replace(trimmed, final);
        return;
      }
    }
    const hit = cache.get(cacheKey(trimmed, target));
    if (hit && !stillGeorgian(hit)) {
      result[index] = text.replace(trimmed, applyPostFixes(hit, target));
      return;
    }
    pending.push({ index, original: trimmed, raw: text });
  });

  if (!pending.length) return result;

  const unique = [];
  const uniqueIndex = new Map();
  for (const item of pending) {
    if (!uniqueIndex.has(item.original)) {
      uniqueIndex.set(item.original, unique.length);
      unique.push(item.original);
    }
  }

  const protectedPack = unique.map((t) => protectSensitive(t));
  const sl = sourceLang === "auto" ? "auto" : "ka";
  const stage = await translateAll(
    protectedPack.map((p) => p.protectedText),
    sl,
    target
  );
  stage.forEach((t, i) => {
    const restored = restoreSensitive(t || protectedPack[i].protectedText, protectedPack[i].tokens);
    if (restored && !stillGeorgian(restored)) cacheSet(unique[i], target, restored);
  });

  const translatedUnique = stage.map((t, i) => {
    let out = restoreSensitive(t || protectedPack[i].protectedText, protectedPack[i].tokens);
    if (stillGeorgian(out)) out = applyGlossary(out, target);
    return applyPostFixes(out, target);
  });

  for (const item of pending) {
    const u = uniqueIndex.get(item.original);
    let final = translatedUnique[u] || item.original;
    if (stillGeorgian(final)) final = applyPostFixes(applyGlossary(final, target), target);
    cacheSet(item.original, target, final);
    result[item.index] =
      final === item.original ? item.raw : item.raw.replace(item.original, final);
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_SETTINGS") {
    chrome.storage.local
      .get(["powerOn", "targetLang", "enabledHosts"])
      .then((data) => {
        sendResponse({
          ok: true,
          powerOn: data.powerOn === true,
          targetLang: data.targetLang === "en" ? "en" : "ru",
          siteEnabled: Boolean(data.enabledHosts?.[message.host]),
        });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "SET_SITE_ENABLED") {
    chrome.storage.local
      .get("enabledHosts")
      .then(async (data) => {
        const enabledHosts = { ...(data.enabledHosts || {}) };
        if (message.enabled) enabledHosts[message.host] = true;
        else delete enabledHosts[message.host];
        await chrome.storage.local.set({ enabledHosts });
        sendResponse({ ok: true });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "INJECT_DIALOG_HOOKS") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "no tab" });
      return;
    }
    (async () => {
      await ensureCache();
      const target =
        message.targetLang === "en" || message.targetLang === "ru"
          ? message.targetLang
          : "ru";
      const token =
        typeof message.token === "string" && message.token.length >= 8
          ? message.token
          : "";
      const exact = {};
      const phrases = [];
      for (const e of GLOSSARY_ENTRIES) {
        const to = target === "en" ? e.en : e.ru;
        if (!e?.ka || !to || stillGeorgian(to)) continue;
        exact[e.ka] = to;
        phrases.push({ ka: e.ka, to });
      }
      for (const [k, v] of cache) {
        if (!k.startsWith(`${target}::`)) continue;
        const src = k.slice(target.length + 2);
        if (src && v && !stillGeorgian(v)) exact[src] = applyPostFixes(v, target);
      }
      if (message.extra && typeof message.extra === "object") {
        for (const [k, v] of Object.entries(message.extra)) {
          if (typeof k === "string" && typeof v === "string" && !stillGeorgian(v)) {
            exact[k] = v;
          }
        }
      }
      phrases.sort((a, b) => b.ka.length - a.ka.length);

      await chrome.scripting.executeScript({
        target: {
          tabId,
          frameIds: [typeof sender.frameId === "number" ? sender.frameId : 0],
        },
        world: "MAIN",
        func: (exactMap, phraseList, lang, authToken) => {
          const GE = /[\u10A0-\u10FF\u1C90-\u1CBF]/;
          window.__karuDialogExact = Object.assign(
            window.__karuDialogExact || {},
            exactMap || {}
          );
          window.__karuDialogPhrases = Array.isArray(phraseList)
            ? phraseList
            : window.__karuDialogPhrases || [];
          window.__karuDialogLang = lang;
          if (authToken) window.__karuDialogToken = authToken;

          function translateNativeMessage(msg) {
            if (msg == null) return msg;
            const s = String(msg);
            if (!GE.test(s)) return s;
            const hit = window.__karuDialogExact[s];
            if (hit) return hit;
            let out = s;
            const list = window.__karuDialogPhrases || [];
            for (let i = 0; i < list.length; i++) {
              const ka = list[i]?.ka;
              const to = list[i]?.to;
              if (!ka || !to || !out.includes(ka)) continue;
              out = out.split(ka).join(to);
            }
            if (out !== s && !GE.test(out)) {
              window.__karuDialogExact[s] = out;
              return out;
            }
            try {
              window.postMessage(
                {
                  source: "karu-transl",
                  type: "native-dialog",
                  text: s,
                  lang,
                  token: window.__karuDialogToken || "",
                },
                "*"
              );
            } catch (_) {}
            return out !== s ? out : s;
          }

          if (!window.__karuDialogHooksInstalled) {
            window.__karuDialogHooksInstalled = true;
            const rawConfirm = window.confirm.bind(window);
            const rawAlert = window.alert.bind(window);
            const rawPrompt = window.prompt.bind(window);
            window.confirm = function (message) {
              return rawConfirm(translateNativeMessage(message));
            };
            window.alert = function (message) {
              return rawAlert(translateNativeMessage(message));
            };
            window.prompt = function (message, def) {
              return rawPrompt(translateNativeMessage(message), def);
            };
          }
          return { ok: true };
        },
        args: [exact, phrases.slice(0, 2500), target, token],
      });
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message?.type === "TRANSLATE_BATCH") {
    (async () => {
      const { powerOn } = await chrome.storage.local.get("powerOn");
      if (powerOn !== true) {
        sendResponse({ ok: false, error: "Расширение выключено" });
        return;
      }
      const target =
        message.targetLang === "en" || message.targetLang === "ru"
          ? message.targetLang
          : "ru";
      const translated = await translateBatch(
        Array.isArray(message.texts) ? message.texts : [],
        target,
        { sourceLang: message.sourceLang === "auto" ? "auto" : "ka" }
      );
      sendResponse({ ok: true, translated, targetLang: target });
    })().catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
});

ensureCache();

try {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
} catch (_) {}

function ensureContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "translate-selection",
        title: "Перевести выделение (GE→RU/EN)",
        contexts: ["selection"],
      });
    });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenus();
});
ensureContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "translate-selection" || !tab?.id) return;
  (async () => {
    const text = (info.selectionText || "").trim();
    if (!text || !GEORGIAN_RE.test(text)) return;
    const data = await chrome.storage.local.get(["powerOn", "targetLang"]);
    if (data.powerOn !== true) return;
    const targetLang = data.targetLang === "en" ? "en" : "ru";
    const translated = await translateBatch([text], targetLang);
    const next = translated[0] || text;
    const frameIds =
      typeof info.frameId === "number" ? [info.frameId] : undefined;
    await chrome.scripting.executeScript({
      target: frameIds ? { tabId: tab.id, frameIds } : { tabId: tab.id },
      func: (replacement) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(replacement));
        sel.removeAllRanges();
        return true;
      },
      args: [next],
    });
  })().catch(() => {});
});

/** Late-loading iframes — throttled to avoid request storms */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  try {
    if (!details?.tabId || details.frameId === 0) return;
    const url = details.url || "";
    if (!/^https?:/i.test(url)) return;
    if (/google\.com\/recaptcha|accounts\.google|chrome-error|doubleclick|googlesyndication/i.test(url)) {
      return;
    }

    const key = `${details.tabId}:${details.frameId}:${url.split("#")[0]}`;
    const now = Date.now();
    const prev = iframeTranslateAt.get(key) || 0;
    if (now - prev < 4000) return;
    iframeTranslateAt.set(key, now);
    if (iframeTranslateAt.size > 500) {
      for (const [k, t] of iframeTranslateAt) {
        if (now - t > 60000) iframeTranslateAt.delete(k);
      }
    }

    const data = await chrome.storage.local.get(["powerOn", "enabledHosts", "targetLang"]);
    if (data.powerOn !== true) return;

    const frames = await chrome.webNavigation.getAllFrames({ tabId: details.tabId });
    const top = frames?.find((f) => f.frameId === 0);
    let topHost = "";
    let thisHost = "";
    try {
      topHost = new URL(top?.url || "").hostname;
    } catch (_) {}
    try {
      thisHost = new URL(url).hostname;
    } catch (_) {}

    const enabled = data.enabledHosts || {};
    if (!enabled[topHost] && !enabled[thisHost]) return;

    const targetLang = data.targetLang === "en" ? "en" : "ru";
    setTimeout(() => {
      chrome.tabs
        .sendMessage(
          details.tabId,
          { type: "TRANSLATE_PAGE", targetLang },
          { frameId: details.frameId }
        )
        .catch(() => {});
    }, 700);
  } catch (_) {}
});
