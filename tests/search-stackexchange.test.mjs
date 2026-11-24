import test from "node:test";
import assert from "node:assert/strict";
import { collect, find, open } from "../skills/search/scripts/stackexchange.mjs";

const plan = {
  question: "q",
  sources: ["stackexchange"],
  days: 365,
  since: "2025-01-01",
  skip: new Set(),
  sites: ["stackoverflow", "superuser"],
  subQuestions: [{ ask: "first", terms: ["alpha beta"] }],
};

const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

const hit = {
  question_id: 77,
  title: "How &amp; why?",
  link: "https://stackoverflow.com/questions/77/how-why",
  score: 12,
  answer_count: 3,
  accepted_answer_id: 99,
  view_count: 4500,
  creation_date: 1700000000,
};

test("find searches each site and turns questions into cards with signals", async () => {
  const calls = [];
  const fetcher = async (url) => (calls.push(new URL(url)), json({ items: [hit] }));
  const { lists } = await find(plan, fetcher);
  assert.equal(calls[0].pathname, "/2.3/search/advanced");
  assert.deepEqual(calls.map((url) => url.searchParams.get("site")), ["stackoverflow", "superuser"]);
  assert.equal(calls[0].searchParams.get("q"), "alpha beta");
  assert.deepEqual(lists[0], [
    {
      url: "https://stackoverflow.com/questions/77/how-why",
      title: "How & why?",
      facts: "score 12 | 3 answers | accepted | 4500 views | 2023-11-14",
      site: "stackoverflow",
      signals: { score: 12, accepted: true, views: 4500, date: "2023-11-14" },
    },
  ]);
});

test("find reports a failed request", async () => {
  const { failed } = await find(plan, async () => json({}, 400));
  assert.match(failed[0], /^search failed: .*400/);
});

test("open reads the question with its answers", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(new URL(url));
    if (calls.at(-1).pathname.endsWith("/answers")) {
      return json({ items: [{ answer_id: 99, score: 8, is_accepted: true, body: "<p>Use <code>x</code></p>", owner: { display_name: "Cy" } }] });
    }
    return json({ items: [{ ...hit, body: "<p>Why does it fail?</p>" }] });
  };
  const card = { url: hit.link, title: "How & why?", site: "stackoverflow" };
  const { header, passages } = await open(card, fetcher);
  assert.equal(calls[0].pathname, "/2.3/questions/77");
  assert.equal(calls[0].searchParams.get("site"), "stackoverflow");
  assert.match(header, /^How & why\?\n.*\nhttps:\/\/stackoverflow.com\/questions\/77\/how-why\n\nWhy does it fail\?$/);
  assert.deepEqual(passages, [
    { id: "99", parent: null, label: "Cy (accepted)", score: 8, body: "Use x", link: "https://stackoverflow.com/questions/77/how-why#99" },
  ]);
});

test("collect searches nothing for a saved state with no limit left", async () => {
  let calls = 0;
  const result = await collect(plan, { cards: [], judged: 0, queue: [] }, 0, 1000, async () => (calls += 1, json({ items: [] })));
  assert.equal(result.done, true);
  assert.equal(calls, 0);
});
