import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoMetrics } from "../benchmarks/adhd/metrics.mjs";

const rows = (name) =>
  readFileSync(new URL(`../benchmarks/adhd/${name}`, import.meta.url), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line));

const cases = rows("cases.jsonl");
const references = rows("references.jsonl");

const METRIC_OF = {
  lead: "answerFirst",
  opener: "answerFirst",
  deliverable: "cleanDeliverable",
  question: "questionLast",
  literals: "factsKept",
};

const scored = (swap = {}) =>
  cases.map((testCase) => {
    const reference = references.find((r) => r.id === testCase.id);
    return { testCase, reply: swap[testCase.id] ?? reference.good, ratio: 0.5, missing: [] };
  });

test("every good reference reply scores 100% on the four rate metrics", () => {
  assert.deepEqual(repoMetrics(scored()), {
    medianRatio: 0.5,
    answerFirst: 100,
    cleanDeliverable: 100,
    questionLast: 100,
    factsKept: 100,
  });
});

for (const reference of references.filter((r) => METRIC_OF[r.breaks])) {
  test(`${reference.id}: the bad reply lowers ${METRIC_OF[reference.breaks]}`, () => {
    const metrics = repoMetrics(scored({ [reference.id]: reference.bad }));
    assert.ok(metrics[METRIC_OF[reference.breaks]] < 100);
  });
}

test("a heading or recap break leaves every rate metric at 100%", () => {
  const swap = Object.fromEntries(
    references.filter((r) => ["heading", "recap"].includes(r.breaks)).map((r) => [r.id, r.bad]),
  );
  const { medianRatio, ...rates } = repoMetrics(scored(swap));
  assert.deepEqual(Object.values(rates), [100, 100, 100, 100]);
});

test("a fact the judge reports missing lowers factsKept", () => {
  const rowsWithMiss = scored();
  rowsWithMiss[0].missing = [1];
  assert.equal(repoMetrics(rowsWithMiss).factsKept, 100 - 100 / cases.length);
});

test("medianRatio is the median of the per-case ratios", () => {
  const ratios = [0.9, 0.3, 0.6, 1.2];
  const four = scored().slice(0, 4).map((row, i) => ({ ...row, ratio: ratios[i] }));
  assert.equal(repoMetrics(four).medianRatio, 0.75);
});

test("a rate with no applicable case is null", () => {
  const noAsk = scored().filter((row) => !row.testCase.ask && row.testCase.deliverable === undefined);
  const metrics = repoMetrics(noAsk);
  assert.equal(metrics.questionLast, null);
  assert.equal(metrics.cleanDeliverable, null);
});
