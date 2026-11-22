import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const reddit = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).href;

const fakePlaywright = `
let searchGotos = 0;
const ok = { ok: () => true, status: () => 200, headers: () => ({}) };
const page = {
  goto: async (url) => {
    if (url === "https://old.reddit.com/") return ok;
    if (searchGotos++ === 0) throw new Error("page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at " + url);
    return ok;
  },
  url: () => "https://old.reddit.com/",
  $$eval: async () => [{ url: "https://old.reddit.com/r/x/comments/1/t/", title: "t", facts: "f" }],
};
process.on("exit", () => console.log(JSON.stringify({ searchGotos })));
const context = { pages: () => [page], waitForEvent: async () => page };
exports.chromium = {
  connectOverCDP: async () => ({ contexts: () => [context], newBrowserCDPSession: async () => ({ send: async () => {} }) }),
};
`;

const driver = `
import { close, find } from ${JSON.stringify(reddit)};
try {
  const plan = { days: 30, sources: ["reddit"], skip: new Set(), subreddits: [], subQuestions: [{ ask: "q", terms: ["one"] }] };
  const started = Date.now();
  const result = await find(plan);
  console.error(JSON.stringify({ failed: result.failed, elapsed: Date.now() - started }));
} finally {
  await close();
}
`;

const freePort = () => new Promise((resolve) => {
  const server = createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

test("a goto that fails with ERR_HTTP_RESPONSE_CODE_FAILURE is retried after the backoff", async () => {
  const root = mkdtempSync(join(tmpdir(), "reddit-goto-429-"));
  const home = join(root, "home");
  const chrome = join(root, "chrome");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), fakePlaywright);
  writeFileSync(join(root, "linux.mjs"), "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  writeFileSync(join(root, "driver.mjs"), driver);
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);
  const run = spawnSync(process.execPath, ["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], {
    env: { ...process.env, SEARCH_REDDIT_HOME: home, SEARCH_REDDIT_PORT: String(await freePort()), CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1", EXO_SEARCH_REDDIT_BACKOFF_MS: "600" },
    encoding: "utf8",
    timeout: 20000,
  });
  const { searchGotos } = JSON.parse(run.stdout.trim().split("\n").at(-1));
  const { failed, elapsed } = JSON.parse(run.stderr.trim().split("\n").at(-1));
  assert.equal(searchGotos, 2, `goto ran ${searchGotos} time(s); failed: ${failed}`);
  assert.deepEqual(failed, []);
  assert.ok(elapsed >= 600, `elapsed ${elapsed}`);
});
