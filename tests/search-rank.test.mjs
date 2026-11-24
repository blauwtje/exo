import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { rank } from "../skills/search/scripts/rank.mjs";

const now = Date.parse("2026-01-01T00:00:00Z");
const words = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const item = (over) => ({ sub: "Q1", url: "https://a.example/x", source: "hn", title: "t", date: null, quote: words("w", 12), listRank: 0, primary: false, signals: {}, ...over });

test("same canonical url merges, summing RRF terms and uniting signals", () => {
  const { ranked } = rank([
    item({ url: "https://www.a.example/x/", source: "hn", listRank: 0, signals: { points: 5 } }),
    item({ url: "https://a.example/x", source: "reddit", listRank: 1, quote: words("z", 12), signals: { score: 9 } }),
  ], { now, subs: 1 });
  assert.equal(ranked.length, 1);
  assert.deepEqual(Object.keys(ranked[0].signals).sort(), ["points", "score"]);
  assert.ok(Math.abs(ranked[0].rrf - (1 / 61 + 1 / 62)) < 1e-12);
});

test("score uses recency half-life, primary bonus and in-source engagement", () => {
  const { ranked } = rank([
    item({ url: "https://a.example/old", date: "2025-01-01T00:00:00Z", quote: words("a", 12) }),
    item({ url: "https://b.example/new", date: "2026-01-01T00:00:00Z", quote: words("b", 12), primary: true }),
    item({ url: "https://c.example/pop", quote: words("c", 12), signals: { points: 100 } }),
    item({ url: "https://d.example/low", quote: words("d", 12), signals: { points: 0 } }),
  ], { now, halfLifeDays: 365, subs: 1 });
  const byUrl = Object.fromEntries(ranked.map((r) => [r.url, r.score]));
  const base = 1 / 61;
  assert.ok(Math.abs(byUrl["https://a.example/old"] - base * 0.5) < 1e-9);
  assert.ok(Math.abs(byUrl["https://b.example/new"] - base * 1.25) < 1e-9);
  assert.ok(Math.abs(byUrl["https://c.example/pop"] - base * 2) < 1e-9);
  assert.ok(Math.abs(byUrl["https://d.example/low"] - base) < 1e-9);
});

test("near-duplicate quotes drop the lower score", () => {
  const quote = words("same", 20);
  const { ranked, dropped } = rank([
    item({ url: "https://a.example/1", quote, listRank: 0 }),
    item({ url: "https://b.example/2", quote: `${quote} extra`, listRank: 5 }),
  ], { now, subs: 1 });
  assert.deepEqual(ranked.map((r) => r.url), ["https://a.example/1"]);
  assert.deepEqual(dropped.map((r) => r.url), ["https://b.example/2"]);
});

test("diversity pick lifts another domain above a crowding one", () => {
  const { ranked } = rank([
    item({ url: "https://a.example/1", quote: words("p", 12), listRank: 0 }),
    item({ url: "https://a.example/2", sub: "Q2", quote: words("q", 12), listRank: 1 }),
    item({ url: "https://b.example/3", sub: "Q3", quote: words("r", 12), listRank: 2 }),
  ], { now, subs: 3 });
  assert.deepEqual(ranked.map((r) => r.url), ["https://a.example/1", "https://b.example/3", "https://a.example/2"]);
  assert.deepEqual(ranked.map((r) => r.id), ["E1", "E2", "E3"]);
});

test("coverage counts every sub-question and lists the empty ones", () => {
  const { coverage } = rank([item({ sub: "Q2" })], { now, subs: 3 });
  assert.deepEqual(coverage.counts, { Q1: 0, Q2: 1, Q3: 0 });
  assert.deepEqual(coverage.uncovered, ["Q1", "Q3"]);
});

test("CLI writes ranked.json and prints the table and Uncovered lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "rank-"));
  writeFileSync(join(dir, "evidence-1.jsonl"), `${JSON.stringify(item({ title: "Hello" }))}\n`);
  const run = spawnSync(process.execPath, ["skills/search/scripts/rank.mjs", "--run", dir, "--subs", "2"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\| E1 \| Hello \| https:\/\/a\.example\/x \| hn \|/);
  assert.match(run.stdout, /Uncovered: Q2/);
  assert.equal(JSON.parse(readFileSync(join(dir, "ranked.json"), "utf8")).ranked[0].id, "E1");
});
