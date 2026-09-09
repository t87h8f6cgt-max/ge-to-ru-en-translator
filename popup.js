const powerInput = document.getElementById("power");
const powerLabel = document.getElementById("power-label");
const actionsEl = document.getElementById("actions");
const langFieldset = document.getElementById("lang");
const translateBtn = document.getElementById("translate");
const translatePdfBtn = document.getElementById("translate-pdf");
const restoreBtn = document.getElementById("restore");
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
  translateBtn.disabled = !on;
  translatePdfBtn.disabled = !on;
  restoreBtn.disabled = !on;
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

function isPdfTab(tab) {
  const url = tab?.url || "";
  if (!url) return false;
  // http(s) or local file opened in Chrome
  if (!/^(https?|file):/i.test(url)) return false;
  if (/\.pdf($|\?|#)/i.test(url)) return true;
  // Chrome PDF viewer sometimes keeps path without query
  if (/^file:\/\//i.test(url) && /\.pdf$/i.test(decodeURIComponent(url.split("?")[0]))) {
    return true;
  }
  return false;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" }, { frameId: 0 });
  } catch {
    // inject into all frames
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

async function refreshUi() {
  const on = await getPower();
  const lang = await getTargetLang();
  applyPowerUi(on);
  applyLangUi(lang);
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
    if (res?.enabled) setStatus("Перевод на этом сайте активен", "ok");
    else setStatus("Включено — можно переводить", "ok");
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
});

langFieldset.addEventListener("change", async (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.name !== "targetLang") return;
  await setTargetLang(input.value);
  setStatus(input.value === "en" ? "Язык: English" : "Язык: русский", "ok");
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
    setStatus("Оригинал (перезагрузка)", "ok");
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  } finally {
    applyPowerUi(await getPower());
  }
});

refreshUi();
