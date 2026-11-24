import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../skills/search/scripts/rank.mjs", import.meta.url).pathname;
const good = { url: "https://example.com/a", title: "A", sub: "Q1", sources: ["web"], date: "2026-01-01" };

for (const [name, lines] of [
  ["truncated JSON line", [JSON.stringify(good), '{"url": "https://example.com/b", "ti']],
  ["item with no url or sub", [JSON.stringify(good), JSON.stringify({ title: "no keys" })]],
]) {
  test(`rank.mjs --run skips a ${name} with a Skipped line and writes ranked.json`, () => {
    const dir = mkdtempSync(join(tmpdir(), "rank-bad-"));
    writeFileSync(join(dir, "evidence-1.jsonl"), lines.join("\n") + "\n");
    const run = spawnSync(process.execPath, [script, "--run", dir], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr.split("\n").slice(0, 4).join("\n"));
    assert.match(run.stdout + run.stderr, /Skipped:/);
    assert.ok(existsSync(join(dir, "ranked.json")));
  });
}
