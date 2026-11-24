import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../skills/search/scripts/rank.mjs", import.meta.url).pathname;
const item = (sub, url, quote, listRank) => JSON.stringify({ sub, url, source: "web", title: url, date: "2025-12-03", quote, listRank, primary: false, signals: {} });

test("rank.mjs prints Sources read equal to the distinct evidence urls", () => {
  const dir = mkdtempSync(join(tmpdir(), "rank-count-"));
  const same = "the very same words are quoted on both of these pages today";
  writeFileSync(
    join(dir, "evidence-1.jsonl"),
    [item("Q1", "https://a.example/one", "first page text about apples", 0), item("Q1", "https://a.example/one?utm_source=x", "first page text about apples again", 1), item("Q1", "https://b.example/two", same, 2), item("Q1", "https://c.example/three", same, 3)].join("\n") + "\n",
  );
  writeFileSync(join(dir, "evidence-2.jsonl"), [item("Q2", "https://d.example/four", "fourth page text about pears", 0)].join("\n") + "\n");

  const run = spawnSync(process.execPath, [script, "--run", dir, "--subs", "2"], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Sources read: 4$/m);
});
