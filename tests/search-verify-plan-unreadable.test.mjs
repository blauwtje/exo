import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../skills/search/scripts/verify.mjs", import.meta.url));
const bundleText = "See https://example.com/a for more";

const verifyWithPlan = (planText) => {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  const ranked = join(dir, "ranked.json");
  writeFileSync(ranked, JSON.stringify({ ranked: [{ id: "E1" }] }));
  writeFileSync(join(dir, "plan.json"), planText);
  const bundle = join(dir, "bundle.md");
  writeFileSync(bundle, bundleText);
  return spawnSync("node", [script, "--ranked", ranked, bundle], { input: "Claim [E1] https://example.com/a", encoding: "utf8" });
};

test("a plan.json that does not parse means no hosts check", () => {
  const result = verifyWithPlan("{not json");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("a hosts value that is not an array means no hosts check", () => {
  const result = verifyWithPlan(JSON.stringify({ hosts: "github.com" }));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
