// Human handoff helpers. No secrets here: the widget only ever talks to
// WhatsApp (wa.me) or to a PUBLIC endpoint you control. Signing happens
// server side (see server-example/).

const MAX_WA_TEXT = 1500;

/** Keep digits only, as wa.me requires (no +, spaces or dashes). Returns "" when invalid. */
export function cleanPhone(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}

/** Plain-text transcript, one line per message. */
export function buildTranscript(messages, labels = { user: "You", bot: "Assistant" }) {
  return messages
    .filter((m) => m && typeof m.text === "string" && m.text.trim() !== "")
    .map((m) => `${m.role === "user" ? labels.user : labels.bot}: ${m.text.trim()}`)
    .join("\n");
}

/** https://wa.me/<number>?text=... ; throws if the number is invalid. */
export function buildWhatsAppUrl(number, text = "") {
  const phone = cleanPhone(number);
  if (!phone) throw new Error("Invalid WhatsApp number");
  let body = String(text);
  if (body.length > MAX_WA_TEXT) body = `${body.slice(0, MAX_WA_TEXT - 1)}…`;
  return `https://wa.me/${phone}${body ? `?text=${encodeURIComponent(body)}` : ""}`;
}

/** Structured payload posted to the webhook endpoint. */
export function buildHandoffPayload({ messages, lang = "en", page = {}, contact = "", now = new Date() }) {
  return {
    version: 1,
    type: "faq-chat-handoff",
    createdAt: now.toISOString(),
    lang,
    page: { url: String(page.url ?? ""), title: String(page.title ?? "") },
    contact: String(contact ?? "").slice(0, 200),
    messages: messages
      .filter((m) => m && typeof m.text === "string")
      .slice(-50)
      .map((m) => ({ role: m.role === "user" ? "user" : "bot", text: m.text.slice(0, 2000), at: m.at ?? null })),
  };
}

/** Allow https anywhere and http only for localhost development. */
export function isAllowedEndpoint(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** POST the payload as JSON. Resolves true on 2xx, false otherwise. Never throws. */
export async function postHandoff(url, payload, fetchImpl = globalThis.fetch) {
  if (!isAllowedEndpoint(url) || typeof fetchImpl !== "function") return false;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Only http(s), mailto and tel links are rendered. */
export function safeUrl(url) {
  try {
    const u = new URL(String(url), "https://invalid.example");
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol) ? String(url) : "";
  } catch {
    return "";
  }
}
