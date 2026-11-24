import test from "node:test";
import assert from "node:assert/strict";
import { collect, find, open } from "../skills/search/scripts/wikipedia.mjs";

const plan = {
  question: "q",
  sources: ["wikipedia"],
  days: 365,
  skip: new Set(),
  subQuestions: [{ ask: "first", terms: ["alpha beta", "gamma delta"] }],
};

const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

test("find searches each term with the generic user agent and turns hits into cards with signals", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return json({ query: { search: [{ title: "Alpha beta", wordcount: 900, timestamp: "2026-01-02T03:04:05Z" }] } });
  };
  const { lists } = await find(plan, fetcher);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get("srsearch"), "alpha beta");
  assert.equal(calls[0].init.headers["User-Agent"], "exo-search/1 (research reader)");
  assert.deepEqual(lists[0], [
    { url: "https://en.wikipedia.org/wiki/Alpha_beta", title: "Alpha beta", facts: "900 words | updated 2026-01-02", signals: { date: "2026-01-02" } },
  ]);
});

test("find runs at most 3 requests at once", async () => {
  let active = 0;
  let peak = 0;
  const fetcher = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return json({ query: { search: [] } });
  };
  const many = { ...plan, subQuestions: Array.from({ length: 4 }, () => ({ ask: "a", terms: ["one two", "three four"] })) };
  await find(many, fetcher);
  assert.equal(peak, 3);
});

test("find reports a failed search", async () => {
  const { failed } = await find(plan, async () => json({}, 500));
  assert.match(failed[0], /^search failed: .*500/);
});

test("open splits the plain-text extract into one passage per heading", async () => {
  const calls = [];
  const extract = "Intro text.\n\n== History ==\nOld times.\n\n=== Early days ===\nVery old.";
  const fetcher = async (url) => (calls.push(new URL(url)), json({ query: { pages: { 5: { extract } } } }));
  const { header, passages } = await open({ url: "https://en.wikipedia.org/wiki/Alpha_beta", title: "Alpha beta" }, fetcher);
  assert.equal(calls[0].searchParams.get("titles"), "Alpha beta");
  assert.equal(calls[0].searchParams.get("explaintext"), "1");
  assert.match(header, /^Alpha beta\n.*\nhttps:\/\/en.wikipedia.org\/wiki\/Alpha_beta$/);
  assert.deepEqual(passages.map(({ label, body, link }) => ({ label, body, link })), [
    { label: "Overview", body: "Intro text.", link: "https://en.wikipedia.org/wiki/Alpha_beta" },
    { label: "History", body: "Old times.", link: "https://en.wikipedia.org/wiki/Alpha_beta#History" },
    { label: "Early days", body: "Very old.", link: "https://en.wikipedia.org/wiki/Alpha_beta#Early_days" },
  ]);
});

test("collect searches nothing for a saved state with no limit left", async () => {
  let calls = 0;
  const result = await collect(plan, { cards: [], judged: 0, queue: [] }, 0, 1000, async () => (calls += 1, json({})));
  assert.equal(result.done, true);
  assert.equal(calls, 0);
});
