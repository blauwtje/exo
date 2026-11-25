import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

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
  const result = await find(plan);
  console.error(JSON.stringify({ failed: result.failed }));
} finally {
  await close();
}
`;

const listenOnce = (port) => new Promise((resolve) => {
  const server = createServer().once("error", () => resolve(null)).listen(port, "127.0.0.1", () => {
    const { port: bound } = server.address();
    server.close(() => resolve(bound));
  });
});

const freePort = async () => {
  for (;;) {
    const port = await listenOnce(0);
    if (await listenOnce(port + 1)) return port;
  }
};
async function runChild(args, env) {
  for (;;) {
    const child = spawn(process.execPath, args, { env: { ...process.env, ...env, SEARCH_REDDIT_PORT: String(await freePort()) } });
    let stdout = "";
    let stderr = "";
    let taken = false;
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("Waiting for the Chrome lock")) {
        taken = true;
        child.kill();
      }
    });
    const status = await new Promise((resolve) => child.once("close", resolve));
    if (!taken) return { status, stdout, stderr };
  }
}


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
  const run = await runChild(["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], { SEARCH_REDDIT_HOME: home, CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1", EXO_SEARCH_REDDIT_BACKOFF_MS: "1" });
  const { searchGotos } = JSON.parse(run.stdout.trim().split("\n").at(-1));
  const { failed } = JSON.parse(run.stderr.trim().split("\n").at(-1));
  assert.equal(searchGotos, 2, `goto ran ${searchGotos} time(s); failed: ${failed}`);
  assert.deepEqual(failed, []);
});
