import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { find, open, paced, threadDoc, timeBucket, withLock } from "../skills/search/scripts/reddit.mjs";

const plan = {
  days: 30,
  subreddits: ["claudeai", "cursor"],
  subQuestions: [
    { ask: "first", terms: ["alpha", "beta"] },
    { ask: "second", terms: ["gamma", "delta"] },
  ],
};

const comment = (id, body, replies) => ({
  kind: "t1",
  data: { id, name: `t1_${id}`, author: `u${id}`, score: 5, body, permalink: `/r/x/comments/p/t/${id}/`, replies: replies ? { kind: "Listing", data: { children: replies } } : "" },
});

const listing = {
  data: {
    children: [
      { data: { name: "t3_p", title: "A post", subreddit: "x", author: "ann", score: 9, num_comments: 2, created_utc: 1700000000, permalink: "/r/x/comments/p/t/", selftext: "Body", is_self: true } },
    ],
  },
};

test("timeBucket maps days to Reddit's time filters", () => {
  assert.deepEqual([1, 7, 31, 366, 400].map(timeBucket), ["day", "week", "month", "year", "all"]);
});

test("find searches each first term site-wide, then each term once over all named subreddits", async () => {
  const urls = [];
  const { lists } = await find(plan, async (url) => {
    urls.push(new URL(url));
    return [{ url, title: "t", facts: "f" }];
  });
  assert.equal(lists.length, 6);
  assert.deepEqual(
    urls.map((url) => [url.searchParams.get("q"), url.pathname]),
    [
      ["alpha", "/search"],
      ["gamma", "/search"],
      ["alpha", "/r/claudeai+cursor/search"],
      ["beta", "/r/claudeai+cursor/search"],
      ["gamma", "/r/claudeai+cursor/search"],
      ["delta", "/r/claudeai+cursor/search"],
    ],
  );
  assert.deepEqual(urls.map((url) => url.searchParams.get("restrict_sr")), [null, null, ...Array(4).fill("on")]);
  assert.ok(urls.every((url) => url.searchParams.get("sort") === "top" && url.searchParams.get("t") === "month"));
});

test("find keeps the first 40 searches and reports how many it dropped", async () => {
  const subQuestions = Array.from({ length: 20 }, (_, index) => ({ ask: `q${index}`, terms: [`a${index}`, `b${index}`] }));
  const urls = [];
  const { failed } = await find({ ...plan, subQuestions }, async (url) => urls.push(url) && [{ url, title: "t", facts: "f" }]);
  assert.equal(urls.length, 40);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /^dropped 20 of 60 searches: limit is 40: "a10" in r\/claudeai\+cursor, "b10" in r\/claudeai\+cursor/);
});

test("find without subreddits only searches site-wide", async () => {
  const urls = [];
  await find({ ...plan, subreddits: [] }, async (url) => urls.push(url) && []);
  assert.equal(urls.length, 2);
});

test("find reads cards from the results page", async () => {
  const rows = [{ url: "u", title: "t", facts: "f" }];
  const { lists } = await find({ ...plan, subreddits: [] }, (url, read) => read({ $$eval: async () => rows }));
  assert.deepEqual(lists, [rows, rows]);
});

test("find keeps the searches that succeeded and reports each failed one", async () => {
  const { lists, failed } = await find({ ...plan, subreddits: [] }, async (url) => {
    if (new URL(url).searchParams.get("q") === "gamma") throw new Error("Reddit answered 429");
    return [];
  });
  assert.equal(lists.length, 1);
  assert.equal(failed.length, 2);
  assert.match(failed[0], /^no hits: "alpha" on all of Reddit$/);
  assert.match(failed[1], /^search failed: .*429/);
});

test("find labels a search without hits with its term and where it searched", async () => {
  const { failed } = await find(plan, async () => []);
  assert.equal(failed.length, 6);
  assert.equal(failed[0], 'no hits: "alpha" on all of Reddit');
  assert.equal(failed[2], 'no hits: "alpha" in r/claudeai+cursor');
});

test("the results scraper skips a result that has no title link", async () => {
  const anchor = { href: "https://old.reddit.com/r/x/comments/1/t/", textContent: " T " };
  const result = (link) => ({ querySelector: (selector) => (selector === "a.search-title" ? link : null) });
  const { lists } = await find({ ...plan, subreddits: [] }, (url, read) => read({ $$eval: async (selector, scrape) => scrape([result(null), result(anchor)]) }));
  assert.deepEqual(lists[0], [{ url: anchor.href, title: "T", facts: " |  |  | " }]);
});

