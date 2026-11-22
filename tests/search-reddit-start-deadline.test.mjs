import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).pathname;

test("a connect attempt that hangs cannot hold the Chrome start wait past its deadline", () => {
  const root = mkdtempSync(join(tmpdir(), "reddit-deadline-"));
  const home = join(root, "home");
  const preload = join(root, "linux.mjs");
  const chrome = join(root, "chrome");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(
    join(home, "node_modules", "playwright-core", "index.js"),
    "exports.chromium = { connectOverCDP: (url, options) => new Promise((resolve, reject) => setTimeout(() => reject(new Error('connect timed out')), options?.timeout ?? 60000)) };\n",
  );
  writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);

  const started = Date.now();
  const run = spawnSync(process.execPath, ["--import", preload, script, "login"], {
    env: { ...process.env, SEARCH_REDDIT_HOME: home, CHROME_PATH: chrome, EXO_SEARCH_CHROME_START_MS: "1000" },
    encoding: "utf8",
    timeout: 8000,
  });

  assert.ok(Date.now() - started < 3000, "must stop within one pause of the start deadline");
  assert.match(run.stderr, /Chrome did not start from .*chrome: set CHROME_PATH\. \(connect timed out\)/);
});
