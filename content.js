(() => {
  if (window.__kaRuTransl) return;
  window.__kaRuTransl = true;

  const GEORGIAN_RE = /[\u10A0-\u10FF\u1C90-\u1CBF]/;
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "MATH",
  ]);
  const ATTR_NAMES = [
    "placeholder",
    "title",
    "aria-label",
    "alt",
    "data-confirm",
    "data-title",
    "data-content",
    "data-message",
    "data-original-title",
    "data-bs-original-title",
    "data-tooltip",
    "data-full-text",
  ];

  /** @type {Map<Text, string>} */
  const originals = new Map();
  /** @type {Map<Element, Record<string, string>>} */
  const attrOriginals = new Map();

  let powerOn = false;
  let siteEnabled = false;
  let targetLang = "ru";
  let busy = false;
  let apiPassBusy = false;
  let apiPassQueued = false;
  let mode = "none"; // api | none
  let observer = null;
  let reapplyTimer = null;
  let highlightGeorgian = false;
  const DIALOG_TOKEN =
    (crypto.randomUUID && crypto.randomUUID()) ||
    `karu-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function hostKey() {
    return location.hostname;
  }

  function setStatus(text, state = "busy") {
    let el = document.getElementById("karu-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "karu-status";
      document.documentElement.appendChild(el);
    }
    el.dataset.state = state;
    el.textContent = text;
    el.hidden = false;
    if (state !== "busy") {
      clearTimeout(setStatus._t);
      setStatus._t = setTimeout(() => {
        el.hidden = true;
      }, 2500);
    }
  }

  /** Phrase cleanup after API/glossary translation */
  function fixTranslatedPage() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.parentElement) continue;
      if (node.parentElement.closest?.("script,style,noscript,#karu-status")) continue;
      const next = fixPhrases(node.nodeValue, targetLang);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  function fixPhrases(text, lang) {
    if (lang === "en") {
      return text
        .replace(/indian\s+entrepreneurs?/gi, "individual entrepreneur")
        .replace(/Ind\.?\s*entrepreneur/gi, "sole proprietor");
    }
    let out = text;
    out = out.replace(/индийск(?=[а-яё]*\s+предпринимател)/gi, "индивидуальн");
    out = out.replace(
      /индийск(?:ий|ого|ому|им|ом|ие|их|ими)\s+предпринимател[а-яё]*/gi,
      (m) => m.replace(/индийск/i, "индивидуальн")
    );
    out = out.replace(/частн(?:ый|ое|ая|ого|ому|ым|ом)\s+имуществ[а-яё]*/gi, "личное имущество");
    return out;
  }

  function isSkippable(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function collectTextNodes(root = document.documentElement) {
    if (!root) return [];
    const nodes = [];
    function consider(node) {
      if (!node?.nodeValue?.trim()) return;
      if (originals.has(node) && !GEORGIAN_RE.test(node.nodeValue)) return;
      const parent = node.parentElement;
      // Text inside <template> has parentElement null — still translate for later clones
      if (parent) {
        if (isSkippable(parent)) return;
        if (parent.closest?.("script,style,noscript,code,pre,textarea,#karu-status")) return;
      }
      if (!GEORGIAN_RE.test(node.nodeValue)) return;
      nodes.push(node);
    }
    function walk(node) {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        consider(node);
        return;
      }
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        for (const child of node.childNodes) walk(child);
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (SKIP_TAGS.has(node.tagName)) return;
        if (node.id === "karu-status") return;
        if (node.tagName === "TEMPLATE" && node.content) walk(node.content);
        if (node.shadowRoot) walk(node.shadowRoot);
      }
      if (node.childNodes) {
        for (const child of node.childNodes) walk(child);
      }
    }
    walk(root);
    return nodes;
  }

  function collectAttrs(root = document.documentElement) {
    if (!root) return [];
    const items = [];
    const visit = (el) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.id === "karu-status") return;
      for (const attr of ATTR_NAMES) {
        const value = el.getAttribute?.(attr);
        if (value && GEORGIAN_RE.test(value)) items.push({ el, attr, value });
      }
      if (el.tagName === "INPUT" || el.tagName === "BUTTON") {
        const type = (el.getAttribute("type") || (el.tagName === "BUTTON" ? "button" : "text")).toLowerCase();
        if (
          (el.tagName === "BUTTON" || ["button", "submit", "reset"].includes(type)) &&
          el.value &&
          GEORGIAN_RE.test(el.value)
        ) {
          items.push({ el, attr: "value", value: el.value });
        }
      }
      if (el.tagName === "TEMPLATE" && el.content) {
        el.content.querySelectorAll("*").forEach(visit);
      }
      if (el.shadowRoot) el.shadowRoot.querySelectorAll("*").forEach(visit);
    };
    if (root.nodeType === Node.ELEMENT_NODE) visit(root);
    root.querySelectorAll?.("*")?.forEach(visit);
    return items;
  }

  async function translateViaApi(opts = {}) {
    const quiet = opts.quiet === true;
    if (apiPassBusy) {
      apiPassQueued = true;
      return { translated: 0, total: 0, queued: true };
    }
    apiPassBusy = true;
    try {
      if (!quiet) {
        setStatus(
          targetLang === "ru" ? "Перевожу на русский…" : "Перевожу на English…",
          "busy"
        );
      }
      mode = "api";
      const nodes = collectTextNodes();
      const attrs = collectAttrs();
      const total = nodes.length + attrs.length;
      if (!total) {
        if (!quiet) setStatus("Грузинский текст не найден", "idle");
        refreshGeorgianHighlight();
        return { translated: 0, total: 0 };
      }

      let done = 0;
      const texts = nodes.map((n) => n.nodeValue).concat(attrs.map((a) => a.value));
      if (!quiet) setStatus(`API перевод… 0/${total}`, "busy");
      const res = await chrome.runtime.sendMessage({
        type: "TRANSLATE_BATCH",
        texts,
        targetLang,
      });
      if (!res?.ok) throw new Error(res?.error || "API error");

      res.translated.forEach((next, idx) => {
        if (typeof next !== "string") return;
        if (idx < nodes.length) {
          const node = nodes[idx];
          // Template text nodes are not "connected" until cloned — still update them.
          const inTemplate = !node.isConnected && node.getRootNode?.() instanceof DocumentFragment;
          if ((!node?.isConnected && !inTemplate) || next === node.nodeValue) return;
          const fixed = fixPhrases(next, targetLang);
          if (!originals.has(node)) originals.set(node, node.nodeValue);
          node.nodeValue = fixed;
          done += 1;
          return;
        }
        const item = attrs[idx - nodes.length];
        if (!item || next === item.value) return;
        const fixed = fixPhrases(next, targetLang);
        const prev = attrOriginals.get(item.el) || {};
        if (!prev[item.attr]) prev[item.attr] = item.value;
        attrOriginals.set(item.el, prev);
        if (item.attr === "value") item.el.value = fixed;
        else item.el.setAttribute(item.attr, fixed);
        done += 1;
      });

      const left = collectTextNodes().length + collectAttrs().length;
      if (!quiet) {
        setStatus(
          left ? `Готово: ${done}. Осталось: ${left}` : `Готово: ${done}`,
          left ? "err" : "ok"
        );
      } else if (done) {
        setStatus(`Доперевод окна: ${done}`, left ? "err" : "ok");
      }
      refreshGeorgianHighlight();
      return { translated: done, total, left };
    } finally {
      apiPassBusy = false;
      if (apiPassQueued) {
        apiPassQueued = false;
        queueMicrotask(() => {
          scheduleDynamicTranslate(50);
        });
      }
    }
  }

  function remainingGeorgian() {
    return collectTextNodes().length + collectAttrs().length;
  }

  function clearGeorgianHighlight() {
    document.querySelectorAll(".karu-ge-remain").forEach((el) => {
      el.classList.remove("karu-ge-remain");
    });
  }

  function refreshGeorgianHighlight() {
    clearGeorgianHighlight();
    if (!highlightGeorgian || !document.body) return;
    const marked = new Set();
    for (const node of collectTextNodes()) {
      const el = node.parentElement;
      if (!el || marked.has(el)) continue;
      marked.add(el);
      el.classList.add("karu-ge-remain");
    }
  }

  function buildBadTranslationReport() {
    const sel = (window.getSelection?.()?.toString() || "").trim();
    const samples = [];
    if (sel) samples.push(sel);
    for (const node of collectTextNodes()) {
      const t = (node.nodeValue || "").trim();
      if (t && !samples.includes(t)) samples.push(t);
      if (samples.length >= 8) break;
    }
    for (const item of collectAttrs()) {
      if (item.value && !samples.includes(item.value)) samples.push(item.value);
      if (samples.length >= 8) break;
    }
    const translatedBits = [];
    for (const [node, original] of originals) {
      if (!node.isConnected) continue;
      if (node.nodeValue && original && node.nodeValue !== original) {
        translatedBits.push(`${original} → ${node.nodeValue}`);
      }
      if (translatedBits.length >= 6) break;
    }
    return {
      ok: true,
      url: location.href,
      host: hostKey(),
      targetLang,
      selection: sel,
      remainingGeorgian: samples,
      translatedPairs: translatedBits,
    };
  }

  function scheduleDynamicTranslate(delay = 280) {
    if (!siteEnabled || !powerOn) return;
    clearTimeout(reapplyTimer);
    reapplyTimer = setTimeout(async () => {
      if (!siteEnabled || !powerOn) return;
      if (mode !== "api" && mode !== "none") return;
      if (!remainingGeorgian()) return;
      try {
        await translateViaApi({ quiet: true });
      } catch (_) {}
    }, delay);
  }

  function startWatcher() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!siteEnabled || !powerOn) return;
      let relevant = false;
      for (const m of mutations) {
        const t = m.target;
        if (!t) continue;
        if (t.id === "karu-status" || (t.nodeType === 1 && t.closest?.("#karu-status"))) continue;
        if (m.type === "characterData" || m.type === "childList") {
          relevant = true;
          break;
        }
        if (m.type === "attributes") {
          const el = t.nodeType === 1 ? t : t.parentElement;
          if (!el) continue;
          const cls = typeof el.className === "string" ? el.className : "";
          const id = el.id || "";
          if (
            el.matches?.(
              "dialog,[role='dialog'],[role='alertdialog'],.modal,.popup,.swal2-container,.ui-dialog,.toast"
            ) ||
            el.closest?.(
              "dialog,[role='dialog'],[role='alertdialog'],.modal,.popup,.swal2-container,.ui-dialog"
            ) ||
            /modal|dialog|popup|confirm|overlay|toast|alert|lightbox|fancybox/i.test(`${cls} ${id}`)
          ) {
            relevant = true;
            break;
          }
        }
      }
      if (!relevant) return;
      scheduleDynamicTranslate(280);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      // Modals often only toggle class/style/hidden/open — no new nodes.
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "open",
        "aria-hidden",
        "aria-expanded",
        "aria-label",
        "title",
        "data-confirm",
        "data-content",
        "data-message",
        "data-title",
      ],
    });

    // Extra hooks for common dialog libraries
    const bump = () => scheduleDynamicTranslate(120);
    document.addEventListener("toggle", bump, true);
    document.addEventListener("shown.bs.modal", bump, true);
    document.addEventListener("show.bs.modal", bump, true);
    document.addEventListener("shown.bs.dropdown", bump, true);
  }

  function stopWatcher() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(reapplyTimer);
  }

  function restoreApiVisuals() {
    for (const [node, original] of originals) {
      if (node.isConnected) node.nodeValue = original;
    }
    originals.clear();
    for (const [el, attrs] of attrOriginals) {
      if (!el.isConnected) continue;
      for (const [attr, value] of Object.entries(attrs)) {
        if (attr === "value") el.value = value;
        else el.setAttribute(attr, value);
      }
    }
    attrOriginals.clear();
  }

  async function ensureDialogHooks(extra = null) {
    try {
      await chrome.runtime.sendMessage({
        type: "INJECT_DIALOG_HOOKS",
        targetLang,
        token: DIALOG_TOKEN,
        extra: extra && typeof extra === "object" ? extra : undefined,
      });
    } catch (err) {
      console.warn("KA-RU dialog hooks:", err);
    }
  }

  function harvestNativeDialogStrings() {
    const found = new Set();
    const re = /(?:confirm|alert|prompt)\s*\(\s*(["'])([\s\S]*?)\1\s*[,)]/g;
    const scan = (text) => {
      if (!text || !GEORGIAN_RE.test(text)) return;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        let s = m[2]
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        s = s.trim();
        if (s && GEORGIAN_RE.test(s) && s.length <= 240) found.add(s);
      }
    };
    document.querySelectorAll("script").forEach((s) => {
      if (s.src) return;
      scan(s.textContent || "");
    });
    document.querySelectorAll("[onclick],[onsubmit]").forEach((el) => {
      scan(el.getAttribute("onclick") || "");
      scan(el.getAttribute("onsubmit") || "");
    });
    return [...found];
  }

  async function pretranslateNativeDialogs() {
    const strings = harvestNativeDialogStrings();
    if (!strings.length) {
      await ensureDialogHooks();
      return;
    }
    try {
      const res = await chrome.runtime.sendMessage({
        type: "TRANSLATE_BATCH",
        texts: strings,
        targetLang,
      });
      const extra = {};
      if (res?.ok && Array.isArray(res.translated)) {
        res.translated.forEach((t, i) => {
          if (typeof t === "string" && t && !GEORGIAN_RE.test(t)) extra[strings[i]] = t;
        });
      }
      await ensureDialogHooks(extra);
    } catch (_) {
      await ensureDialogHooks();
    }
  }

  let nativeDialogLearnTimer = null;
  const nativeDialogQueue = new Set();

  function learnNativeDialogText(text) {
    if (!text || !GEORGIAN_RE.test(text)) return;
    nativeDialogQueue.add(text);
    clearTimeout(nativeDialogLearnTimer);
    nativeDialogLearnTimer = setTimeout(async () => {
      const batch = [...nativeDialogQueue];
      nativeDialogQueue.clear();
      if (!batch.length || !powerOn) return;
      try {
        const res = await chrome.runtime.sendMessage({
          type: "TRANSLATE_BATCH",
          texts: batch,
          targetLang,
        });
        if (!res?.ok) return;
        const extra = {};
        res.translated.forEach((t, i) => {
          if (typeof t === "string" && t && !GEORGIAN_RE.test(t)) extra[batch[i]] = t;
        });
        if (Object.keys(extra).length) await ensureDialogHooks(extra);
      } catch (_) {}
    }, 50);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "karu-transl" || data.type !== "native-dialog") return;
    if (data.token !== DIALOG_TOKEN) return;
    if (typeof data.text === "string") learnNativeDialogText(data.text);
  });

  async function translatePage() {
    if (busy) return { ok: true, queued: true };
    busy = true;
    try {
      if (!powerOn) {
        setStatus("Сначала включите расширение", "err");
        return { ok: false, error: "Выключено" };
      }

      await pretranslateNativeDialogs();
      await translateViaApi();
      await pretranslateNativeDialogs();
      fixTranslatedPage();

      siteEnabled = true;
      startWatcher();
      await chrome.runtime.sendMessage({
        type: "SET_SITE_ENABLED",
        host: hostKey(),
        enabled: true,
      });
      return { ok: true, mode };
    } catch (err) {
      setStatus(String(err?.message || err), "err");
      return { ok: false, error: String(err?.message || err) };
    } finally {
      busy = false;
    }
  }

  async function restorePage() {
    busy = true;
    try {
      stopWatcher();
      siteEnabled = false;
      await chrome.runtime.sendMessage({
        type: "SET_SITE_ENABLED",
        host: hostKey(),
        enabled: false,
      });

      restoreApiVisuals();
      mode = "none";
      clearGeorgianHighlight();
      setStatus("Оригинал восстановлен", "ok");
      return { ok: true };
    } catch (err) {
      setStatus(String(err?.message || err), "err");
      return { ok: false, error: String(err?.message || err) };
    } finally {
      busy = false;
    }
  }

  async function boot() {
    try {
      const stored = await chrome.storage.local.get("highlightGeorgian");
      highlightGeorgian = stored.highlightGeorgian === true;
      const res = await chrome.runtime.sendMessage({
        type: "GET_SETTINGS",
        host: hostKey(),
      });
      if (!res?.ok) return;
      powerOn = res.powerOn;
      targetLang = res.targetLang;
      if (powerOn && res.siteEnabled) {
        siteEnabled = true;
        setTimeout(() => translatePage(), 500);
      } else if (highlightGeorgian) {
        refreshGeorgianHighlight();
      }
    } catch (err) {
      console.warn("KA-RU boot:", err);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.targetLang) {
      targetLang = changes.targetLang.newValue === "en" ? "en" : "ru";
      if (siteEnabled && powerOn) translatePage();
    }
    if (changes.powerOn) {
      powerOn = changes.powerOn.newValue === true;
      if (!powerOn && siteEnabled) restorePage();
    }
    if (changes.highlightGeorgian) {
      highlightGeorgian = changes.highlightGeorgian.newValue === true;
      refreshGeorgianHighlight();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true, powerOn, siteEnabled, targetLang, mode });
      return;
    }
    if (message?.type === "POWER_ON") {
      powerOn = true;
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "POWER_OFF") {
      powerOn = false;
      if (siteEnabled) {
        restorePage().then(sendResponse);
        return true;
      }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "TRANSLATE_PAGE") {
      if (message.targetLang === "en" || message.targetLang === "ru") {
        targetLang = message.targetLang;
      }
      powerOn = true;
      translatePage().then(sendResponse);
      return true;
    }
    if (message?.type === "RESTORE_PAGE") {
      restorePage().then(sendResponse);
      return true;
    }
    if (message?.type === "GET_REPORT") {
      sendResponse(buildBadTranslationReport());
      return;
    }
    if (message?.type === "SET_HIGHLIGHT") {
      highlightGeorgian = message.enabled === true;
      refreshGeorgianHighlight();
      sendResponse({ ok: true, highlightGeorgian });
      return;
    }
    if (message?.type === "GET_STATUS") {
      sendResponse({
        ok: true,
        powerOn,
        enabled: siteEnabled,
        targetLang,
        translating: busy,
        mode,
        highlightGeorgian,
        host: hostKey(),
        remaining: remainingGeorgian(),
      });
    }
  });

  boot();
})();
