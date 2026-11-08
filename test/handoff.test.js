import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readScriptConfig, safeColor } from "../src/config.js";
import {
  buildHandoffPayload, buildTranscript, buildWhatsAppUrl, cleanPhone, isAllowedEndpoint, postHandoff, safeUrl,
} from "../src/handoff.js";

describe("cleanPhone", () => {
  it("strips symbols", () => assert.equal(cleanPhone("+880 1700-000000"), "8801700000000"));
  it("rejects too short", () => assert.equal(cleanPhone("123"), ""));
  it("rejects too long", () => assert.equal(cleanPhone("1".repeat(16)), ""));
  it("rejects empty", () => assert.equal(cleanPhone(undefined), ""));
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me link", () => assert.equal(buildWhatsAppUrl("+8801700000000"), "https://wa.me/8801700000000"));
  it("encodes the text", () => assert.equal(buildWhatsAppUrl("8801700000000", "a b&c"), "https://wa.me/8801700000000?text=a%20b%26c"));
  it("encodes Bangla", () => {
    const u = new URL(buildWhatsAppUrl("8801700000000", "হ্যালো"));
    assert.equal(u.searchParams.get("text"), "হ্যালো");
  });
  it("throws on a bad number", () => assert.throws(() => buildWhatsAppUrl("abc", "x"), /Invalid/));
  it("truncates very long text", () => {
    const u = new URL(buildWhatsAppUrl("8801700000000", "x".repeat(5000)));
    assert.ok(u.searchParams.get("text").length <= 1500);
  });
});

describe("transcript and payload", () => {
  const msgs = [
    { role: "user", text: " price? ", at: "t1" },
    { role: "bot", text: "From 15,000", at: "t2" },
    { role: "bot", text: "   " },
  ];
  it("labels roles and skips blanks", () => assert.equal(buildTranscript(msgs), "You: price?\nAssistant: From 15,000"));
  it("accepts custom labels", () => assert.equal(buildTranscript(msgs, { user: "আপনি", bot: "সহকারী" }).split("\n")[0], "আপনি: price?"));
  it("payload has a stable shape", () => {
    const p = buildHandoffPayload({ messages: msgs, lang: "bn", page: { url: "https://x.test/", title: "T" }, contact: "me@x.test", now: new Date("2026-01-02T03:04:05Z") });
    assert.equal(p.type, "faq-chat-handoff");
    assert.equal(p.version, 1);
    assert.equal(p.createdAt, "2026-01-02T03:04:05.000Z");
    assert.equal(p.lang, "bn");
    assert.equal(p.contact, "me@x.test");
    assert.equal(p.messages[0].role, "user");
    assert.equal(p.messages.length, 3);
  });
  it("caps the number of messages", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ role: "user", text: String(i) }));
    assert.equal(buildHandoffPayload({ messages: many }).messages.length, 50);
  });
  it("never includes secrets or extra fields", () => {
    const p = buildHandoffPayload({ messages: msgs });
    assert.deepEqual(Object.keys(p).sort(), ["contact", "createdAt", "lang", "messages", "page", "type", "version"]);
  });
});

describe("endpoint safety", () => {
  it("allows https", () => assert.ok(isAllowedEndpoint("https://n8n.example.com/webhook/x")));
  it("allows http localhost", () => assert.ok(isAllowedEndpoint("http://localhost:5678/hook")));
  it("rejects http elsewhere", () => assert.ok(!isAllowedEndpoint("http://example.com/hook")));
  it("rejects javascript:", () => assert.ok(!isAllowedEndpoint("javascript:alert(1)")));
  it("rejects garbage", () => assert.ok(!isAllowedEndpoint("not a url")));
});

describe("postHandoff", () => {
  it("posts JSON without credentials and returns true on 2xx", async () => {
    let seen;
    const ok = await postHandoff("https://h.test/x", { a: 1 }, async (url, init) => {
      seen = { url, init };
      return { ok: true };
    });
    assert.equal(ok, true);
    assert.equal(seen.init.method, "POST");
    assert.equal(seen.init.credentials, "omit");
    assert.equal(seen.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(seen.init.body), { a: 1 });
    assert.ok(!("Authorization" in seen.init.headers) && !("X-Signature" in seen.init.headers));
  });
  it("returns false on non-2xx", async () => assert.equal(await postHandoff("https://h.test/x", {}, async () => ({ ok: false })), false));
  it("returns false (no throw) on network failure", async () =>
    assert.equal(await postHandoff("https://h.test/x", {}, async () => { throw new Error("down"); }), false));
  it("refuses an insecure endpoint without calling fetch", async () => {
    let called = false;
    assert.equal(await postHandoff("http://h.test/x", {}, async () => { called = true; return { ok: true }; }), false);
    assert.equal(called, false);
  });
});

describe("safeUrl", () => {
  it("allows https", () => assert.equal(safeUrl("https://saizul.com"), "https://saizul.com"));
  it("allows mailto and tel", () => {
    assert.ok(safeUrl("mailto:a@b.co"));
    assert.ok(safeUrl("tel:+8801700000000"));
  });
  it("blocks javascript:", () => assert.equal(safeUrl("javascript:alert(1)"), ""));
  it("blocks data:", () => assert.equal(safeUrl("data:text/html,x"), ""));
});

describe("readScriptConfig", () => {
  it("reads known attributes", () => {
    const c = readScriptConfig({ dataset: { faqUrl: "faq.json", lang: "bn", theme: "dark", primary: "#123456", position: "start", whatsapp: "8801", webhook: "https://x.test", title: "T", open: "true", suggestions: "3" } });
    assert.deepEqual(c, { faqUrl: "faq.json", lang: "bn", theme: "dark", primary: "#123456", position: "start", whatsapp: "8801", webhook: "https://x.test", title: "T", open: true, suggestions: 3 });
  });
  it("returns {} for no dataset", () => assert.deepEqual(readScriptConfig({}), {}));
  it("invalid theme becomes auto", () => assert.equal(readScriptConfig({ dataset: { theme: "neon" } }).theme, "auto"));
  it("invalid position becomes end", () => assert.equal(readScriptConfig({ dataset: { position: "top" } }).position, "end"));
  it("data-open=false is false", () => assert.equal(readScriptConfig({ dataset: { open: "false" } }).open, false));
  it("bare data-open is true", () => assert.equal(readScriptConfig({ dataset: { open: "" } }).open, true));
  it("ignores out of range suggestions", () => assert.equal("suggestions" in readScriptConfig({ dataset: { suggestions: "99" } }), false));
});

describe("safeColor", () => {
  for (const ok of ["#0b7a5b", "#fff", "rgb(1, 2, 3)", "hsl(120 40% 30%)", "teal"]) it(`accepts ${ok}`, () => assert.equal(safeColor(ok), ok));
  for (const bad of ["red; background:url(x)", "url(x)", "expression(1)", "#12", "", "javascript:1"]) it(`rejects ${bad}`, () => assert.equal(safeColor(bad), ""));
});
