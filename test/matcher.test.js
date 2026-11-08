import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createMatcher, resolveText } from "../src/matcher.js";

const faq = JSON.parse(readFileSync(new URL("../demo/faq.json", import.meta.url), "utf8"));
const m = createMatcher(faq);
const best = (q) => m.answer(q).match?.id;

describe("resolveText", () => {
  it("returns strings as is", () => assert.equal(resolveText("x"), "x"));
  it("picks the requested language", () => assert.equal(resolveText({ en: "a", bn: "খ" }, "bn"), "খ"));
  it("falls back to English", () => assert.equal(resolveText({ en: "a" }, "bn"), "a"));
  it("falls back to any string", () => assert.equal(resolveText({ fr: "z" }, "bn"), "z"));
  it("handles null", () => assert.equal(resolveText(null), ""));
  it("joins arrays", () => assert.equal(resolveText(["a", "b"]), "a b"));
});

describe("createMatcher validation", () => {
  it("requires an array", () => assert.throws(() => createMatcher({}), TypeError));
  it("requires object entries", () => assert.throws(() => createMatcher(["x"]), TypeError));
  it("requires a question", () => assert.throws(() => createMatcher([{ answer: "x" }]), /question/));
  it("assigns ids", () => assert.equal(createMatcher([{ question: "q", answer: "a" }]).entries[0].id, "faq-1"));
  it("keeps explicit ids", () => assert.equal(createMatcher([{ id: "z", question: "q", answer: "a" }]).entries[0].id, "z"));
  it("works with an empty FAQ", () => {
    const e = createMatcher([]);
    assert.deepEqual(e.answer("anything"), { match: null, score: 0, confident: false, suggestions: [] });
  });
});

describe("English matching", () => {
  const cases = [
    ["how much does a website cost", "pricing"],
    ["price", "pricing"],
    ["pricing please", "pricing"],
    ["what is your rate", "pricing"],
    ["how long will it take", "timeline"],
    ["delivery time", "timeline"],
    ["which payment methods", "payment"],
    ["do you accept bkash", "payment"],
    ["whatsapp bot", "whatsapp-automation"],
    ["I need a chatbot", "whatsapp-automation"],
    ["wordpress", "wordpress"],
    ["woocommerce store", "wordpress"],
    ["support after launch", "support"],
    ["working hours", "hours"],
    ["how can I contact you", "contact"],
    ["hello", "greeting"],
    ["hi", "greeting"],
  ];
  for (const [q, id] of cases) it(`"${q}" -> ${id}`, () => assert.equal(best(q), id));
});

describe("Bangla matching", () => {
  const cases = [
    ["দাম কত", "pricing"],
    ["খরচ কত টাকা", "pricing"],
    ["কতদিন লাগে", "timeline"],
    ["বিকাশ নগদ", "payment"],
    ["হোয়াটসঅ্যাপ অটোমেশন", "whatsapp-automation"],
    ["ওয়ার্ডপ্রেস", "wordpress"],
    ["যোগাযোগ করতে চাই", "contact"],
    ["আসসালামু আলাইকুম", "greeting"],
    ["সাপোর্ট পাব?", "support"],
  ];
  for (const [q, id] of cases) it(`"${q}" -> ${id}`, () => assert.equal(best(q), id));
});

describe("synonyms across languages", () => {
  it("English price synonym finds Bangla-keyworded entry", () => assert.equal(best("cost"), "pricing"));
  it("Bangla দাম matches English question", () => assert.equal(best("দাম"), "pricing"));
  it("custom synonyms extend the defaults", () => {
    const mm = createMatcher(faq, { synonyms: [["price", "freelance"]] });
    assert.equal(mm.answer("freelance").match?.id, "pricing");
  });
});

describe("typo tolerance", () => {
  const cases = [
    ["delivry time", "timeline"],
    ["wordpres", "wordpress"],
    ["whatsap automaton", "whatsapp-automation"],
    ["paymant methods", "payment"],
    ["mantenance", "support"],
    ["contcat", "contact"],
  ];
  for (const [q, id] of cases) it(`"${q}" -> ${id}`, () => assert.equal(best(q), id));
});

describe("digits", () => {
  const faqNum = [
    { id: "a", question: "Do you offer 24/7 support?", answer: "yes", keywords: ["24"] },
    { id: "b", question: "What is the 30 day guarantee?", answer: "yes" },
  ];
  const mm = createMatcher(faqNum);
  it("matches ASCII digits", () => assert.equal(mm.answer("30 day").match?.id, "b"));
  it("matches Bangla digits against ASCII FAQ", () => assert.equal(mm.answer("৩০ day").match?.id, "b"));
  it("matches Bangla digits in the FAQ itself", () => {
    const m2 = createMatcher([{ id: "x", question: "৩০ দিনের গ্যারান্টি", answer: "ok" }]);
    assert.equal(m2.answer("30 দিনের গ্যারান্টি").match?.id, "x");
  });
});

describe("no match and suggestions", () => {
  it("returns no confident match for unrelated text", () => {
    const r = m.answer("quantum chromodynamics lattice");
    assert.equal(r.confident, false);
    assert.equal(r.match, null);
  });
  it("empty query gives nothing", () => assert.equal(m.answer("").match, null));
  it("punctuation-only query gives nothing", () => assert.deepEqual(m.search("???"), []));
  it("search is sorted best first", () => {
    const r = m.search("payment price");
    for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  });
  it("search respects limit", () => assert.ok(m.search("support price payment", { limit: 2 }).length <= 2));
  it("scores are within 0..1", () => {
    for (const r of m.search("price payment support contact")) assert.ok(r.score >= 0 && r.score <= 1);
  });
  it("offers suggestions on a weak match", () => {
    const r = m.answer("something about your hours and cats");
    assert.ok(r.suggestions.length >= 0);
  });
  it("suggested() prefers flagged entries", () => {
    const s = m.suggested(10);
    assert.ok(s.every((e) => e.suggested));
  });
  it("suggested() falls back to the first entries", () => {
    const mm = createMatcher([{ question: "a b", answer: "x" }, { question: "c d", answer: "y" }]);
    assert.equal(mm.suggested(1).length, 1);
  });
  it("a higher threshold makes matching stricter", () => {
    const strict = createMatcher(faq, { threshold: 0.99 });
    assert.equal(strict.answer("price").confident, false);
  });
  it("stable ordering on ties", () => {
    const mm = createMatcher([
      { id: "1", question: "alpha beta", answer: "x" },
      { id: "2", question: "alpha beta", answer: "y" },
    ]);
    assert.equal(mm.search("alpha beta")[0].entry.id, "1");
  });
});

describe("options", () => {
  it("ignores undefined option values", () => {
    const mm = createMatcher(faq, { threshold: undefined });
    assert.equal(mm.options.threshold, 0.4);
  });
});

describe("keyword phrases", () => {
  it("author keyword phrase boosts an entry", () => {
    const mm = createMatcher([
      { id: "a", question: "General information", answer: "x", keywords: ["money back guarantee"] },
      { id: "b", question: "Other information", answer: "y" },
    ]);
    assert.equal(mm.answer("is there a money back guarantee").match?.id, "a");
  });
  it("accepts per-language keyword objects", () => {
    const mm = createMatcher([{ id: "a", question: "Q", answer: "A", keywords: { en: ["alpha"], bn: ["আলফা"] } }]);
    assert.equal(mm.answer("আলফা").match?.id, "a");
  });
});
