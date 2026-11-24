import test from "node:test";
import assert from "node:assert/strict";
import { rank } from "../skills/search/scripts/rank.mjs";

const now = Date.parse("2026-01-01T00:00:00Z");
const words = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const item = (over) => ({ sub: "Q1", url: "https://a.example/x", source: "stackexchange", title: "t", date: null, quote: words("w", 12), listRank: 0, primary: false, signals: {}, ...over });

test("a negative signal is a neutral factor and the score stays finite", () => {
  const { ranked } = rank([
    item({ url: "https://a.example/neg", quote: words("a", 12), signals: { score: -3 } }),
    item({ url: "https://b.example/pos", quote: words("b", 12), listRank: 1, signals: { score: 10 } }),
  ], { now, subs: 1 });
  for (const entry of ranked) {
    assert.ok(Number.isFinite(entry.score), `score for ${entry.url} is ${entry.score}`);
    for (const value of Object.values(entry.engagement)) assert.ok(Number.isFinite(value) && value >= 0, `engagement for ${entry.url} is ${value}`);
  }
});
