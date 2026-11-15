import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractFaq, LIMITS, validateFaq } from "../src/validate.js";

const demo = JSON.parse(readFileSync(new URL("../demo/faq.json", import.meta.url), "utf8"));
const codes = (list) => list.map((x) => x.code);

describe("validateFaq: structure", () => {
  it("accepts the demo FAQ without issues, including the audit", () => {
    const r = validateFaq(demo, { audit: true, languages: ["en", "bn"] });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.entries.length, demo.length);
  });

  it("rejects a non-array", () => {
    const r = validateFaq({ faq: [] });
    assert.deepEqual(codes(r.errors), ["not-array"]);
    assert.deepEqual(r.entries, []);
  });

  it("warns about an empty FAQ", () => {
    assert.deepEqual(codes(validateFaq([]).warnings), ["empty"]);
  });

  it("drops entries that are not objects or lack question/answer, keeping the rest", () => {
    const r = validateFaq([
      null,
      "text",
      { question: "", answer: "a" },
      { question: "q", answer: "" },
      { question: { en: "q", bn: 3 }, answer: "a" },
      { question: "Opening hours?", answer: { en: "9 to 5" } },
    ]);
    assert.deepEqual(codes(r.errors), ["not-object", "not-object", "no-question", "no-answer", "bad-question"]);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].question, "Opening hours?");
    assert.equal(r.errors[2].index, 2);
  });

  it("rejects bad and duplicate ids, keeping the first entry with an id", () => {
    const r = validateFaq([
      { id: "a", question: "one", answer: "1" },
      { id: "a", question: "two", answer: "2" },
      { id: "", question: "three", answer: "3" },
      { id: { x: 1 }, question: "four", answer: "4" },
      { id: 7, question: "five", answer: "5" },
    ]);
    assert.deepEqual(codes(r.errors), ["duplicate-id", "bad-id", "bad-id"]);
    assert.deepEqual(
      r.entries.map((e) => e.id),
      ["a", 7],
    );
  });

  it("treats implicit ids like the matcher does", () => {
    const r = validateFaq([
      { question: "one", answer: "1" },
      { id: "faq-1", question: "two", answer: "2" },
    ]);
    assert.deepEqual(codes(r.errors), ["duplicate-id"]);
  });

  it("rejects over-long text and caps the entry count", () => {
    const long = "x".repeat(LIMITS.textLength + 1);
    assert.deepEqual(codes(validateFaq([{ question: "q", answer: long }]).errors), ["too-long"]);
    const many = Array.from({ length: LIMITS.entries + 2 }, (_, i) => ({ question: `q${i}`, answer: "a" }));
    const r = validateFaq(many);
    assert.deepEqual(codes(r.errors), ["too-many"]);
    assert.equal(r.entries.length, LIMITS.entries);
  });

  it("does not mutate the input", () => {
    const input = [{ question: "q", answer: "a", links: [{ label: "x", url: "javascript:alert(1)" }] }];
    const copy = structuredClone(input);
    validateFaq(input);
    assert.deepEqual(input, copy);
  });
});

describe("validateFaq: links, keywords, flags", () => {
  it("drops unsafe and malformed links with a warning", () => {
    const r = validateFaq([
      {
        question: "q",
        answer: "a",
        links: [
          { label: "ok", url: "https://example.com" },
          { label: "mail", url: "mailto:hi@example.com" },
          { label: "bad", url: "javascript:alert(1)" },
          { label: "data", url: "data:text/html,hi" },
          { url: "https://example.com/nolabel" },
          "https://example.com/string",
        ],
      },
    ]);
    assert.deepEqual(codes(r.warnings), ["unsafe-link", "unsafe-link", "bad-link", "bad-link"]);
    assert.deepEqual(
      r.entries[0].links.map((l) => l.label),
      ["ok", "mail"],
    );
  });

  it("ignores a links value that is not an array", () => {
    const r = validateFaq([{ question: "q", answer: "a", links: "https://example.com" }]);
    assert.deepEqual(codes(r.warnings), ["bad-links"]);
    assert.equal(r.entries[0].links, undefined);
  });

  it("caps links and keywords", () => {
    const links = Array.from({ length: LIMITS.links + 1 }, (_, i) => ({ label: `l${i}`, url: `https://e.com/${i}` }));
    const keywords = Array.from({ length: LIMITS.keywords + 1 }, (_, i) => `k${i}`);
    const r = validateFaq([{ question: "q", answer: "a", links, keywords }]);
    assert.deepEqual(codes(r.warnings).sort(), ["too-many-keywords", "too-many-links"]);
    assert.equal(r.entries[0].links.length, LIMITS.links);
    assert.equal(r.entries[0].keywords.length, LIMITS.keywords);
  });

  it("drops keywords that are not text and accepts a single string", () => {
    const r = validateFaq([
      { question: "q", answer: "a", keywords: ["price", 5, { en: "cost", bn: "দাম" }, null] },
      { question: "r", answer: "b", keywords: "solo" },
    ]);
    assert.deepEqual(codes(r.warnings), ["bad-keyword"]);
    assert.equal(r.entries[0].keywords.length, 2);
    assert.deepEqual(r.entries[1].keywords, ["solo"]);
  });

  it("warns when suggested is not a boolean", () => {
    assert.deepEqual(codes(validateFaq([{ question: "q", answer: "a", suggested: "yes" }]).warnings), ["bad-suggested"]);
  });
});

