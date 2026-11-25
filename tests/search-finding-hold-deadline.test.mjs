import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { nextGapMs } from "../skills/search/scripts/reddit.mjs";

const reddit = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).href;

const fakePlaywright = `
const listing = { data: { children: [{ data: { name: "t3_p", title: "T", subreddit: "x", author: "a", score: 1, num_comments: 0, created_utc: 1700000000, permalink: "/r/x/comments/1/t/", selftext: "", is_self: true } }] } };
let call = 0;
const page = {
  goto: async () => ({ ok: () => true, status: () => 200, headers: () => ({}) }),
  url: () => "https://old.reddit.com/",
  $$eval: async () => [],
  evaluate: async (fn, [url]) => {
    const headers = call++ === 0 ? { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "100000" } : {};
    return { status: 200, headers, landed: url, text: JSON.stringify([listing, { data: { children: [] } }]) };
  },
};
const context = { pages: () => [page], waitForEvent: async () => page };
exports.chromium = {
  connectOverCDP: async () => ({ contexts: () => [context], newBrowserCDPSession: async () => ({ send: async () => {} }) }),
};
`;

const driver = `
import { close, collect, open } from ${JSON.stringify(reddit)};
const card = { url: "https://www.reddit.com/r/x/comments/1/t/" };
try {
  await collect({ days: 30, sources: ["reddit"], skip: new Set(), subreddits: [], subQuestions: [] }, null, Infinity, 1500);
  await open(card);
  await open(card);
  console.log(JSON.stringify("done"));
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


test("a rate-limit hold never makes the queue wait past the call deadline", async () => {
  const root = mkdtempSync(join(tmpdir(), "reddit-hold-"));
  const home = join(root, "home");
  const chrome = join(root, "chrome");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), fakePlaywright);
  writeFileSync(join(root, "linux.mjs"), "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  writeFileSync(join(root, "driver.mjs"), driver);
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);
  const run = await runChild(["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], { SEARCH_REDDIT_HOME: home, CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout.trim().split("\n").at(-1)), "done");
});

test("the gap after a request is the hold cut to the time left before the call deadline", () => {
  assert.equal(nextGapMs(1, 8000, 11500, 10000), 1500);
  assert.equal(nextGapMs(1, 0, 11500, 10000), 1);
  assert.equal(nextGapMs(1, 8000, 9000, 10000), 1);
  assert.equal(nextGapMs(2000, 500, 11500, 10000), 2000);
});
