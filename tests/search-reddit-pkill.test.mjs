import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).pathname;

test("macOS stopChrome pkill pattern matches only its own profile", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync(join(tmpdir(), "reddit-pkill-"));
  const home = join(root, "home.v1");
  const bin = join(root, "bin");
  const record = join(root, "pkill-args");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), "exports.chromium = { connectOverCDP: () => Promise.reject(new Error('down')) };\n");
  writeFileSync(join(bin, "open"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(bin, "pkill"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${record}"\n`);
  chmodSync(join(bin, "open"), 0o755);
  chmodSync(join(bin, "pkill"), 0o755);

  spawnSync(process.execPath, [script, "login"], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SEARCH_REDDIT_HOME: home, EXO_SEARCH_CHROME_START_MS: "250" },
    encoding: "utf8",
  });

  const pattern = new RegExp(readFileSync(record, "utf8").trim().split("\n").at(-1));
  assert.ok(pattern.test(`Chrome --user-data-dir=${join(home, "profile")} --no-first-run`), "own profile must match");
  assert.ok(!pattern.test(`Chrome --user-data-dir=${join(home, "profile-2")} --no-first-run`), "sibling profile-2 must not match");
  assert.ok(!pattern.test(`Chrome --user-data-dir=${join(root, "homeXv1", "profile")} --no-first-run`), "dot must not match any character");
});
