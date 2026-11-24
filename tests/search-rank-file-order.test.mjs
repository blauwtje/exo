import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../skills/search/scripts/rank.mjs", import.meta.url).pathname;
const shared = "https://github.com/simonhaenisch/md-to-pdf";
const repo = (sub, url) => JSON.stringify({ sub, url, source: "github", title: "repo", date: "2025-12-03", quote: `${sub} ${url}`, listRank: 0, primary: true, signals: {} });

test("rank.mjs gives an unclaimed shared url to the lowest sub number, Q2 before Q10", () => {
  const dir = mkdtempSync(join(tmpdir(), "rank-order-"));
  writeFileSync(join(dir, "evidence-2.jsonl"), `${repo("Q2", shared)}\n`);
  writeFileSync(join(dir, "evidence-10.jsonl"), `${repo("Q10", shared)}\n`);

  const run = spawnSync(process.execPath, [script, "--run", dir, "--subs", "10"], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Taken: https:\/\/github\.com\/simonhaenisch\/md-to-pdf \(Q2\)$/m);
  assert.ok(readFileSync(join(dir, "evidence-2.jsonl"), "utf8").includes(shared));
  assert.ok(!readFileSync(join(dir, "evidence-10.jsonl"), "utf8").includes(shared));
});
