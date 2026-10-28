import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gateReply } from "../benchmarks/adhd/gates.mjs";

const rows = (name) =>
  readFileSync(new URL(`../benchmarks/adhd/${name}`, import.meta.url), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line));

const cases = rows("cases.jsonl");
const references = rows("references.jsonl");

test("every case has exactly one reference row", () => {
  assert.deepEqual(references.map((r) => r.id).sort(), cases.map((c) => c.id).sort());
});

for (const testCase of cases) {
  const reference = references.find((r) => r.id === testCase.id);

  test(`${testCase.id}: the good reply passes the gates`, () => {
    assert.deepEqual(gateReply(reference.good, testCase), { pass: true, failed: [] });
  });

  test(`${testCase.id}: the bad reply fails only the gate it breaks`, () => {
    assert.deepEqual(gateReply(reference.bad, testCase).failed, [reference.breaks]);
  });
}
