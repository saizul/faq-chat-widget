#!/usr/bin/env node
// Check FAQ JSON files before deploying them.
//
//   node bin/faq-check.mjs demo/faq.json [more.json] [--lang en,bn] [--strict] [--json] [--no-audit]
//
// Exit codes: 0 ok, 1 errors (or warnings with --strict), 2 usage / unreadable file.

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { extractFaq, validateFaq } from "../src/validate.js";

const USAGE = "usage: faq-check <faq.json>... [--lang en,bn] [--strict] [--json] [--no-audit]";

export function parseArgs(argv) {
  const opts = { files: [], languages: [], strict: false, json: false, audit: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--strict") opts.strict = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--no-audit") opts.audit = false;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--lang" || a.startsWith("--lang=")) {
      const value = a === "--lang" ? argv[++i] : a.slice("--lang=".length);
      if (!value) throw new Error("--lang needs a value, e.g. --lang en,bn");
      opts.languages = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

/** Check one file; returns { file, entries, errors, warnings }. Never throws. */
export function checkFile(file, { languages = [], audit = true, read = readFileSync } = {}) {
  let json;
  try {
    json = JSON.parse(read(file, "utf8"));
  } catch (err) {
    const message = err instanceof SyntaxError ? `invalid JSON: ${err.message}` : `cannot read: ${err.message}`;
    return { file, entries: 0, errors: [{ index: -1, id: null, code: "unreadable", message }], warnings: [] };
  }
  const faq = extractFaq(json);
  const result = validateFaq(faq, { audit, languages });
  return { file, entries: result.entries.length, errors: result.errors, warnings: result.warnings };
}

export function formatText(results) {
  const out = [];
  for (const r of results) {
    out.push(`${r.file}: ${r.entries} usable entr${r.entries === 1 ? "y" : "ies"}, ${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
    for (const e of r.errors) out.push(`  error   [${e.code}] ${e.message}`);
    for (const w of r.warnings) out.push(`  warning [${w.code}] ${w.message}`);
  }
  return out.join("\n");
}

export function exitCode(results, strict) {
  if (results.some((r) => r.errors.length)) return 1;
  if (strict && results.some((r) => r.warnings.length)) return 1;
  return 0;
}

export function main(argv, { stdout = process.stdout, stderr = process.stderr, read } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    stderr.write(`${err.message}\n${USAGE}\n`);
    return 2;
  }
  if (opts.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (opts.files.length === 0) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }
  const results = opts.files.map((f) => checkFile(f, { languages: opts.languages, audit: opts.audit, read }));
  stdout.write(opts.json ? `${JSON.stringify(results, null, 2)}\n` : `${formatText(results)}\n`);
  if (results.some((r) => r.errors.some((e) => e.code === "unreadable"))) return 2;
  return exitCode(results, opts.strict);
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

const invokedDirectly = isMain();
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
