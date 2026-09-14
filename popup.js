const powerInput = document.getElementById("power");
const powerLabel = document.getElementById("power-label");
const actionsEl = document.getElementById("actions");
const langFieldset = document.getElementById("lang");
const translateBtn = document.getElementById("translate");
const translatePdfBtn = document.getElementById("translate-pdf");
const restoreBtn = document.getElementById("restore");
const reportBtn = document.getElementById("report");
const alwaysSiteInput = document.getElementById("always-site");
const siteHostEl = document.getElementById("site-host");
const siteWrap = document.getElementById("site-wrap");
const highlightInput = document.getElementById("highlight-ge");
const statusEl = document.getElementById("status");

function setStatus(text, state = "") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function applyPowerUi(on) {
  powerInput.checked = on;
  powerLabel.textContent = on ? "Включено" : "Выключено";
  actionsEl.classList.toggle("is-disabled", !on);
  langFieldset.classList.toggle("is-disabled", !on);
  siteWrap.classList.toggle("is-disabled", !on);
  highlightInput.disabled = !on;
  alwaysSiteInput.disabled = !on;
  translateBtn.disabled = !on;
  translatePdfBtn.disabled = !on;
  restoreBtn.disabled = !on;
  reportBtn.disabled = !on;
  langFieldset.querySelectorAll("input").forEach((el) => {
    el.disabled = !on;
  });
}

async function getPower() {
  const data = await chrome.storage.local.get("powerOn");
  return data.powerOn === true;
}

async function setPower(on) {
  await chrome.storage.local.set({ powerOn: on });
}

async function getTargetLang() {
  const data = await chrome.storage.local.get("targetLang");
  return data.targetLang === "en" ? "en" : "ru";
}

async function setTargetLang(lang) {
  await chrome.storage.local.set({ targetLang: lang === "en" ? "en" : "ru" });
}

function applyLangUi(lang) {
  const value = lang === "en" ? "en" : "ru";
  const input = langFieldset.querySelector(`input[value="${value}"]`);
  if (input) input.checked = true;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostFromTab(tab) {
  try {
    return new URL(tab.url).hostname;
  } catch {
    return "";
  }
}

function isPdfTab(tab) {
  const url = tab?.url || "";
  if (!url) return false;
  if (!/^(https?|file):/i.test(url)) return false;
  if (/\.pdf($|\?|#)/i.test(url)) return true;
  if (/^file:\/\//i.test(url) && /\.pdf$/i.test(decodeURIComponent(url.split("?")[0]))) {
    return true;
  }
  return false;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" }, { frameId: 0 });
  } catch {
    // inject
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (_) {}
  try {
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: ["content.css"],
    });
  } catch (_) {}
  return true;
}

async function sendToAllFrames(tabId, type, payload = {}) {
  let frames = [{ frameId: 0 }];
  try {
    const all = await chrome.webNavigation.getAllFrames({ tabId });
    if (Array.isArray(all) && all.length) frames = all;
  } catch (_) {}

  const results = [];
  for (const frame of frames) {
    if (frame.errorOccurred) continue;
    const url = frame.url || "";
    if (url && !/^https?:/i.test(url)) continue;
    try {
      const res = await chrome.tabs.sendMessage(
        tabId,
        { type, ...payload },
        { frameId: frame.frameId }
      );
      results.push({ frameId: frame.frameId, url, res });
    } catch (_) {}
  }
  return results;
}

async function sendToPage(type, payload = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("Нет активной вкладки");
  if (isPdfTab(tab)) {
    throw new Error("Это PDF — нажмите «Перевести PDF»");
  }
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error("Откройте обычную веб-страницу (http/https)");
  }
  await ensureContentScript(tab.id);
  const results = await sendToAllFrames(tab.id, type, payload);
  const ok = results.find((r) => r.res?.ok) || results.find((r) => r.res);
  if (!ok) throw new Error("Не удалось связаться со страницей");
  const top = results.find((r) => r.frameId === 0)?.res;
  const anyApi = results.find((r) => r.res?.mode === "api")?.res;
  const anyReload = results.find((r) => r.res?.reloading)?.res;
  return anyReload || top || anyApi || ok.res;
}

