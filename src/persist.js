// Opt-in conversation persistence. Keeps the visitor's chat across page
// navigations by storing it in sessionStorage (default) or localStorage.
// Stored data is treated as untrusted on the way back in: it is validated,
// truncated and expired before the widget renders any of it.

export const STORAGE_KEY = "faq-chat-widget:v1";
export const STATE_VERSION = 1;
export const DEFAULT_TTL_MINUTES = 30;
export const MAX_TTL_MINUTES = 60 * 24 * 30;
export const MAX_MESSAGES = 50;
export const MAX_TEXT = 1000;

const ROLES = new Set(["user", "bot"]);
const MODES = { session: "sessionStorage", local: "localStorage" };

/**
 * Normalise the `persist` option: true/"session" -> "session", "local" -> "local",
 * anything else (false, "", "off", "none", unknown) -> "" (disabled).
 */
export function resolvePersist(value) {
  if (value === true) return "session";
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "session" || v === "true" || v === "1" || v === "yes" || v === "on") return "session";
  if (v === "local") return "local";
  return "";
}

/** Clamp a TTL in minutes; non-numeric or non-positive values give the default. */
export function resolveTtl(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(n, MAX_TTL_MINUTES);
}

/**
 * Return a usable Storage for `mode` ("session" | "local") or null.
 * Accessing storage can throw (blocked cookies, sandboxed iframes) and writes can
 * throw (Safari private mode, quota), so both are probed.
 */
export function pickStorage(mode, scope = globalThis) {
  const name = MODES[mode];
  if (!name) return null;
  try {
    const storage = scope[name];
    if (!storage) return null;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function cleanMessage(m, fallbackAt) {
  if (!m || typeof m !== "object" || !ROLES.has(m.role) || typeof m.text !== "string") return null;
  const text = m.text.trim().slice(0, MAX_TEXT);
  if (!text) return null;
  const out = { role: m.role, text, at: typeof m.at === "string" && !Number.isNaN(Date.parse(m.at)) ? m.at : fallbackAt };
  if (m.role === "bot" && typeof m.id === "string" && m.id.length <= 200) out.id = m.id;
  return out;
}

/**
 * Validate a parsed state object. Returns `{ messages, lang?, open }` or null when the
 * state is missing, from another version, or older than `ttlMinutes`.
 */
export function sanitizeState(raw, { now = Date.now(), ttlMinutes = DEFAULT_TTL_MINUTES, maxMessages = MAX_MESSAGES } = {}) {
  if (!raw || typeof raw !== "object" || raw.v !== STATE_VERSION) return null;
  const savedAt = Number(raw.savedAt);
  if (!Number.isFinite(savedAt) || savedAt > now + 60_000) return null;
  if (now - savedAt > resolveTtl(ttlMinutes) * 60_000) return null;
  const fallbackAt = new Date(savedAt).toISOString();
  const list = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = list.map((m) => cleanMessage(m, fallbackAt)).filter(Boolean).slice(-Math.max(1, maxMessages));
  const state = { messages, open: raw.open === true };
  if (typeof raw.lang === "string" && /^[a-z]{2,3}$/.test(raw.lang)) state.lang = raw.lang;
  return state;
}

/**
 * Create a history store. `storage` is any object with getItem/setItem/removeItem
 * (pass `pickStorage("session")`); when it is null every method is a safe no-op.
 * Returns { enabled, load(), save(state), clear() }.
 */
export function createHistoryStore({ storage, key = STORAGE_KEY, ttlMinutes = DEFAULT_TTL_MINUTES, maxMessages = MAX_MESSAGES, now = Date.now } = {}) {
  const enabled = Boolean(storage);

  function clear() {
    if (!enabled) return;
    try {
      storage.removeItem(key);
    } catch {
      // Storage became unavailable; nothing to clear.
    }
  }

  function load() {
    if (!enabled) return null;
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      clear();
      return null;
    }
    const state = sanitizeState(parsed, { now: now(), ttlMinutes, maxMessages });
    if (!state) clear();
    return state;
  }

  /** Save `{ messages, lang, open }`. Returns true when written. */
  function save({ messages = [], lang, open = false } = {}) {
    if (!enabled) return false;
    const at = new Date(now()).toISOString();
    const kept = messages.map((m) => cleanMessage(m, at)).filter(Boolean).slice(-Math.max(1, maxMessages));
    const state = { v: STATE_VERSION, savedAt: now(), open: Boolean(open), messages: kept };
    if (typeof lang === "string" && /^[a-z]{2,3}$/.test(lang)) state.lang = lang;
    try {
      storage.setItem(key, JSON.stringify(state));
      return true;
    } catch {
      // Quota exceeded or storage revoked: keep working without persistence.
      return false;
    }
  }

  return { enabled, load, save, clear };
}
