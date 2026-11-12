import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readScriptConfig } from "../src/config.js";
import {
  createHistoryStore,
  DEFAULT_TTL_MINUTES,
  MAX_MESSAGES,
  MAX_TEXT,
  MAX_TTL_MINUTES,
  pickStorage,
  resolvePersist,
  resolveTtl,
  sanitizeState,
  STATE_VERSION,
  STORAGE_KEY,
} from "../src/persist.js";

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const T0 = Date.parse("2026-11-12T10:00:00Z");
const clock = (start = T0) => {
  let t = start;
  const now = () => t;
  now.advance = (minutes) => {
    t += minutes * 60_000;
  };
  return now;
};

const msgs = [
  { role: "user", text: "price?", at: "2026-11-12T09:59:00.000Z" },
  { role: "bot", text: "From 15,000 BDT.", at: "2026-11-12T09:59:01.000Z", id: "pricing" },
];

describe("resolvePersist", () => {
  for (const v of [true, "session", "SESSION", "true", "1", "yes", "on"]) it(`${JSON.stringify(v)} -> session`, () => assert.equal(resolvePersist(v), "session"));
  it("local", () => assert.equal(resolvePersist(" Local "), "local"));
  for (const v of [false, undefined, null, "", "off", "none", "cookie", 0]) it(`${JSON.stringify(v)} -> disabled`, () => assert.equal(resolvePersist(v), ""));
});

describe("resolveTtl", () => {
  it("defaults", () => assert.equal(resolveTtl(undefined), DEFAULT_TTL_MINUTES));
  it("rejects zero and negatives", () => {
    assert.equal(resolveTtl(0), DEFAULT_TTL_MINUTES);
    assert.equal(resolveTtl(-5), DEFAULT_TTL_MINUTES);
  });
  it("rejects non-numbers", () => assert.equal(resolveTtl("abc"), DEFAULT_TTL_MINUTES));
  it("accepts numeric strings", () => assert.equal(resolveTtl("90"), 90));
  it("caps very long values", () => assert.equal(resolveTtl(1e9), MAX_TTL_MINUTES));
});

