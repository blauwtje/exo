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
import { createServer } from "node:net";
import { close, open } from ${JSON.stringify(reddit)};
await open({ url: "https://www.reddit.com/r/x/comments/1/t/" });
await close();
await open({ url: "https://www.reddit.com/r/x/comments/2/t/" }).catch(() => {});
const lockPort = Number(process.env.SEARCH_REDDIT_PORT) + 1;
await new Promise((resolve, reject) => createServer().once("error", reject).listen(lockPort, "127.0.0.1", function () { this.close(resolve); }));
console.log("lock free");
process.exit(0);
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

async function runDriver() {
  const root = mkdtempSync(join(tmpdir(), "reddit-one-chrome-"));
  const home = join(root, "home");
  const chrome = join(root, "chrome");
  const log = join(root, "log");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), fakePlaywright);
  writeFileSync(join(root, "linux.mjs"), "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  writeFileSync(join(root, "driver.mjs"), driver);
  writeFileSync(log, "");
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);
  const run = await runChild(["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], { SEARCH_REDDIT_HOME: home, CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1", FAKE_LOG: log });
  return { run, events: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}
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


test("a Reddit load queued after close starts no Chrome and takes no lock", async () => {
  const { run, events } = await runDriver();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /lock free/);
  assert.equal(events.filter((event) => event === "connect").length, 1);
});
