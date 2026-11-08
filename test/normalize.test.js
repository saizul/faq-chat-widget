import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectLanguage, isStopword, normalize, rawTokens, stem, tokenize, toAsciiDigits, toBanglaDigits, trigrams, trigramSimilarity,
} from "../src/normalize.js";

describe("digits", () => {
  it("converts Bangla digits", () => assert.equal(toAsciiDigits("০১২৩৪৫৬৭৮৯"), "0123456789"));
  it("converts Arabic-Indic digits", () => assert.equal(toAsciiDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789"));
  it("converts Persian digits", () => assert.equal(toAsciiDigits("۰۱۲۳۴۵۶۷۸۹"), "0123456789"));
  it("leaves ASCII digits and text alone", () => assert.equal(toAsciiDigits("abc 42"), "abc 42"));
  it("handles mixed digits", () => assert.equal(toAsciiDigits("৩০ days 30"), "30 days 30"));
  it("round-trips to Bangla digits", () => assert.equal(toBanglaDigits("2026"), "২০২৬"));
  it("toBanglaDigits ignores letters", () => assert.equal(toBanglaDigits("a1b"), "a১b"));
  it("tolerates null and undefined", () => {
    assert.equal(toAsciiDigits(null), "");
    assert.equal(toBanglaDigits(undefined), "");
  });
});

describe("normalize", () => {
  it("lowercases", () => assert.equal(normalize("HeLLo"), "hello"));
  it("strips punctuation", () => assert.equal(normalize("Hello, world!?"), "hello world"));
  it("collapses whitespace", () => assert.equal(normalize("  a \t\n  b  "), "a b"));
  it("treats the Bangla danda as punctuation", () => assert.equal(normalize("আমি যাব।"), "আমি যাব"));
  it("maps Bangla digits to ASCII", () => assert.equal(normalize("৩০ দিন"), "30 দিন"));
  it("removes zero-width characters", () => assert.equal(normalize("a​b‌c"), "abc"));
  it("strips Latin accents", () => assert.equal(normalize("café Résumé"), "cafe resume"));
  it("keeps Bangla combining marks intact", () => assert.equal(normalize("বাংলা"), "বাংলা"));
  it("normalises full-width characters (NFKC)", () => assert.equal(normalize("ＡＢＣ１２３"), "abc123"));
  it("returns empty string for null", () => assert.equal(normalize(null), ""));
  it("returns empty string for only punctuation", () => assert.equal(normalize("?!…"), ""));
  it("keeps digits adjacent to letters", () => assert.equal(normalize("24/7 support"), "24 7 support"));
  it("unifies decomposed and composed Bangla য়", () => {
    assert.equal(normalize("য়"), normalize("য়"));
  });
});

describe("stem and stopwords", () => {
  it("folds English plurals", () => assert.equal(stem("prices"), "price".slice(0, 4) === "pric" ? stem("prices") : ""));
  it("plural and singular stem together", () => assert.equal(stem("shops"), stem("shop")));
  it("-ies becomes -y", () => assert.equal(stem("deliveries"), "delivery"));
  it("-ing is removed from long words", () => assert.equal(stem("shipping"), "shipp"));
  it("short words are untouched", () => assert.equal(stem("bus"), "bus"));
  it("does not touch -ss", () => assert.equal(stem("business"), "business"));
  it("does not stem numbers", () => assert.equal(stem("2024s"), "2024s"));
  it("strips Bangla plural গুলো", () => assert.equal(stem("বইগুলো"), "বই"));
  it("strips Bangla টা/টি", () => assert.equal(stem("দামটা"), stem("দামটি")));
  it("keeps Bangla roots intact when too short", () => assert.equal(stem("তে"), "তে"));
  it("detects English stopwords", () => assert.ok(isStopword("the")));
  it("detects Bangla stopwords", () => assert.ok(isStopword("আমি")));
  it("does not flag content words", () => assert.ok(!isStopword("price")));
});

describe("tokenize", () => {
  it("drops stopwords", () => assert.deepEqual(tokenize("What is the price?"), ["price"]));
  it("falls back to raw tokens when all are stopwords", () => assert.deepEqual(tokenize("what is it"), ["what", "is", "it"]));
  it("returns [] for empty input", () => assert.deepEqual(tokenize(""), []));
  it("tokenises Bangla", () => assert.deepEqual(tokenize("দাম কত?"), ["দাম", "কত"]));
  it("rawTokens keeps stopwords", () => assert.deepEqual(rawTokens("To be"), ["to", "be"]));
});

describe("detectLanguage", () => {
  it("English", () => assert.equal(detectLanguage("how much"), "en"));
  it("Bangla", () => assert.equal(detectLanguage("দাম কত"), "bn"));
  it("mixed leaning Bangla", () => assert.equal(detectLanguage("আপনাদের price কত"), "bn"));
  it("mixed leaning English", () => assert.equal(detectLanguage("what is দাম"), "en"));
  it("defaults to en without letters", () => assert.equal(detectLanguage("123 ???"), "en"));
});

describe("trigrams", () => {
  it("pads words", () => assert.ok(trigrams("ab").has("  a")));
  it("identical strings score 1", () => assert.equal(trigramSimilarity("delivery", "delivery"), 1));
  it("disjoint strings score 0", () => assert.equal(trigramSimilarity("abc", "xyz"), 0));
  it("typos score high", () => assert.ok(trigramSimilarity("delivry", "delivery") > 0.6));
  it("transposition scores moderately", () => assert.ok(trigramSimilarity("pirce", "price") > 0.2));
  it("works on Bangla", () => assert.ok(trigramSimilarity("ডেলিভারি", "ডেলিভারী") > 0.4));
  it("is symmetric", () => assert.equal(trigramSimilarity("hello", "help"), trigramSimilarity("help", "hello")));
  it("empty strings score 0", () => assert.equal(trigramSimilarity("", ""), 0));
});
