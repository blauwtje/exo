import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { holdMs, retryWaitMs } from "../skills/search/scripts/reddit.mjs";

const reddit = new URL("../skills/search/scripts/reddit.mjs", import.meta.url).href;

const fakePlaywright = `
const replies = JSON.parse(process.env.FAKE_REPLIES);
let call = 0;
const listing = { data: { children: [{ data: { name: "t3_p", title: "T", subreddit: "x", author: "a", score: 1, num_comments: 0, created_utc: 1700000000, permalink: "/r/x/comments/1/t/", selftext: "", is_self: true } }] } };
const page = {
  goto: async (url) => {
    if (url === "https://old.reddit.com/") return { ok: () => true, status: () => 200, headers: () => ({}) };
    const [status, headers] = replies[Math.min(call++, replies.length - 1)];
    return { ok: () => status < 400, status: () => status, headers: () => headers };
  },
  url: () => "https://old.reddit.com/",
  $$eval: async () => [],
  evaluate: async (fn, [url]) => {
    const [status, headers] = replies[Math.min(call++, replies.length - 1)];
    return { status, headers, landed: url, text: JSON.stringify([listing, { data: { children: [] } }]) };
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
const calls = [];
const record = (label) => calls.push(label);
try {
  if (process.env.DRIVER === "collect") {
    const plan = { days: 30, sources: ["reddit"], skip: new Set(), subreddits: [], subQuestions: [{ ask: "q", terms: ["one"] }] };
    const result = await collect(plan, null, Infinity, 500);
    console.log(JSON.stringify({ failed: result.failed }));
  } else {
    for (let index = 0; index < Number(process.env.OPENS ?? 1); index++) {
      try {
        await open(card);
        record("ok");
      } catch (error) {
        record(error.message);
      }
    }
    console.log(JSON.stringify(calls));
  }
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

async function runDriver(replies, extraEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "reddit-backoff-"));
  const home = join(root, "home");
  const chrome = join(root, "chrome");
  mkdirSync(join(home, "node_modules", "playwright-core"), { recursive: true });
  writeFileSync(join(home, "node_modules", "playwright-core", "index.js"), fakePlaywright);
  writeFileSync(join(root, "linux.mjs"), "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
  writeFileSync(join(root, "driver.mjs"), driver);
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);
  const run = await runChild(["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], { SEARCH_REDDIT_HOME: home, CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1", FAKE_REPLIES: JSON.stringify(replies), ...extraEnv });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split("\n").at(-1));
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


test("a 429 retries after the Retry-After wait", async () => {
  const [label] = await runDriver([[429, { "retry-after": "0" }], [200, {}]]);
  assert.equal(label, "ok");
});

test("a 429 wait is Retry-After, else x-ratelimit-reset, else the backoff default", () => {
  assert.equal(retryWaitMs({ "retry-after": "1" }, 600), 1000);
  assert.equal(retryWaitMs({ "x-ratelimit-reset": "1" }, 5000), 1000);
  assert.equal(retryWaitMs({}, 600), 600);
  assert.equal(retryWaitMs({ "retry-after": "0" }, 600), 0);
});

test("a 429 without Retry-After retries after the backoff default", async () => {
  const [label] = await runDriver([[429, {}], [200, {}]], { EXO_SEARCH_REDDIT_BACKOFF_MS: "1" });
  assert.equal(label, "ok");
});

test("a request fails naming the 429 after two retries", async () => {
  const [label] = await runDriver([[429, { "retry-after": "0" }]]);
  assert.match(label, /429.*after 2 retries/);
});

test("the hold after a response with no requests remaining is x-ratelimit-reset", async () => {
  assert.equal(holdMs({ "x-ratelimit-reset": "1" }), 1000);
  assert.equal(holdMs({}), 0);
  const calls = await runDriver([[200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" }], [200, {}]], { OPENS: "2" });
  assert.deepEqual(calls, ["ok", "ok"]);
});

test("a 429 wait that passes the call deadline fails the request instead of waiting", async () => {
  const { failed } = await runDriver([[429, { "retry-after": "30" }]], { DRIVER: "collect" });
  assert.ok(failed.some((message) => /429.*deadline/.test(message)), failed.join("\n"));
});