describe("validateFaq: translations", () => {
  it("warns when a question language has no answer in that language", () => {
    const r = validateFaq([{ question: { en: "Price?", bn: "দাম?" }, answer: { en: "100" } }]);
    assert.deepEqual(codes(r.warnings), ["missing-translation"]);
    assert.match(r.warnings[0].message, /"bn" answer/);
  });

  it("does not warn when the answer is a plain string", () => {
    assert.deepEqual(validateFaq([{ question: { en: "Price?", bn: "দাম?" }, answer: "100" }]).warnings, []);
  });

  it("checks required languages", () => {
    const r = validateFaq([{ question: { en: "Price?" }, answer: { en: "100" } }], { languages: ["en", "bn"] });
    assert.deepEqual(codes(r.warnings), ["missing-translation", "missing-translation"]);
  });
});

describe("validateFaq: audit", () => {
  it("is off by default", () => {
    const faq = [
      { id: "a", question: "How do I pay?", answer: "x" },
      { id: "b", question: "How do I pay?", answer: "y" },
    ];
    assert.deepEqual(validateFaq(faq).warnings, []);
  });

  it("flags duplicate questions across entries", () => {
    const r = validateFaq(
      [
        { id: "a", question: "How do I pay?", answer: "x" },
        { id: "b", question: "how do I pay", answer: "y" },
      ],
      { audit: true },
    );
    assert.ok(codes(r.warnings).includes("duplicate-question"));
    assert.equal(r.warnings.find((w) => w.code === "duplicate-question").id, "b");
  });

  it("flags an entry whose own question is answered by another entry", () => {
    const r = validateFaq(
      [
        { id: "shipping", question: "Shipping", answer: "x", keywords: ["shipping cost", "cost", "shipping"] },
        { id: "cost", question: "Shipping cost", answer: "y" },
        { id: "other", question: "Xylophone quartz", answer: "z" },
      ],
      { audit: true },
    );
    assert.deepEqual(codes(r.warnings), ["shadowed"]);
    assert.equal(r.warnings[0].id, "cost");
    assert.match(r.warnings[0].message, /answered by shipping/);
  });

  it("audits each language of a localised question", () => {
    const r = validateFaq(
      [
        { id: "a", question: { en: "Refund policy", bn: "রিফান্ড নীতি" }, answer: "x" },
        { id: "b", question: { en: "Refund policy details", bn: "রিফান্ড নীতি" }, answer: "y" },
      ],
      { audit: true },
    );
    const dup = r.warnings.filter((w) => w.code === "duplicate-question");
    assert.equal(dup.length, 1);
    assert.match(dup[0].message, /রিফান্ড/);
  });
});

describe("extractFaq", () => {
  it("accepts an array or { faq }", () => {
    assert.deepEqual(extractFaq([1]), [1]);
    assert.deepEqual(extractFaq({ faq: [2] }), [2]);
  });
  it("returns null for anything else", () => {
    assert.equal(extractFaq({ items: [] }), null);
    assert.equal(extractFaq(null), null);
    assert.equal(extractFaq("x"), null);
  });
});
