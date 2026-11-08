import { readScriptConfig, safeColor } from "./config.js";
import { buildHandoffPayload, buildTranscript, buildWhatsAppUrl, cleanPhone, postHandoff, safeUrl } from "./handoff.js";
import { getDir, mergeStrings, primaryLang, resolveLang, t } from "./i18n.js";
import { createMatcher, resolveText } from "./matcher.js";
import { detectLanguage } from "./normalize.js";
import { CSS } from "./styles.js";

const SVG_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

let current = null;

/** The most recently initialised widget instance, if any. */
export function getInstance() {
  return current;
}

/**
 * Mount the widget. `config`:
 *  faq (array) or faqUrl, lang ("en"|"bn"|"auto"), theme, primary, position,
 *  whatsapp, webhook, title, greeting, open, suggestions, strings, synonyms, threshold.
 * Returns { open, close, destroy, ask, matcher }.
 */
export async function init(config = {}) {
  if (typeof document === "undefined") throw new Error("faq-chat-widget needs a browser environment");
  const cfg = { theme: "auto", position: "end", suggestions: 4, lang: "auto", ...config };

  let faq = cfg.faq;
  if (!faq && cfg.faqUrl) {
    const res = await fetch(cfg.faqUrl, { credentials: "omit" });
    if (!res.ok) throw new Error(`Could not load FAQ (${res.status})`);
    const json = await res.json();
    faq = Array.isArray(json) ? json : json.faq;
  }
  if (!Array.isArray(faq)) throw new Error("Provide `faq` (array) or `faqUrl`");

  const matcher = createMatcher(faq, { synonyms: cfg.synonyms, threshold: cfg.threshold });
  const strings = mergeStrings(cfg.strings);
  const available = Object.keys(strings);

  const pageLang = () => resolveLang(document.documentElement.lang || navigator.language, available);
  let uiLang = cfg.lang === "auto" ? pageLang() : resolveLang(cfg.lang, available);
  const tr = (key, vars) => t(strings, uiLang, key, vars);

  const messages = [];
  let isOpen = false;

  // ---- DOM
  const host = el("div", { id: "faq-chat-widget-root", "data-theme": cfg.theme });
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(el("style", { text: CSS }));
  const primary = safeColor(cfg.primary);
  if (primary) host.style.setProperty("--fcw-primary", primary);

  const root = el("div", { class: "root", "data-position": cfg.position === "start" ? "start" : "end", "data-open": "false" });
  const launcher = el("button", { class: "launcher", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": "panel" });
  launcher.innerHTML = SVG_CHAT;
  const panel = el("section", { class: "panel", id: "panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "title" });
  const titleEl = el("h2", { id: "title" });
  const subtitleEl = el("p");
  const closeBtn = el("button", { class: "icon-btn", type: "button" });
  closeBtn.innerHTML = SVG_CLOSE;
  const header = el("div", { class: "header" }, [el("div", { class: "grow" }, [titleEl, subtitleEl]), closeBtn]);
  const log = el("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions", tabindex: "0" });
  const input = el("input", { type: "text", autocomplete: "off", enterkeyhint: "send", maxlength: "300" });
  const sendBtn = el("button", { class: "send", type: "submit" });
  const form = el("form", { class: "form" }, [input, sendBtn]);
  panel.append(header, log, form);
  root.append(panel, launcher);
  shadow.append(root);

  function applyLabels() {
    const dir = getDir(uiLang);
    panel.setAttribute("dir", dir);
    panel.setAttribute("lang", uiLang);
    titleEl.textContent = cfg.title || tr("title");
    subtitleEl.textContent = tr("subtitle");
    launcher.setAttribute("aria-label", tr("launcher"));
    closeBtn.setAttribute("aria-label", tr("close"));
    input.setAttribute("placeholder", tr("placeholder"));
    input.setAttribute("aria-label", tr("placeholder"));
    sendBtn.textContent = tr("send");
  }

  // ---- messages
  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, text, extra = {}) {
    messages.push({ role, text, at: new Date().toISOString() });
    const bubble = el("div", { class: `msg ${role}` });
    // The visually hidden speaker label helps screen reader users; text is always set via textContent.
    bubble.append(el("span", { class: "sr-only", text: `${role === "user" ? tr("you") : tr("bot")}: ` }), document.createTextNode(text));
    if (extra.links?.length) {
      const ul = el("ul", { class: "links", "aria-label": tr("links") });
      for (const link of extra.links) {
        const href = safeUrl(link.url);
        if (!href) continue;
        const label = resolveText(link.label, uiLang) || href;
        ul.append(el("li", {}, el("a", { href, target: "_blank", rel: "noopener noreferrer", text: label })));
      }
      if (ul.children.length) bubble.append(ul);
    }
    log.append(bubble);
    scrollDown();
    return bubble;
  }

  function addChips(items, label) {
    if (!items.length) return;
    const wrap = el("div", { class: "chips-block", role: "group", "aria-label": label || tr("suggested") });
    if (label) wrap.append(el("div", { class: "chips-label", text: label }));
    const chips = el("div", { class: "chips" });
    for (const item of items) {
      chips.append(
        el("button", {
          class: `chip${item.human ? " human" : ""}`,
          type: "button",
          text: item.text,
          onclick: () => {
            wrap.remove();
            item.run();
          },
        }),
      );
    }
    wrap.append(chips);
    log.append(wrap);
    scrollDown();
  }

  const questionChips = (entries) =>
    entries.map((e) => {
      const q = resolveText(e.question, uiLang);
      return { text: q, run: () => ask(q) };
    });

  const humanChip = () => ({ text: tr("talkHuman"), human: true, run: startHandoff });

  // ---- handoff
  const hasWhatsapp = Boolean(cleanPhone(cfg.whatsapp));
  const hasWebhook = Boolean(cfg.webhook);

  function whatsappHandoff() {
    const transcript = buildTranscript(messages, { user: tr("you"), bot: tr("bot") });
    try {
      const url = buildWhatsAppUrl(cfg.whatsapp, `${tr("whatsappIntro")}\n\n${transcript}`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      addMessage("bot", tr("failed"));
    }
  }

  function formHandoff() {
    const contact = el("input", { type: "text", id: "contact", autocomplete: "email", maxlength: "120" });
    const submit = el("button", { class: "submit", type: "submit", text: tr("submit") });
    const f = el("form", { class: "contact" }, [
      el("label", { for: "contact", text: tr("contactLabel") }),
      el("div", { class: "row" }, [contact, submit]),
    ]);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      submit.disabled = true;
      submit.textContent = tr("sending");
      const payload = buildHandoffPayload({
        messages,
        lang: uiLang,
        page: { url: location.href, title: document.title },
        contact: contact.value.trim(),
      });
      const ok = await postHandoff(cfg.webhook, payload);
      f.remove();
      addMessage("bot", ok ? tr("sent") : tr("failed"));
      if (!ok && hasWhatsapp) addChips([{ text: tr("viaWhatsapp"), run: whatsappHandoff }]);
    });
    const bubble = el("div", { class: "msg bot" }, f);
    log.append(bubble);
    scrollDown();
    contact.focus();
  }

  function startHandoff() {
    addMessage("user", tr("talkHuman"));
    if (hasWhatsapp && hasWebhook) {
      addMessage("bot", tr("handoffChoose"));
      addChips([
        { text: tr("viaWhatsapp"), run: whatsappHandoff },
        { text: tr("viaForm"), run: formHandoff },
      ]);
    } else if (hasWhatsapp) whatsappHandoff();
    else if (hasWebhook) formHandoff();
    else addMessage("bot", tr("failed"));
  }

  // ---- ask
  let pending = null;
  function ask(question) {
    const text = String(question ?? "").trim();
    if (!text) return;
    if (cfg.lang === "auto") {
      const detected = detectLanguage(text);
      if (available.includes(detected) && /\p{L}/u.test(text)) {
        if (detected !== uiLang) {
          uiLang = detected;
          applyLabels();
        }
      }
    }
    addMessage("user", text);
    const typing = el("div", { class: "msg bot", "aria-hidden": "true" }, el("span", { class: "typing" }, [el("i"), el("i"), el("i")]));
    log.append(typing);
    scrollDown();
    clearTimeout(pending);
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350;
    pending = setTimeout(() => {
      typing.remove();
      const result = matcher.answer(text, { suggestions: 3 });
      if (result.match) {
        addMessage("bot", resolveText(result.match.answer, uiLang), { links: result.match.links });
        const related = matcher.entries.filter((e) => e !== result.match && result.suggestions.includes(e));
        addChips([...questionChips(related), humanChip()], related.length ? tr("related") : "");
      } else if (result.suggestions.length) {
        addMessage("bot", tr("didYouMean"));
        addChips([...questionChips(result.suggestions), humanChip()]);
      } else {
        addMessage("bot", tr("noMatch"));
        addChips([...questionChips(matcher.suggested(cfg.suggestions)), humanChip()]);
      }
    }, delay);
  }

  // ---- open / close / focus trap
  function open() {
    if (isOpen) return;
    isOpen = true;
    root.setAttribute("data-open", "true");
    launcher.setAttribute("aria-expanded", "true");
    input.focus();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.setAttribute("data-open", "false");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  panel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      close();
      return;
    }
    if (ev.key !== "Tab") return;
    const nodes = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === shadow.activeElement);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = shadow.activeElement;
    if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  });
  launcher.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = input.value;
    input.value = "";
    ask(v);
  });

  // ---- start
  applyLabels();
  const greeting = cfg.greeting || tr("greeting");
  addMessage("bot", greeting);
  messages.length = 0; // the greeting is not part of the visitor conversation
  addChips([...questionChips(matcher.suggested(cfg.suggestions)), ...(hasWhatsapp || hasWebhook ? [humanChip()] : [])]);
  document.body.append(host);
  if (cfg.open) open();

  current = {
    open,
    close,
    ask,
    matcher,
    setLang(lang) {
      uiLang = resolveLang(lang, available);
      applyLabels();
    },
    destroy() {
      clearTimeout(pending);
      host.remove();
      if (current?.host === host) current = null;
    },
    host,
  };
  return current;
}

/** Initialise from a <script> element's data attributes. */
export function initFromScript(script) {
  const cfg = readScriptConfig(script);
  return init({ ...cfg, lang: cfg.lang ?? "auto" });
}

export { primaryLang };
