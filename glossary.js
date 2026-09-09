/**
 * Glossary: ka → { en, ru }
 * Uses generated site dictionary (rs.ge + my.gov.ge) + post-fixes.
 * Bounded match only (not inside longer Georgian words).
 */

/** Hand overrides always win over generated MT entries. */
const GLOSSARY_PRIORITY = [
  { ka: "ინდივიდუალური მეწარმეები", en: "individual entrepreneurs", ru: "индивидуальные предприниматели" },
  { ka: "ინდივიდუალურ მეწარმეებს", en: "individual entrepreneurs", ru: "индивидуальным предпринимателям" },
  { ka: "ინდივიდუალური მეწარმის", en: "individual entrepreneur", ru: "индивидуального предпринимателя" },
  { ka: "ინდივიდუალურ მეწარმეს", en: "individual entrepreneur", ru: "индивидуальному предпринимателю" },
  { ka: "ინდივიდუალური მეწარმე", en: "individual entrepreneur", ru: "индивидуальный предприниматель" },
  { ka: "ინდ. მეწარმე", en: "sole proprietor", ru: "ИП" },
  { ka: "ინდ.მეწარმე", en: "sole proprietor", ru: "ИП" },
  { ka: "პირადი ქონება", en: "personal property", ru: "личное имущество" },
  { ka: "პირადი ქონების", en: "personal property", ru: "личного имущества" },
  { ka: "პირად ქონებას", en: "personal property", ru: "личному имуществу" },
  { ka: "ფიზიკური პირის ქონება", en: "property of a natural person", ru: "имущество физического лица" },
  { ka: "ფიზიკური პირის", en: "natural person", ru: "физического лица" },
  { ka: "ფიზიკური პირი", en: "natural person", ru: "физическое лицо" },
  { ka: "იურიდიული პირი", en: "legal entity", ru: "юридическое лицо" },
  { ka: "იურიდიული პირის", en: "legal entity", ru: "юридического лица" },
  { ka: "შემოსავლების სამსახური", en: "Revenue Service", ru: "Служба доходов" },
  { ka: "ზოგადი ინფორმაცია დავალიანების შესახებ", en: "General information about debt", ru: "Общая информация о задолженности" },
  { ka: "პირადი მონაცემები", en: "Personal data", ru: "Личные данные" },
  { ka: "პირადი ანგარიში", en: "personal account", ru: "лицевой счет" },
  { ka: "გნებავთ დეკლარაციის წაშლა?", en: "Do you want to delete the declaration?", ru: "Удалить декларацию?" },
  { ka: "გნებავთ დეკლარაციის წაშლა", en: "Do you want to delete the declaration?", ru: "Удалить декларацию?" },
  { ka: "სისტემიდან გამოსვლა", en: "Log out", ru: "Выйти из системы" },
  { ka: "მთავარი", en: "Home", ru: "Главная" },
  { ka: "შესვლა", en: "Log in", ru: "Войти" },
  { ka: "ავტორიზაცია", en: "Sign in", ru: "Авторизация" },
  { ka: "საქართველო", en: "Georgia", ru: "Грузия" },
  { ka: "თბილისი", en: "Tbilisi", ru: "Тбилиси" },
];

const GLOSSARY_ENTRIES = (() => {
  const map = new Map();
  const generated = typeof GLOSSARY_GENERATED !== "undefined" ? GLOSSARY_GENERATED : [];
  for (const e of generated) {
    if (e?.ka) map.set(e.ka, e);
  }
  for (const e of GLOSSARY_PRIORITY) {
    map.set(e.ka, e);
  }
  return [...map.values()];
})();

const SORTED_GLOSSARY = [...GLOSSARY_ENTRIES].sort((a, b) => b.ka.length - a.ka.length);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stillGeorgian(text) {
  // Mkhedruli + Mtavruli capitals (often used in UI headings)
  return /[\u10A0-\u10FF\u1C90-\u1CBF]/.test(text || "");
}

/** @param {string} text @param {"en"|"ru"} lang */
function applyGlossary(text, lang = "ru") {
  let out = text;
  for (const entry of SORTED_GLOSSARY) {
    if (!out.includes(entry.ka)) continue;
    const repl = lang === "en" ? entry.en : entry.ru;
    const re = new RegExp(`(?<![\\u10A0-\\u10FF])${escapeRe(entry.ka)}(?![\\u10A0-\\u10FF])`, "g");
    out = out.replace(re, repl);
  }
  return out;
}

function applyPostFixes(text, lang = "ru") {
  if (lang === "en") {
    return text
      .replace(/indian\s+entrepreneurs?/gi, "individual entrepreneur")
      .replace(/Ind\.?\s*entrepreneur/gi, "sole proprietor");
  }
  if (lang !== "ru") return text;
  let out = text;
  out = out.replace(/индийск(?=[а-яё]*\s+предпринимател)/gi, "индивидуальн");
  out = out.replace(
    /индийск(?:ий|ого|ому|им|ом|ие|их|ими)\s+предпринимател\w*/gi,
    (m) => m.replace(/индийск/i, "индивидуальн")
  );
  out = out.replace(/частн(?:ый|ое|ая|ого|ому|ым|ом)\s+имуществ\w*/gi, "личное имущество");
  return out;
}
