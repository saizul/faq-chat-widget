// Text normalisation shared by the matcher. Pure functions, no DOM.

const BN_ZERO = 0x09e6; // Bengali digit zero
const AR_ZERO = 0x0660; // Arabic-Indic digit zero
const FA_ZERO = 0x06f0; // Extended Arabic-Indic digit zero

/** Convert Bangla (০-৯), Arabic-Indic and Persian digits to ASCII 0-9. */
export function toAsciiDigits(text) {
  return String(text ?? "").replace(/[০-৯٠-٩۰-۹]/g, (ch) => {
    const c = ch.charCodeAt(0);
    if (c >= BN_ZERO && c <= BN_ZERO + 9) return String(c - BN_ZERO);
    if (c >= AR_ZERO && c <= AR_ZERO + 9) return String(c - AR_ZERO);
    return String(c - FA_ZERO);
  });
}

/** Convert ASCII digits in a string to Bangla digits. */
export function toBanglaDigits(text) {
  return String(text ?? "").replace(/[0-9]/g, (d) => String.fromCharCode(BN_ZERO + Number(d)));
}

/**
 * Lowercase, unify digits, drop zero-width characters and Latin accents,
 * replace punctuation (including the Bangla danda) with spaces.
 */
export function normalize(text) {
  let s = String(text ?? "").normalize("NFKC");
  s = toAsciiDigits(s).toLowerCase();
  s = s.replace(/[\u200b-\u200d\u2060\ufeff]/g, "");
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
  s = s.replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

const EN_STOP = new Set(
  "a an the is are am was were be been to of in on at for and or do does did can could would will shall i you we my your our me it its this that these those with how what when which who whom please tell about there here have has had get just so if then than as by from into up out any some need want make like know give looking".split(
    " ",
  ),
);
const BN_STOP = new Set(
  "আমি আমার আমরা আপনি আপনার আপনারা তুমি তোমার কি কী কে এই ওই এটা এটি সেটা সেটি আছে আছেন হয় হবে হয়েছে করে করা করতে করব করি পারি পারেন পারে জন্য থেকে এবং ও আর না নাকি যে তো একটা একটি কিছু সব আমাকে দিন দিয়ে".split(
    " ",
  ),
);

export function isStopword(token) {
  return EN_STOP.has(token) || BN_STOP.has(token);
}

const BN_SUFFIXES = ["গুলোকে", "গুলোর", "গুলো", "গুলির", "গুলি", "দেরকে", "দের", "েরা", "টাকে", "টার", "টা", "টির", "টি", "খানা", "রা", "কে", "ের", "তে", "য়"]
  .sort((a, b) => b.length - a.length);

function isBangla(token) {
  return /[ঀ-৿]/.test(token);
}

/** Very light stemming: enough to fold plurals and common Bangla case endings. */
export function stem(token) {
  if (token.length < 4) return token;
  if (isBangla(token)) {
    for (const suf of BN_SUFFIXES) {
      if (token.endsWith(suf) && token.length - suf.length >= 2) return token.slice(0, -suf.length);
    }
    return token;
  }
  if (/\d/.test(token)) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("es") && token.length > 4 && /(ch|sh|x|z|s)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

/** Normalised tokens without stopword removal or stemming. */
export function rawTokens(text) {
  const n = normalize(text);
  return n === "" ? [] : n.split(" ");
}

/** Tokens ready for matching: stopwords removed (unless that leaves nothing), stemmed. */
export function tokenize(text) {
  const raw = rawTokens(text);
  const kept = raw.filter((t) => !isStopword(t));
  return (kept.length ? kept : raw).map(stem);
}

/** Share of letters in the Bengali block: > 0.3 counts as Bangla. */
export function detectLanguage(text) {
  const letters = String(text ?? "").match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return "en";
  const bn = letters.filter((c) => /[ঀ-৿]/.test(c)).length;
  return bn / letters.length > 0.3 ? "bn" : "en";
}

/** Character trigram set of a padded word. */
export function trigrams(word) {
  const padded = `  ${word} `;
  const set = new Set();
  const chars = [...padded];
  for (let i = 0; i + 3 <= chars.length; i++) set.add(chars.slice(i, i + 3).join(""));
  return set;
}

/** Sørensen–Dice coefficient between the trigram sets of two strings (0..1). */
export function trigramSimilarity(a, b) {
  if (a === b) return a === "" ? 0 : 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/** Optimal-string-alignment distance (insert, delete, substitute, adjacent swap). */
export function editDistance(a, b) {
  const s = [...a];
  const t = [...b];
  if (Math.abs(s.length - t.length) > 3) return Math.abs(s.length - t.length);
  const d = Array.from({ length: s.length + 1 }, (_, i) => [i, ...new Array(t.length).fill(0)]);
  for (let j = 1; j <= t.length; j++) d[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[s.length][t.length];
}
