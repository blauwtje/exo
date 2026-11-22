import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapters, newRun, parsePlan, rounds } from "../skills/search/scripts/search.mjs";

const planText = (extra = {}) =>
  JSON.stringify({ question: "How do hooks work?", subQuestions: [{ ask: "what runs", terms: ["hook events"] }], sources: ["hn"], ...extra });

function withSource(collect, body) {
  const saved = { ...adapters };
  adapters.hn = { collect };
  return Promise.resolve(body()).finally(() => Object.assign(adapters, saved));
}

const oneRead = (index) => ({ read: [{ url: `u${index}`, text: `T${index}`, subs: [1] }], found: 1, failed: [], state: index, done: false });

test("rounds repeat while the end line is More and the time left allows another round", async () => {
  const deadlines = [];
  let calls = 0;
  await withSource(async (plan, state, limit, deadline) => { deadlines.push(deadline); return oneRead(++calls); }, async () => {
    const plan = parsePlan(planText({ reads: 3 }));
    const file = join(mkdtempSync(join(tmpdir(), "search-rounds-")), "run.json");
    const texts = await rounds(plan, newRun({}), file, 100000);
    assert.equal(texts.length, 3);
    assert.doesNotMatch(texts[0], /More:/);
    assert.match(texts[2], /\nDone: read 3 of 3\.$/);
    assert.ok(deadlines[1] <= deadlines[0] && deadlines[0] <= 100000);
    assert.match(readFileSync(join(file, "..", "run.md"), "utf8"), /\nMore: read 1 of 3\. Continue:[^\n]*\n[\s\S]*\nMore: read 2 of 3\. Continue:/);
  });
});

test("rounds stop with More when the time left is under 1.5 times the last round", async () => {
  await withSource(() => new Promise((resolve) => setTimeout(() => resolve(oneRead(1)), 40)), async () => {
    const plan = parsePlan(planText({ reads: 5 }));
    const file = join(mkdtempSync(join(tmpdir(), "search-rounds-")), "run.json");
    const texts = await rounds(plan, newRun({}), file, 80);
    assert.equal(texts.length, 1);
    assert.match(texts[0], /\nMore: read 1 of 5\. Continue:/);
  });
});
