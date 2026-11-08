import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDir, mergeStrings, primaryLang, resolveLang, STRINGS, t } from "../src/i18n.js";

describe("strings", () => {
  it("English and Bangla define the same keys", () => {
    assert.deepEqual(Object.keys(STRINGS.bn).sort(), Object.keys(STRINGS.en).sort());
  });
  it("no empty strings", () => {
    for (const lang of Object.keys(STRINGS)) for (const [k, v] of Object.entries(STRINGS[lang])) assert.ok(v.trim() !== "", `${lang}.${k}`);
  });
  it("Bangla strings contain Bengali script", () => {
    for (const [k, v] of Object.entries(STRINGS.bn)) {
      if (k === "poweredBy") continue;
      assert.match(v, /[ঀ-৿]/, k);
    }
  });
});

describe("primaryLang / resolveLang", () => {
  it("bn-BD -> bn", () => assert.equal(primaryLang("bn-BD"), "bn"));
  it("EN_us -> en", () => assert.equal(primaryLang("EN_us"), "en"));
  it("empty -> en", () => assert.equal(primaryLang(""), "en"));
  it("resolves supported language", () => assert.equal(resolveLang("bn-BD"), "bn"));
  it("falls back for unsupported language", () => assert.equal(resolveLang("fr-FR"), "en"));
  it("custom fallback", () => assert.equal(resolveLang("xx", ["bn"], "bn"), "bn"));
});

describe("getDir", () => {
  for (const l of ["ar", "he", "fa", "ur", "ar-EG"]) it(`${l} is rtl`, () => assert.equal(getDir(l), "rtl"));
  for (const l of ["en", "bn", "bn-BD", "hi"]) it(`${l} is ltr`, () => assert.equal(getDir(l), "ltr"));
});

describe("t()", () => {
  it("returns the translation", () => assert.equal(t(STRINGS, "bn", "send"), STRINGS.bn.send));
  it("falls back to English", () => assert.equal(t({ en: { a: "A" }, bn: {} }, "bn", "a"), "A"));
  it("falls back to the key", () => assert.equal(t(STRINGS, "en", "no.such.key"), "no.such.key"));
  it("interpolates variables", () => assert.equal(t({ en: { a: "Hi {name}!" } }, "en", "a", { name: "Saizul" }), "Hi Saizul!"));
  it("leaves unknown placeholders", () => assert.equal(t({ en: { a: "Hi {x}" } }, "en", "a"), "Hi {x}"));
  it("handles region codes", () => assert.equal(t(STRINGS, "bn-BD", "send"), STRINGS.bn.send));
  it("unknown language uses English", () => assert.equal(t(STRINGS, "fr", "send"), STRINGS.en.send));
});

describe("mergeStrings", () => {
  it("overrides single keys", () => {
    const s = mergeStrings({ en: { title: "Help" } });
    assert.equal(s.en.title, "Help");
    assert.equal(s.en.send, STRINGS.en.send);
  });
  it("adds a new language", () => {
    const s = mergeStrings({ hi: { title: "मदद" } });
    assert.equal(s.hi.title, "मदद");
    assert.equal(t(s, "hi", "send"), STRINGS.en.send);
  });
  it("does not mutate the defaults", () => {
    mergeStrings({ en: { title: "X" } });
    assert.notEqual(STRINGS.en.title, "X");
  });
  it("works without arguments", () => assert.deepEqual(mergeStrings().en, STRINGS.en));
});