describe("pickStorage", () => {
  it("returns the storage when it works and leaves no probe key", () => {
    const s = memoryStorage();
    assert.equal(pickStorage("session", { sessionStorage: s }), s);
    assert.equal(pickStorage("local", { localStorage: s }), s);
    assert.equal(s.data.size, 0);
  });
  it("returns null for unknown modes or missing storage", () => {
    assert.equal(pickStorage("", { sessionStorage: memoryStorage() }), null);
    assert.equal(pickStorage("cookie", {}), null);
    assert.equal(pickStorage("session", {}), null);
  });
  it("returns null when access throws", () => {
    const scope = {};
    Object.defineProperty(scope, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
    assert.equal(pickStorage("local", scope), null);
  });
  it("returns null when writes throw (private mode)", () => {
    const s = memoryStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    assert.equal(pickStorage("session", { sessionStorage: s }), null);
  });
});

describe("sanitizeState", () => {
  const base = { v: STATE_VERSION, savedAt: T0, open: true, lang: "bn", messages: msgs };

  it("keeps a valid state", () => {
    assert.deepEqual(sanitizeState(base, { now: T0 }), { messages: msgs, open: true, lang: "bn" });
  });
  it("rejects missing, non-object or other-version states", () => {
    for (const raw of [null, undefined, "x", 42, [], { ...base, v: 99 }]) assert.equal(sanitizeState(raw, { now: T0 }), null);
  });
  it("expires after the TTL", () => {
    assert.ok(sanitizeState(base, { now: T0 + 29 * 60_000, ttlMinutes: 30 }));
    assert.equal(sanitizeState(base, { now: T0 + 31 * 60_000, ttlMinutes: 30 }), null);
  });
  it("rejects bad or future timestamps", () => {
    assert.equal(sanitizeState({ ...base, savedAt: "soon" }, { now: T0 }), null);
    assert.equal(sanitizeState({ ...base, savedAt: T0 + 3600_000 }, { now: T0 }), null);
  });
  it("drops malformed messages and unknown roles", () => {
    const raw = {
      ...base,
      messages: [null, "hi", { role: "system", text: "x" }, { role: "user", text: 5 }, { role: "user", text: "   " }, { role: "user", text: "ok" }],
    };
    const s = sanitizeState(raw, { now: T0 });
    assert.equal(s.messages.length, 1);
    assert.equal(s.messages[0].text, "ok");
    assert.equal(s.messages[0].at, new Date(T0).toISOString(), "invalid `at` falls back to savedAt");
  });
  it("keeps only plain fields (no stored links or HTML flags)", () => {
    const raw = { ...base, messages: [{ role: "bot", text: "hi", id: "a", links: [{ url: "javascript:alert(1)" }], html: true }] };
    assert.deepEqual(Object.keys(sanitizeState(raw, { now: T0 }).messages[0]).sort(), ["at", "id", "role", "text"]);
  });
  it("ignores ids on user messages", () => {
    const s = sanitizeState({ ...base, messages: [{ role: "user", text: "q", id: "pricing" }] }, { now: T0 });
    assert.equal(s.messages[0].id, undefined);
  });
  it("truncates long text and caps the message count", () => {
    const many = Array.from({ length: MAX_MESSAGES + 10 }, (_, i) => ({ role: "user", text: `m${i}` }));
    const s = sanitizeState({ ...base, messages: many }, { now: T0 });
    assert.equal(s.messages.length, MAX_MESSAGES);
    assert.equal(s.messages.at(-1).text, `m${MAX_MESSAGES + 9}`, "keeps the newest messages");
    const long = sanitizeState({ ...base, messages: [{ role: "user", text: "x".repeat(MAX_TEXT * 2) }] }, { now: T0 });
    assert.equal(long.messages[0].text.length, MAX_TEXT);
  });
  it("drops invalid lang codes and non-boolean open", () => {
    const s = sanitizeState({ ...base, lang: "<script>", open: "yes" }, { now: T0 });
    assert.equal(s.lang, undefined);
    assert.equal(s.open, false);
  });
  it("treats a missing messages array as empty", () => {
    assert.deepEqual(sanitizeState({ v: STATE_VERSION, savedAt: T0 }, { now: T0 }).messages, []);
  });
});

describe("createHistoryStore", () => {
  it("round-trips messages, language and open state", () => {
    const storage = memoryStorage();
    const store = createHistoryStore({ storage, now: clock() });
    assert.equal(store.enabled, true);
    assert.equal(store.save({ messages: msgs, lang: "bn", open: true }), true);
    assert.ok(storage.data.has(STORAGE_KEY));
    assert.deepEqual(store.load(), { messages: msgs, open: true, lang: "bn" });
  });

  it("survives a new store on the same storage (next page)", () => {
    const storage = memoryStorage();
    const now = clock();
    createHistoryStore({ storage, now }).save({ messages: msgs });
    now.advance(5);
    assert.equal(createHistoryStore({ storage, now }).load().messages.length, 2);
  });

  it("uses a custom key", () => {
    const storage = memoryStorage();
    createHistoryStore({ storage, key: "shop-faq", now: clock() }).save({ messages: msgs });
    assert.ok(storage.data.has("shop-faq"));
    assert.equal(createHistoryStore({ storage, now: clock() }).load(), null);
  });

  it("expires and removes old conversations", () => {
    const storage = memoryStorage();
    const now = clock();
    const store = createHistoryStore({ storage, ttlMinutes: 10, now });
    store.save({ messages: msgs });
    now.advance(11);
    assert.equal(store.load(), null);
    assert.equal(storage.data.size, 0);
  });

  it("saving refreshes the expiry", () => {
    const storage = memoryStorage();
    const now = clock();
    const store = createHistoryStore({ storage, ttlMinutes: 10, now });
    store.save({ messages: msgs });
    now.advance(8);
    store.save({ messages: msgs });
    now.advance(8);
    assert.ok(store.load());
  });

  it("clears corrupt JSON", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    assert.equal(createHistoryStore({ storage }).load(), null);
    assert.equal(storage.data.size, 0);
  });

  it("caps what it writes", () => {
    const storage = memoryStorage();
    const store = createHistoryStore({ storage, maxMessages: 3, now: clock() });
    store.save({ messages: [...msgs, ...msgs, { role: "user", text: "last" }] });
    const written = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(written.messages.length, 3);
    assert.equal(written.messages.at(-1).text, "last");
    assert.equal(written.v, STATE_VERSION);
  });

  it("clear() removes the conversation", () => {
    const storage = memoryStorage();
    const store = createHistoryStore({ storage, now: clock() });
    store.save({ messages: msgs });
    store.clear();
    assert.equal(store.load(), null);
  });

  it("is a no-op without storage", () => {
    const store = createHistoryStore({ storage: null });
    assert.equal(store.enabled, false);
    assert.equal(store.save({ messages: msgs }), false);
    assert.equal(store.load(), null);
    assert.doesNotThrow(() => store.clear());
  });

  it("never throws when storage fails at runtime", () => {
    const fail = () => {
      throw new Error("revoked");
    };
    const store = createHistoryStore({ storage: { getItem: fail, setItem: fail, removeItem: fail } });
    assert.equal(store.save({ messages: msgs }), false);
    assert.equal(store.load(), null);
    assert.doesNotThrow(() => store.clear());
  });
});

describe("readScriptConfig persistence attributes", () => {
  it("data-persist variants", () => {
    assert.equal(readScriptConfig({ dataset: { persist: "" } }).persist, "session");
    assert.equal(readScriptConfig({ dataset: { persist: "session" } }).persist, "session");
    assert.equal(readScriptConfig({ dataset: { persist: "true" } }).persist, "session");
    assert.equal(readScriptConfig({ dataset: { persist: "LOCAL" } }).persist, "local");
    assert.equal(readScriptConfig({ dataset: { persist: "off" } }).persist, false);
    assert.equal("persist" in readScriptConfig({ dataset: {} }), false);
  });
  it("data-persist-ttl", () => {
    assert.equal(readScriptConfig({ dataset: { persistTtl: "120" } }).persistTtl, 120);
    assert.equal("persistTtl" in readScriptConfig({ dataset: { persistTtl: "-1" } }), false);
    assert.equal("persistTtl" in readScriptConfig({ dataset: { persistTtl: "soon" } }), false);
  });
});
