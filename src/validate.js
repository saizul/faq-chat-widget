// Validate FAQ data before it reaches the matcher, and audit it for authoring problems.
//
// validateFaq() is used by the widget at load time (invalid entries are skipped instead of
// breaking the whole widget) and by `bin/faq-check.mjs` in CI (errors and warnings reported).

import { safeUrl } from "./handoff.js";
import { createMatcher, resolveText } from "./matcher.js";
import { normalize } from "./normalize.js";

/** Limits that keep a hostile or broken FAQ file from freezing the page. */
export const LIMITS = Object.freeze({ entries: 1000, textLength: 5000, links: 10, keywords: 100 });

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Languages present in a localised field ("" for a plain string). */
function languagesOf(value) {
  if (typeof value === "string") return value.trim() ? [""] : [];
  if (isPlainObject(value)) return Object.keys(value).filter((k) => typeof value[k] === "string" && value[k].trim());
  return [];
}

/** True when a field is a non-empty string or an object with at least one non-empty string. */
function hasText(value) {
  return languagesOf(value).length > 0;
}

function textTooLong(value) {
  if (typeof value === "string") return value.length > LIMITS.textLength;
  if (isPlainObject(value)) return Object.values(value).some((v) => typeof v === "string" && v.length > LIMITS.textLength);
  return false;
}

function isLocalisedText(value) {
  return typeof value === "string" || (isPlainObject(value) && Object.values(value).every((v) => typeof v === "string"));
}

/**
 * Check a FAQ array.
 *
 * Returns `{ entries, errors, warnings }`:
 * - `entries`: the entries that are safe to index (invalid ones removed, in order).
 * - `errors`: problems that make an entry unusable; that entry is dropped.
 * - `warnings`: problems that degrade answers (missing translation, unsafe link, duplicate
 *   question, an entry whose own question resolves to another entry, ...).
 *
 * Each issue is `{ index, id, code, message }`; `index` is the position in the input
 * (or -1 for file-level issues).
 *
 * Options: `audit` (default false) runs the matcher-based checks, which are slower;
 * `languages` lists languages every entry should cover (e.g. ["en", "bn"]).
 */
