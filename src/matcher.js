import { DEFAULT_SYNONYMS } from "./synonyms.js";
import { editDistance, normalize, stem, tokenize, trigramSimilarity } from "./normalize.js";

/**
 * A FAQ text field is either a string or an object keyed by language code,
 * e.g. { en: "How much?", bn: "দাম কত?" }.
 */
export function resolveText(value, lang = "en") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => resolveText(v, lang)).join(" ");
  if (typeof value === "object") {
    if (typeof value[lang] === "string") return value[lang];
    if (typeof value.en === "string") return value.en;
    const first = Object.values(value).find((v) => typeof v === "string");
    return first ?? "";
  }
  return String(value);
}

function allTexts(value) {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allTexts);
  if (typeof value === "object") return Object.values(value).flatMap(allTexts);
  return [String(value)];
}

export const DEFAULTS = Object.freeze({
  /** Minimum score to treat the best match as an answer. */
  threshold: 0.4,
  /** Minimum score for an entry to be offered as "did you mean". */
  suggestThreshold: 0.2,
  /** Minimum trigram similarity for a typo-tolerant token match. */
  fuzzyMin: 0.55,
  /** Typo matches are worth less than exact matches. */
  fuzzyPenalty: 0.85,
  /** Score given to a token within 1-2 edits of an indexed token. */
  editScore: 0.8,
});

/**
 * Build a matcher from a FAQ array.
 * Entry: { id?, question, answer, keywords?, links?, suggested? }
 */
export function createMatcher(faq, options = {}) {
  if (!Array.isArray(faq)) throw new TypeError("faq must be an array");
  const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
  const opts = { ...DEFAULTS, ...defined };
  const synonymMap = buildSynonymMap([...DEFAULT_SYNONYMS, ...(options.synonyms ?? [])]);
  const canon = (t) => synonymMap.get(t) ?? t;
  const tokensOf = (text) => tokenize(text).map(canon);

  const entries = faq.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new TypeError(`faq[${i}] must be an object`);
    const questions = allTexts(raw.question);
    const keywordTexts = allTexts(raw.keywords);
    const answerTexts = allTexts(raw.answer);
    if (questions.length === 0) throw new TypeError(`faq[${i}] needs a question`);
    return {
      entry: { ...raw, id: raw.id ?? `faq-${i + 1}` },
      order: i,
      questionTokens: new Set(questions.flatMap(tokensOf)),
      keywordTokens: new Set(keywordTexts.flatMap(tokensOf)),
      answerTokens: new Set(answerTexts.flatMap(tokensOf)),
      questionNorms: questions.map(normalize),
      keywordNorms: keywordTexts.map(normalize),
    };
  });

  // Inverse document frequency over question + keyword tokens.
  const df = new Map();
  for (const e of entries) {
    for (const t of new Set([...e.questionTokens, ...e.keywordTokens])) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = Math.max(entries.length, 1);
  const idf = (t) => Math.log(1 + N / (1 + (df.get(t) ?? 0))) + 0.1;

  function tokenMatch(q, set) {
    if (set.has(q)) return 1;
    if (q.length < 4) return 0;
    let best = 0;
    for (const t of set) {
      if (t.length < 4) continue;
      const sim = trigramSimilarity(q, t);
      if (sim > best) best = sim;
      // Short swaps/omissions ("contcat") share few trigrams; allow 1 edit (2 for long words).
      const maxEdits = q.length >= 8 && t.length >= 8 ? 2 : 1;
      if (q.length >= 5 && t.length >= 5 && editDistance(q, t) <= maxEdits) best = Math.max(best, opts.editScore);
    }
    return best >= opts.fuzzyMin ? Math.min(best * opts.fuzzyPenalty, opts.editScore) : 0;
  }

  function scoreEntry(e, qTokens, qNorm) {
    let num = 0;
    let den = 0;
    for (const q of qTokens) {
      const w = idf(q);
      const m = Math.max(tokenMatch(q, e.questionTokens), tokenMatch(q, e.keywordTokens), 0.4 * tokenMatch(q, e.answerTokens));
      num += w * m;
      den += w;
    }
    const tokenScore = den === 0 ? 0 : num / den;
    let phrase = 0;
    for (const n of e.questionNorms) phrase = Math.max(phrase, trigramSimilarity(qNorm, n));
    // An author-provided keyword phrase contained verbatim in the query is a strong signal.
    let phraseBonus = 0;
    for (const k of e.keywordNorms) {
      if (k.includes(" ") && ` ${qNorm} `.includes(` ${k} `)) phraseBonus = 0.15;
    }
    return Math.min(1, 0.7 * tokenScore + 0.3 * phrase + phraseBonus);
  }

  /** Ranked results: [{ entry, score }], best first. Empty query gives []. */
  function search(query, { limit = 5, minScore = 0 } = {}) {
    const qNorm = normalize(query);
    const qTokens = tokensOf(query);
    if (qTokens.length === 0) return [];
    return entries
      .map((e) => ({ entry: e.entry, score: scoreEntry(e, qTokens, qNorm), order: e.order }))
      .filter((r) => r.score > minScore)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, limit)
      .map(({ entry, score }) => ({ entry, score }));
  }

  /**
   * Answer a query: { match, confident, suggestions }.
   * `match` is the best entry (or null when nothing reaches suggestThreshold),
   * `confident` is true when its score reaches `threshold`.
   */
  function answer(query, { suggestions = 3 } = {}) {
    const results = search(query, { limit: suggestions + 1, minScore: opts.suggestThreshold });
    const top = results[0];
    if (!top) return { match: null, score: 0, confident: false, suggestions: [] };
    const confident = top.score >= opts.threshold;
    return {
      match: confident ? top.entry : null,
      score: top.score,
      confident,
      suggestions: results.filter((r) => !(confident && r.entry === top.entry)).slice(0, suggestions).map((r) => r.entry),
    };
  }

  /** Entries to show before the visitor types: flagged `suggested`, else the first n. */
  function suggested(n = 4) {
    const flagged = entries.filter((e) => e.entry.suggested).map((e) => e.entry);
    return (flagged.length ? flagged : entries.map((e) => e.entry)).slice(0, n);
  }

  return { search, answer, suggested, entries: entries.map((e) => e.entry), options: opts };
}

function buildSynonymMap(groups) {
  const map = new Map();
  for (const group of groups) {
    const forms = group.map((w) => stem(normalize(w))).filter(Boolean);
    const head = forms[0];
    if (!head) continue;
    for (const f of forms) if (!map.has(f)) map.set(f, head);
  }
  return map;
}
