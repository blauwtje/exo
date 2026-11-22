import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const reddit = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).href;

const fakePlaywright = `
const { appendFileSync } = require("node:fs");
const log = (event) => appendFileSync(process.env.FAKE_LOG, event + "\\n");
let thread = 0;
const page = {
  goto: async (url) => (log("goto " + url), { ok: () => true, status: () => 200, headers: () => ({}) }),
  url: () => "https://old.reddit.com/",
  $$eval: async () => [{ url: "https://old.reddit.com/r/x/comments/1/t/", title: "t", facts: "f" }],
  evaluate: async (fn, [url]) => {
    log("fetch " + url);
    const status = process.env.FAKE_429_FIRST && thread++ === 0 ? 429 : 200;
    const listing = { data: { children: [{ data: { name: "t3_p", title: "T", subreddit: "x", author: "a", score: 1, num_comments: 0, created_utc: 1700000000, permalink: "/r/x/comments/1/t/", selftext: "", is_self: true } }] } };
    const text = JSON.stringify([listing, { data: { children: [] } }]);
    return { status, headers: status === 429 ? { "retry-after": "0" } : {}, landed: url, text };
  },
};
const context = { pages: () => [page], waitForEvent: async () => page };
exports.chromium = {
  connectOverCDP: async () => {
    log("connect");
    return { contexts: () => [context], newBrowserCDPSession: async () => ({ send: async (method) => log("send " + method) }) };
  },
};
`;

const driver = `
import { close, find } from ${JSON.stringify(reddit)};
const plan = { days: 30, subreddits: [], subQuestions: [{ ask: "q", terms: ["one two"] }] };
const found = await find(plan);
await close();
console.log(JSON.stringify(found.failed));
`;

const freePort = () => new Promise((resolve) => {
  const server = createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

test("a second process waits for the Chrome lock past EXO_SEARCH_LOCK_MS without losing its Reddit results", async () => {
  const root = mkdtempSync(join(tmpdir(), "reddit-lock-wait-"));
  const home = join(root, "home");
  const chrome = join(root, "chrome");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), fakePlaywright);
  writeFileSync(join(root, "linux.mjs"), "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  writeFileSync(join(root, "driver.mjs"), driver);
  writeFileSync(join(root, "log"), "");
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);
  const port = await freePort();
  const holder = createServer((socket) => socket.destroy());
  await new Promise((resolve) => holder.listen(port + 1, "127.0.0.1", resolve));
  setTimeout(() => holder.close(), 2000);
  const child = spawn(process.execPath, ["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], {
    env: { ...process.env, SEARCH_REDDIT_HOME: home, SEARCH_REDDIT_PORT: String(port), CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1", EXO_SEARCH_LOCK_MS: "500", FAKE_LOG: join(root, "log") },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const status = await new Promise((resolve) => child.once("close", resolve));
  holder.close();
  assert.equal(status, 0, stderr);
  assert.equal(stdout.trim(), "[]", `Reddit search failed while another process held the lock: ${stdout}`);
});
