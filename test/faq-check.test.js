import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkFile, exitCode, formatText, main, parseArgs } from "../bin/faq-check.mjs";

const BIN = fileURLToPath(new URL("../bin/faq-check.mjs", import.meta.url));
const DEMO = fileURLToPath(new URL("../demo/faq.json", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "faq-check-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const write = (name, data) => {
  const p = join(dir, name);
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data));
  return p;
};
const sink = () => {
  const s = { text: "", write: (chunk) => (s.text += chunk) };
  return s;
};
const run = (argv) => {
  const stdout = sink();
  const stderr = sink();
  return { code: main(argv, { stdout, stderr }), out: stdout.text, err: stderr.text };
};

describe("parseArgs", () => {
  it("parses files and flags", () => {
    const o = parseArgs(["a.json", "--strict", "--lang", "en, bn", "b.json", "--json", "--no-audit"]);
    assert.deepEqual(o.files, ["a.json", "b.json"]);
    assert.deepEqual(o.languages, ["en", "bn"]);
    assert.equal(o.strict, true);
    assert.equal(o.json, true);
    assert.equal(o.audit, false);
  });
  it("supports --lang=", () => assert.deepEqual(parseArgs(["--lang=bn"]).languages, ["bn"]));
  it("rejects unknown options and a missing --lang value", () => {
    assert.throws(() => parseArgs(["--nope"]), /unknown option/);
    assert.throws(() => parseArgs(["--lang"]), /needs a value/);
  });
});

describe("checkFile", () => {
  it("reports invalid JSON as unreadable", () => {
    const r = checkFile(write("broken.json", "{ nope"));
    assert.equal(r.errors[0].code, "unreadable");
    assert.match(r.errors[0].message, /invalid JSON/);
  });
  it("reports a missing file as unreadable", () => {
    assert.match(checkFile(join(dir, "missing.json")).errors[0].message, /cannot read/);
  });
  it("accepts the { faq: [...] } wrapper", () => {
    const r = checkFile(write("wrapped.json", { faq: [{ question: "q", answer: "a" }] }));
    assert.equal(r.entries, 1);
    assert.deepEqual(r.errors, []);
  });
});

describe("main", () => {
  it("passes the demo FAQ", () => {
    const r = run([DEMO, "--lang", "en,bn", "--strict"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /9 usable entries, 0 error\(s\), 0 warning\(s\)/);
  });

  it("exits 1 on errors and lists them", () => {
    const p = write("errors.json", [{ question: "q" }, { question: "ok", answer: "a" }]);
    const r = run([p]);
    assert.equal(r.code, 1);
    assert.match(r.out, /error {3}\[no-answer\]|error {3}\[bad-answer\]/);
    assert.match(r.out, /1 usable entry,/);
  });

  it("exits 0 on warnings unless --strict", () => {
    const p = write("warn.json", [{ question: "q", answer: "a", links: [{ label: "x", url: "javascript:void 0" }] }]);
    assert.equal(run([p]).code, 0);
    assert.equal(run([p, "--strict"]).code, 1);
  });

  it("prints JSON with --json", () => {
    const p = write("json.json", [{ question: "q", answer: "a" }]);
    const r = run([p, "--json"]);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed[0].file, p);
    assert.equal(parsed[0].entries, 1);
  });

  it("exits 2 on usage errors and unreadable files", () => {
    assert.equal(run([]).code, 2);
    assert.equal(run(["--bogus", DEMO]).code, 2);
    assert.equal(run([write("bad.json", "[")]).code, 2);
  });

  it("prints help", () => {
    const r = run(["--help"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /usage: faq-check/);
  });
});

describe("helpers", () => {
  it("exitCode and formatText", () => {
    const ok = { file: "f", entries: 1, errors: [], warnings: [{ code: "w", message: "m" }] };
    assert.equal(exitCode([ok], false), 0);
    assert.equal(exitCode([ok], true), 1);
    assert.match(formatText([ok]), /warning \[w\] m/);
  });
});

describe("as a process", () => {
  it("runs from the command line", () => {
    const out = execFileSync(process.execPath, [BIN, DEMO], { encoding: "utf8" });
    assert.match(out, /0 error\(s\)/);
  });
  it("sets a failing exit status", () => {
    const p = write("proc.json", [{ id: "a", question: "q", answer: "a" }, { id: "a", question: "r", answer: "b" }]);
    const r = spawnSync(process.execPath, [BIN, p], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /duplicate-id/);
  });
});