async function openPdfSidePanel() {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("Нет активной вкладки");
  if (!isPdfTab(tab)) {
    throw new Error(
      "Откройте PDF в Chrome (файл с диска или ссылка …/file.pdf)"
    );
  }
  await chrome.storage.local.set({
    pdfTranslateRequest: { at: Date.now(), tabId: tab.id, url: tab.url },
  });
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel.html",
    enabled: true,
  });
  await chrome.sidePanel.open({ tabId: tab.id });
}

async function syncSiteToggleFromTab() {
  const tab = await getActiveTab();
  const host = hostFromTab(tab);
  siteHostEl.textContent = host || "сайт недоступен";
  if (!host || isPdfTab(tab) || !tab?.url || !/^https?:/i.test(tab.url || "")) {
    alwaysSiteInput.checked = false;
    alwaysSiteInput.disabled = true;
    return host;
  }
  const data = await chrome.storage.local.get("enabledHosts");
  alwaysSiteInput.checked = Boolean(data.enabledHosts?.[host]);
  alwaysSiteInput.disabled = !(await getPower());
  return host;
}

async function refreshUi() {
  const on = await getPower();
  const lang = await getTargetLang();
  const hl = await chrome.storage.local.get("highlightGeorgian");
  highlightInput.checked = hl.highlightGeorgian === true;
  applyPowerUi(on);
  applyLangUi(lang);
  await syncSiteToggleFromTab();
  if (!on) {
    setStatus("Расширение выключено");
    return;
  }
  try {
    const tab = await getActiveTab();
    if (isPdfTab(tab)) {
      setStatus("Открыт PDF — используйте «Перевести PDF»", "ok");
      return;
    }
    const res = await sendToPage("GET_STATUS");
    if (res?.enabled) {
      setStatus(
        res.remaining
          ? `Сайт в автопереводе · осталось ka: ${res.remaining}`
          : "Этот сайт всегда переводится",
        "ok"
      );
    } else {
      setStatus("Включено — можно переводить", "ok");
    }
  } catch (err) {
    const msg = String(err?.message || err);
    if (/Это PDF/.test(msg)) setStatus(msg, "ok");
    else setStatus("Включено — откройте обычную страницу", "ok");
  }
}

powerInput.addEventListener("change", async () => {
  const on = powerInput.checked;
  applyPowerUi(on);
  await setPower(on);
  try {
    const tab = await getActiveTab();
    if (isPdfTab(tab)) {
      setStatus(on ? "Включено — нажмите «Перевести PDF»" : "Выключено", "ok");
      return;
    }
    if (on) {
      await sendToPage("POWER_ON");
      setStatus("Включено — нажмите «Перевести страницу»", "ok");
    } else {
      await sendToPage("POWER_OFF");
      setStatus("Выключено", "ok");
    }
  } catch {
    setStatus(on ? "Включено" : "Выключено", "ok");
  }
  await syncSiteToggleFromTab();
});

langFieldset.addEventListener("change", async (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.name !== "targetLang") return;
  await setTargetLang(input.value);
  setStatus(input.value === "en" ? "Язык: English" : "Язык: русский", "ok");
});

alwaysSiteInput.addEventListener("change", async () => {
  if (!(await getPower())) {
    alwaysSiteInput.checked = false;
    setStatus("Сначала включите расширение", "err");
    return;
  }
  const tab = await getActiveTab();
  const host = hostFromTab(tab);
  if (!host) {
    alwaysSiteInput.checked = false;
    setStatus("Нет hostname у вкладки", "err");
    return;
  }
  const enabled = alwaysSiteInput.checked;
  try {
    await chrome.runtime.sendMessage({
      type: "SET_SITE_ENABLED",
      host,
      enabled,
    });
    if (enabled) {
      const lang = await getTargetLang();
      setStatus("Включаю автоперевод сайта…");
      const res = await sendToPage("TRANSLATE_PAGE", { targetLang: lang });
      if (!res?.ok) throw new Error(res?.error || "Не удалось перевести");
      setStatus(`Автоперевод для ${host} включён`, "ok");
    } else {
      await sendToPage("RESTORE_PAGE");
      setStatus(`Автоперевод для ${host} выключен`, "ok");
    }
  } catch (err) {
    alwaysSiteInput.checked = !enabled;
    setStatus(String(err?.message || err), "err");
  }
});