test("threadDoc turns a thread into a header and labelled passages without removed comments", () => {
  const comments = { data: { children: [comment("a", "first", [comment("b", "[removed]", [comment("c", "deep")])])] } };
  const { header, passages } = threadDoc(listing, comments);
  assert.match(header, /^A post\nr\/x \| u\/ann \| 9 points \| 2 comments \| 2023-11-14\nhttps:\/\/www.reddit.com\/r\/x\/comments\/p\/t\//);
  assert.match(header, /Body/);
  assert.deepEqual(passages.map(({ id, parent, label }) => [id, parent, label]), [["a", null, "u/ua"], ["c", "a", "u/uc"]]);
});

test("open loads the thread json url and returns its document", async () => {
  const comments = { data: { children: [comment("a", "first")] } };
  let requested;
  const doc = await open({ url: "https://www.reddit.com/r/x/comments/p/t/" }, async (url) => {
    requested = new URL(url);
    return [listing, comments];
  });
  assert.equal(requested.hostname, "old.reddit.com");
  assert.equal(requested.pathname, "/r/x/comments/p/t.json");
  assert.deepEqual(doc.passages.map(({ id }) => id), ["a"]);
});

test("paced runs one task at a time and waits the gap after each", async () => {
  const run = paced(50);
  const events = [];
  const task = (name) => async () => {
    events.push(`${name} start ${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push(`${name} end ${Date.now()}`);
  };
  await Promise.all([run(task("a")), run(task("b"))]);
  const [aStart, aEnd, bStart] = events.map((event) => Number(event.split(" ")[2]));
  assert.ok(aEnd >= aStart + 10);
  assert.ok(bStart >= aEnd + 45);
});

test("paced keeps running after a task fails", async () => {
  const run = paced(1);
  await assert.rejects(run(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await run(async () => "ok"), "ok");
});

const freePort = () => new Promise((resolve) => {
  const server = createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

test("withLock runs tasks on one port one at a time", async () => {
  const lockPort = await freePort();
  const events = [];
  const task = (name) => async () => {
    events.push(`start ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    events.push(`end ${name}`);
  };
  await Promise.all([withLock(lockPort, task("a")), withLock(lockPort, task("b"))]);
  const [first, second] = events[0] === "start a" ? ["a", "b"] : ["b", "a"];
  assert.deepEqual(events, [`start ${first}`, `end ${first}`, `start ${second}`, `end ${second}`]);
});

test("withLock runs at once after the process that held it is killed", { timeout: 5000 }, async () => {
  const lockPort = await freePort();
  const holder = spawn(process.execPath, ["--input-type=module", "-e", `
    import { connect, createServer } from "node:net";
    createServer().listen(${lockPort}, "127.0.0.1", () => console.log("held"));
  `], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve) => holder.stdout.once("data", resolve));
  holder.kill("SIGKILL");
  assert.equal(await withLock(lockPort, async () => "ran"), "ran");
});

test("withLock returns when a client is still connected to its port", { timeout: 5000 }, async () => {
  const lockPort = await freePort();
  const task = () => new Promise((resolve) => {
    const client = connect(lockPort, "127.0.0.1", () => setTimeout(resolve, 100));
    client.on("error", () => {});
  });
  await withLock(lockPort, task);
});

test("withLock says once what it waits for when its port is taken", { timeout: 5000 }, async (t) => {
  const lockPort = await freePort();
  const other = createServer().listen(lockPort, "127.0.0.1");
  await new Promise((resolve) => other.once("listening", resolve));
  const said = t.mock.method(console, "error", () => {});
  const waiting = withLock(lockPort, async () => "ran");
  await new Promise((resolve) => setTimeout(resolve, 700));
  await new Promise((resolve) => other.close(resolve));
  assert.equal(await waiting, "ran");
  assert.equal(said.mock.callCount(), 1);
  assert.match(said.mock.calls[0].arguments[0], new RegExp(`Waiting for the Chrome lock on 127.0.0.1:${lockPort}`));
});

test("withLock never lets two of many waiters hold it at once", async () => {
  const lockPort = await freePort();
  let active = 0;
  let most = 0;
  const task = async () => {
    most = Math.max(most, ++active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active--;
  };
  await Promise.all(Array.from({ length: 12 }, async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
    await withLock(lockPort, task);
  }));
  assert.equal(most, 1);
});

test("withLock gives up with the waiting message once EXO_SEARCH_LOCK_MS has passed", { timeout: 5000 }, async (t) => {
  const lockPort = await freePort();
  const other = createServer().listen(lockPort, "127.0.0.1");
  await new Promise((resolve) => other.once("listening", resolve));
  t.mock.method(console, "error", () => {});
  t.after(() => other.close());
  process.env.EXO_SEARCH_LOCK_MS = "300";
  t.after(() => delete process.env.EXO_SEARCH_LOCK_MS);
  await assert.rejects(withLock(lockPort, async () => "ran"), new RegExp(`Waiting for the Chrome lock on 127.0.0.1:${lockPort}`));
});
