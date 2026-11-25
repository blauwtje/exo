import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapters, newRun, parseSearchPlan, rounds } from "../skills/search/scripts/search.mjs";

test("a multi-round call prints one Continue line, on the last line", async () => {
  const saved = { ...adapters };
  let calls = 0;
  adapters.hn = { collect: async () => new Promise((resolve) => setTimeout(() => resolve({ read: [{ url: `u${++calls}`, text: `T${calls}`, subs: [1] }], found: 1, failed: [], state: calls, done: false }), 40)) };
  try {
    const plan = parseSearchPlan(JSON.stringify({ question: "q", subQuestions: [{ ask: "a", terms: ["hook events"] }], sources: ["hn"], reads: 10 }));
    const file = join(mkdtempSync(join(tmpdir(), "search-one-continue-")), "run.json");
    const texts = await rounds(plan, newRun({}), file, 200);
    assert.ok(texts.length > 1);
    const output = texts.join("\n\n");
    assert.equal(output.split("Continue:").length - 1, 1);
    assert.match(output.split("\n").at(-1), /^More: .*Continue:/);
  } finally {
    Object.assign(adapters, saved);
  }
});
