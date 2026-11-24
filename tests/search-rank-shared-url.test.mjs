import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../skills/search/scripts/rank.mjs", import.meta.url).pathname;
const shared = "https://github.com/simonhaenisch/md-to-pdf";
const repo = (sub, url, listRank) => JSON.stringify({ sub, url, source: "github", title: new URL(url).pathname.slice(1), date: "2025-12-03", quote: `${url} converts markdown to pdf`, listRank, primary: true, signals: { stars: 1990 } });

test("rank.mjs keeps a url another sub claimed only in the claimer's evidence and prints Taken", () => {
  const dir = mkdtempSync(join(tmpdir(), "rank-shared-"));
  writeFileSync(join(dir, "evidence-1.jsonl"), [repo("Q1", shared, 0), repo("Q1", "https://github.com/elliotblackburn/mdpdf", 1)].join("\n") + "\n");
  writeFileSync(join(dir, "evidence-2.jsonl"), [repo("Q2", "https://github.com/jgm/pandoc", 0), repo("Q2", shared, 5)].join("\n") + "\n");
  mkdirSync(join(dir, "claims"));
  writeFileSync(
    join(dir, "claims", "1dfc6df1ffcb0d0568461b0e746adb8aeb65bdd8.0.json"),
    JSON.stringify({ url: "github.com/simonhaenisch/md-to-pdf", sha1: "1dfc6df1ffcb0d0568461b0e746adb8aeb65bdd8", sub: "Q1", pid: 1, leaseUntil: null, status: "ok" }),
  );

  const run = spawnSync(process.execPath, [script, "--run", dir, "--subs", "2"], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Taken: https:\/\/github\.com\/simonhaenisch\/md-to-pdf \(Q1\)$/m);
  assert.ok(readFileSync(join(dir, "evidence-1.jsonl"), "utf8").includes(shared));
  assert.ok(!readFileSync(join(dir, "evidence-2.jsonl"), "utf8").includes(shared));
  assert.ok(readFileSync(join(dir, "evidence-2.jsonl"), "utf8").includes("https://github.com/jgm/pandoc"));
});
