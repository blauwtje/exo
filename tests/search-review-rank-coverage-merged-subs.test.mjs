import test from "node:test";
import assert from "node:assert/strict";
import { rank } from "../skills/search/scripts/rank.mjs";

const now = Date.parse("2026-01-01T00:00:00Z");
const words = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const item = (over) => ({ sub: "Q1", url: "https://a.example/x", source: "hn", title: "t", date: null, quote: words("w", 12), listRank: 0, primary: false, signals: {}, ...over });

test("a url found by two sub-questions covers both", () => {
  const { coverage } = rank([
    item({ sub: "Q1", source: "hn" }),
    item({ sub: "Q2", source: "reddit" }),
  ], { now, subs: 2 });
  assert.deepEqual(coverage.uncovered, []);
  assert.deepEqual(coverage.counts, { Q1: 1, Q2: 1 });
});
