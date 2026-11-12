// Read widget configuration from a <script> tag's data-* attributes.

const BOOL_TRUE = new Set(["", "true", "1", "yes", "on"]);

function bool(v, fallback = false) {
  if (v === undefined) return fallback;
  return BOOL_TRUE.has(String(v).toLowerCase());
}

/**
 * @param {{dataset: Record<string,string>}} script any object with a `dataset`
 * Supported attributes: data-faq-url, data-lang (en|bn|auto), data-theme (light|dark|auto),
 * data-primary, data-position (end|start), data-whatsapp, data-webhook, data-title,
 * data-greeting, data-open, data-suggestions, data-persist (session|local|off),
 * data-persist-ttl (minutes).
 */
export function readScriptConfig(script) {
  const d = script?.dataset ?? {};
  const config = {};
  if (d.faqUrl) config.faqUrl = d.faqUrl;
  if (d.lang) config.lang = d.lang;
  if (d.theme) config.theme = ["light", "dark", "auto"].includes(d.theme) ? d.theme : "auto";
  if (d.primary) config.primary = d.primary;
  if (d.position) config.position = d.position === "start" ? "start" : "end";
  if (d.whatsapp) config.whatsapp = d.whatsapp;
  if (d.webhook) config.webhook = d.webhook;
  if (d.title) config.title = d.title;
  if (d.greeting) config.greeting = d.greeting;
  if (d.open !== undefined) config.open = bool(d.open);
  if (d.persist !== undefined) {
    const v = String(d.persist).trim().toLowerCase();
    config.persist = v === "local" ? "local" : v === "session" || bool(v) ? "session" : false;
  }
  if (d.persistTtl !== undefined) {
    const n = Number(d.persistTtl);
    if (Number.isFinite(n) && n > 0) config.persistTtl = n;
  }
  if (d.suggestions !== undefined) {
    const n = Number.parseInt(d.suggestions, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10) config.suggestions = n;
  }
  return config;
}

/** Accept only CSS colours made of safe characters (hex, rgb(), hsl(), names). */
export function safeColor(value) {
  const v = String(value ?? "").trim();
  return /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(rgb|hsl)a?\([0-9.,%\s/]+\))$/i.test(v) ? v : "";
}
