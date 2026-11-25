import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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
const started = Date.now();
const record = (label) => calls.push([label, Date.now() - started]);
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

const freePort = () => new Promise((resolve) => {
  const server = createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

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
  const run = spawnSync(process.execPath, ["--import", join(root, "linux.mjs"), join(root, "driver.mjs")], {
    env: { ...process.env, SEARCH_REDDIT_HOME: home, SEARCH_REDDIT_PORT: String(await freePort()), CHROME_PATH: chrome, EXO_SEARCH_REDDIT_GAP_MS: "1", FAKE_REPLIES: JSON.stringify(replies), ...extraEnv },
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split("\n").at(-1));
}

test("a 429 waits the Retry-After seconds before the retry", async () => {
  const [[label, elapsed]] = await runDriver([[429, { "retry-after": "1" }], [200, {}]]);
  assert.equal(label, "ok");
  assert.ok(elapsed >= 990, `elapsed ${elapsed}`);
});

test("a 429 without Retry-After waits x-ratelimit-reset, else the backoff default", async () => {
  const [[, byReset]] = await runDriver([[429, { "x-ratelimit-reset": "1" }], [200, {}]], { EXO_SEARCH_REDDIT_BACKOFF_MS: "5000" });
  assert.ok(byReset >= 990 && byReset < 4000, `elapsed ${byReset}`);
  const [[, byDefault]] = await runDriver([[429, {}], [200, {}]], { EXO_SEARCH_REDDIT_BACKOFF_MS: "600" });
  assert.ok(byDefault >= 600 && byDefault < 4000, `elapsed ${byDefault}`);
});

test("a request fails naming the 429 after two retries", async () => {
  const [[label]] = await runDriver([[429, { "retry-after": "0" }]]);
  assert.match(label, /429.*after 2 retries/);
});

test("a response with no requests remaining holds the next request for x-ratelimit-reset", async () => {
  const calls = await runDriver([[200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1" }], [200, {}]], { OPENS: "2" });
  assert.ok(calls[1][1] - calls[0][1] >= 900, JSON.stringify(calls));
});

test("a 429 wait that passes the call deadline fails the request instead of waiting", async () => {
  const started = Date.now();
  const { failed } = await runDriver([[429, { "retry-after": "30" }]], { DRIVER: "collect" });
  assert.ok(Date.now() - started < 10000);
  assert.ok(failed.some((message) => /429.*deadline/.test(message)), failed.join("\n"));
});