highlightInput.addEventListener("change", async () => {
  const enabled = highlightInput.checked;
  await chrome.storage.local.set({ highlightGeorgian: enabled });
  try {
    await sendToPage("SET_HIGHLIGHT", { enabled });
    setStatus(
      enabled ? "Подсветка оставшегося грузинского включена" : "Подсветка выключена",
      "ok"
    );
  } catch {
    setStatus(
      enabled ? "Подсветка сохранится на следующей странице" : "Подсветка выключена",
      "ok"
    );
  }
});

translateBtn.addEventListener("click", async () => {
  if (!(await getPower())) {
    setStatus("Сначала включите расширение", "err");
    return;
  }
  translateBtn.disabled = true;
  translatePdfBtn.disabled = true;
  restoreBtn.disabled = true;
  const lang = await getTargetLang();
  setStatus(lang === "en" ? "Перевожу → EN…" : "Перевожу → RU…");
  try {
    const tab = await getActiveTab();
    if (isPdfTab(tab)) {
      await openPdfSidePanel();
      setStatus("PDF: перевод в боковой панели", "ok");
      return;
    }
    const res = await sendToPage("TRANSLATE_PAGE", { targetLang: lang });
    if (!res?.ok) throw new Error(res?.error || "Не удалось перевести");
    await syncSiteToggleFromTab();
    setStatus("Готово (включая вложенные окна/iframe)", "ok");
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  } finally {
    applyPowerUi(await getPower());
  }
});

translatePdfBtn.addEventListener("click", async () => {
  if (!(await getPower())) {
    setStatus("Сначала включите расширение", "err");
    return;
  }
  translateBtn.disabled = true;
  translatePdfBtn.disabled = true;
  restoreBtn.disabled = true;
  try {
    await openPdfSidePanel();
    setStatus("Открыта боковая панель — идёт перевод PDF", "ok");
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  } finally {
    applyPowerUi(await getPower());
  }
});

restoreBtn.addEventListener("click", async () => {
  if (!(await getPower())) {
    setStatus("Сначала включите расширение", "err");
    return;
  }
  restoreBtn.disabled = true;
  try {
    await sendToPage("RESTORE_PAGE");
    alwaysSiteInput.checked = false;
    const host = hostFromTab(await getActiveTab());
    if (host) {
      await chrome.runtime.sendMessage({
        type: "SET_SITE_ENABLED",
        host,
        enabled: false,
      });
    }
    setStatus("Оригинал восстановлен", "ok");
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  } finally {
    applyPowerUi(await getPower());
  }
});

reportBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    let report = {
      url: tab?.url || "",
      host: hostFromTab(tab),
      targetLang: await getTargetLang(),
      selection: "",
      remainingGeorgian: [],
      translatedPairs: [],
    };
    try {
      const res = await sendToPage("GET_REPORT");
      if (res?.ok) report = { ...report, ...res };
    } catch (_) {}

    const lines = [
      "Плохой перевод — GE to RU/EN translator",
      `URL: ${report.url}`,
      `Host: ${report.host}`,
      `Язык: ${report.targetLang}`,
      "",
      "Выделение:",
      report.selection || "(нет)",
      "",
      "Оставшийся грузинский:",
      ...(report.remainingGeorgian?.length
        ? report.remainingGeorgian.map((s) => `- ${s}`)
        : ["(нет)"]),
      "",
      "Примеры уже переведённого:",
      ...(report.translatedPairs?.length
        ? report.translatedPairs.map((s) => `- ${s}`)
        : ["(нет)"]),
    ];
    const body = lines.join("\n");
    try {
      await navigator.clipboard.writeText(body);
    } catch (_) {}
    const issueUrl =
      "https://github.com/t87h8f6cgt-max/ge-to-ru-en-translator/issues/new" +
      "?title=" +
      encodeURIComponent("Bad translation") +
      "&body=" +
      encodeURIComponent(body.slice(0, 5500));
    await chrome.tabs.create({ url: issueUrl });
    setStatus("Открыт черновик GitHub Issue (текст также в буфере)", "ok");
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  }
});

refreshUi();
