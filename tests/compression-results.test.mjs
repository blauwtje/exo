import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = new URL("../benchmarks/results/2026-10-08-compression.md", import.meta.url);
const text = readFileSync(file, "utf8");

function rows() {
  const out = {};
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 8 || !["off", "low", "high"].includes(cells[1])) continue;
    const [runs, passes] = [Number(cells[2]), Number(cells[3])];
    out[cells[1]] = { runs, passes, cost: Number(cells[6].replace("$", "")) };
  }
  return out;
}

test("every level has a measured row", () => {
  assert.deepEqual(Object.keys(rows()).sort(), ["high", "low", "off"]);
});

test("pass rate is the same at every level", () => {
  const r = Object.values(rows());
  for (const row of r) assert.equal(row.passes / row.runs, r[0].passes / r[0].runs);
});

test("high costs more than off", () => {
  const { off, high } = rows();
  assert.ok(high.cost > off.cost);
});

test("decision section removes high and keeps low", () => {
  const decision = text.split("## Decision")[1] ?? "";
  assert.match(decision, /`high` is removed/);
  assert.match(decision, /`low` is kept/);
});
