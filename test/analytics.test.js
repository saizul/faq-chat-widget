import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVENT_NAME, createEmitter } from "../src/analytics.js";

describe("createEmitter", () => {
  it("calls onEvent with type, timestamp and data", () => {
    const seen = [];
    const emit = createEmitter({ onEvent: (e) => seen.push(e) });
    const returned = emit("question", { text: "price?", matched: true, id: "pricing" });
    assert.equal(seen.length, 1);
    assert.equal(seen[0], returned);
    assert.equal(seen[0].type, "question");
    assert.equal(seen[0].matched, true);
    assert.equal(seen[0].id, "pricing");
    assert.ok(!Number.isNaN(Date.parse(seen[0].at)));
  });

  it("works without any options", () => {
    const emit = createEmitter();
    assert.equal(emit("open").type, "open");
  });

  it("dispatches a bubbling, composed CustomEvent on the target", () => {
    const calls = [];
    const target = { dispatchEvent: (ev) => calls.push(ev) };
    createEmitter({ target })("handoff", { method: "whatsapp", ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, EVENT_NAME);
    assert.equal(calls[0].bubbles, true);
    assert.equal(calls[0].composed, true);
    assert.deepEqual(
      { type: calls[0].detail.type, method: calls[0].detail.method, ok: calls[0].detail.ok },
      { type: "handoff", method: "whatsapp", ok: true },
    );
  });

  it("never throws when a handler or listener fails", () => {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    try {
      const emit = createEmitter({
        onEvent: () => {
          throw new Error("boom");
        },
        target: {
          dispatchEvent: () => {
            throw new Error("nope");
          },
        },
      });
      assert.doesNotThrow(() => emit("close"));
      assert.equal(logged.length, 2);
    } finally {
      console.error = original;
    }
  });

  it("ignores a non-function onEvent", () => {
    assert.doesNotThrow(() => createEmitter({ onEvent: "nope" })("open"));
  });
});