export function validateFaq(faq, { audit = false, languages = [], matcherOptions = {} } = {}) {
  const errors = [];
  const warnings = [];
  const issue = (list, index, id, code, message) => list.push({ index, id: id ?? null, code, message });

  if (!Array.isArray(faq)) {
    issue(errors, -1, null, "not-array", "FAQ must be an array (or an object with a `faq` array)");
    return { entries: [], errors, warnings };
  }
  if (faq.length === 0) issue(warnings, -1, null, "empty", "FAQ has no entries");
  if (faq.length > LIMITS.entries) {
    issue(errors, -1, null, "too-many", `FAQ has ${faq.length} entries; only the first ${LIMITS.entries} are used`);
  }

  const entries = [];
  const indexOf = [];
  const seenIds = new Map();
  faq.slice(0, LIMITS.entries).forEach((raw, i) => {
    if (!isPlainObject(raw)) {
      issue(errors, i, null, "not-object", `entry ${i + 1} is not an object`);
      return;
    }
    const id = raw.id ?? `faq-${i + 1}`;
    const label = `entry ${i + 1} (${id})`;
    let ok = true;

    if (raw.id !== undefined && (typeof raw.id !== "string" || !raw.id.trim()) && typeof raw.id !== "number") {
      issue(errors, i, id, "bad-id", `${label}: id must be a non-empty string or a number`);
      ok = false;
    }
    if (!isLocalisedText(raw.question) && !Array.isArray(raw.question)) {
      issue(errors, i, id, "bad-question", `${label}: question must be a string or an object of strings`);
      ok = false;
    } else if (!(Array.isArray(raw.question) ? raw.question.some(hasText) : hasText(raw.question))) {
      issue(errors, i, id, "no-question", `${label}: question is empty`);
      ok = false;
    }
    if (!isLocalisedText(raw.answer)) {
      issue(errors, i, id, "bad-answer", `${label}: answer must be a string or an object of strings`);
      ok = false;
    } else if (!hasText(raw.answer)) {
      issue(errors, i, id, "no-answer", `${label}: answer is empty`);
      ok = false;
    }
    if (textTooLong(raw.question) || textTooLong(raw.answer)) {
      issue(errors, i, id, "too-long", `${label}: text longer than ${LIMITS.textLength} characters`);
      ok = false;
    }

    if (ok && seenIds.has(String(id))) {
      issue(errors, i, id, "duplicate-id", `${label}: id already used by entry ${seenIds.get(String(id)) + 1}`);
      ok = false;
    }
    if (!ok) return;
    seenIds.set(String(id), i);

    const clean = { ...raw };

    if (raw.keywords !== undefined) {
      const list = Array.isArray(raw.keywords) ? raw.keywords : [raw.keywords];
      const valid = list.filter(isLocalisedText);
      if (valid.length !== list.length) {
        issue(warnings, i, id, "bad-keyword", `${label}: ignored ${list.length - valid.length} keyword(s) that are not text`);
      }
      if (valid.length > LIMITS.keywords) {
        issue(warnings, i, id, "too-many-keywords", `${label}: only the first ${LIMITS.keywords} keywords are used`);
      }
      clean.keywords = valid.slice(0, LIMITS.keywords);
    }

    if (raw.links !== undefined) {
      if (!Array.isArray(raw.links)) {
        issue(warnings, i, id, "bad-links", `${label}: links must be an array; ignored`);
        delete clean.links;
      } else {
        const links = [];
        raw.links.forEach((link, j) => {
          if (!isPlainObject(link) || !hasText(link.label) || typeof link.url !== "string") {
            issue(warnings, i, id, "bad-link", `${label}: link ${j + 1} needs a label and a url; ignored`);
          } else if (!safeUrl(link.url)) {
            issue(warnings, i, id, "unsafe-link", `${label}: link ${j + 1} url is not http(s), mailto or tel; ignored`);
          } else links.push(link);
        });
        if (links.length > LIMITS.links) {
          issue(warnings, i, id, "too-many-links", `${label}: only the first ${LIMITS.links} links are shown`);
        }
        clean.links = links.slice(0, LIMITS.links);
      }
    }

    if (raw.suggested !== undefined && typeof raw.suggested !== "boolean") {
      issue(warnings, i, id, "bad-suggested", `${label}: suggested should be true or false`);
    }

    // Translation coverage: a question asked in a language should be answered in it.
    const qLangs = languagesOf(raw.question).filter(Boolean);
    const aLangs = new Set(languagesOf(raw.answer).filter(Boolean));
    const answerIsPlain = typeof raw.answer === "string";
    for (const lang of new Set([...qLangs, ...languages])) {
      if (!answerIsPlain && !aLangs.has(lang)) {
        issue(warnings, i, id, "missing-translation", `${label}: no "${lang}" answer (falls back to another language)`);
      }
    }
    for (const lang of languages) {
      if (typeof raw.question !== "string" && !qLangs.includes(lang)) {
        issue(warnings, i, id, "missing-translation", `${label}: no "${lang}" question`);
      }
    }

    entries.push(clean);
    indexOf.push(i);
  });

  if (audit && entries.length > 0) auditEntries(entries, indexOf, warnings, matcherOptions);
  return { entries, errors, warnings };
}

/** Matcher-based checks: duplicate questions and entries that cannot be reached by their own question. */
function auditEntries(entries, indexOf, warnings, matcherOptions) {
  const matcher = createMatcher(entries, matcherOptions);
  const ids = matcher.entries.map((e) => e.id);
  const seenQuestions = new Map();

  matcher.entries.forEach((entry, k) => {
    const i = indexOf[k];
    const label = `entry ${i + 1} (${entry.id})`;
    const questions = Array.isArray(entry.question)
      ? entry.question.flatMap((q) => languagesOf(q).map((l) => resolveText(q, l || "en")))
      : languagesOf(entry.question).map((l) => resolveText(entry.question, l || "en"));

    for (const q of questions) {
      const norm = normalize(q);
      if (!norm) continue;
      const prev = seenQuestions.get(norm);
      if (prev !== undefined && prev !== k) {
        warnings.push({
          index: i,
          id: entry.id,
          code: "duplicate-question",
          message: `${label}: same question as ${ids[prev]} ("${q}")`,
        });
        continue;
      }
      seenQuestions.set(norm, k);

      const result = matcher.answer(q, { suggestions: 1 });
      if (!result.match) {
        warnings.push({
          index: i,
          id: entry.id,
          code: "unreachable",
          message: `${label}: asking its own question "${q}" is not answered confidently (score ${result.score.toFixed(2)})`,
        });
      } else if (result.match.id !== entry.id) {
        warnings.push({
          index: i,
          id: entry.id,
          code: "shadowed",
          message: `${label}: its own question "${q}" is answered by ${result.match.id}; add distinguishing keywords`,
        });
      }
    }
  });
}

/** Accept a parsed FAQ file: a bare array or `{ faq: [...] }`. */
export function extractFaq(json) {
  if (Array.isArray(json)) return json;
  if (isPlainObject(json) && Array.isArray(json.faq)) return json.faq;
  return null;
}
