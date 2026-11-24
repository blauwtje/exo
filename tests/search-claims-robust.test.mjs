import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSource } from "../skills/search/scripts/claims.mjs";

const CLAIMS = new URL("../skills/search/scripts/claims.mjs", import.meta.url).pathname;
const URL_A = "https://example.com/a";

test("a half-written claim record counts as expired and the next sub claims the url", () => {
  const dir = mkdtempSync(join(tmpdir(), "claims-robust-"));
  claimSource(dir, URL_A, "Q1");
  const [name] = readdirSync(join(dir, "claims"));
  writeFileSync(join(dir, "claims", name), '{"url":"https://exam');
  assert.deepEqual(claimSource(dir, URL_A, "Q2"), { claimed: true });
});

test("the command line rejects a sub that does not look like Q1 and writes no claim", () => {
  const dir = mkdtempSync(join(tmpdir(), "claims-robust-"));
  mkdirSync(join(dir, "claims"));
  const result = spawnSync(process.execPath, [CLAIMS, "summary", dir, "notasub", URL_A], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: claims\.mjs summary/);
  assert.deepEqual(readdirSync(join(dir, "claims")), []);
});
