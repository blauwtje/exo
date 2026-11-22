import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).pathname;

test("a Chrome that cannot be spawned fails at once with the CHROME_PATH message", () => {
  const root = mkdtempSync(join(tmpdir(), "reddit-spawn-"));
  const home = join(root, "home");
  const preload = join(root, "linux.mjs");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), "exports.chromium = { connectOverCDP: () => Promise.reject(new Error('down')) };\n");
  writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  const missing = join(root, "no-such-chrome");

  const started = Date.now();
  const run = spawnSync(process.execPath, ["--import", preload, script, "login"], {
    env: { ...process.env, SEARCH_REDDIT_HOME: home, CHROME_PATH: missing, EXO_SEARCH_CHROME_START_MS: "20000" },
    encoding: "utf8",
    timeout: 8000,
  });

  assert.ok(Date.now() - started < 8000, "must not wait for the start deadline");
  assert.match(run.stderr, /Chrome did not start from .*no-such-chrome: set CHROME_PATH\. \(.*ENOENT/);
});
