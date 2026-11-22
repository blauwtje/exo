import test from "node:test";
import assert from "node:assert/strict";
import { collect, find, open } from "../skills/search/scripts/hn.mjs";

const plan = {
  question: "q",
  sources: ["hn"],
  days: 30,
  skip: new Set(),
  subQuestions: [
    { ask: "first", terms: ["alpha", "beta"] },
    { ask: "second", terms: ["gamma"] },
  ],
};

const story = {
  id: 7,
  title: "A story",
  author: "ann",
  points: 12,
  created_at_i: 1700000000,
  text: null,
  url: "https://example.com/post",
  children: [
    {
      id: 8, author: "bob", text: "<p>Hello &amp; welcome</p>", children: [
        { id: 9, author: null, text: null, children: [{ id: 10, author: "cy", text: "deep", children: [] }] },
      ],
    },
  ],
};

function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    return handler(new URL(url));
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

test("find searches stories once per term within the days window", async () => {
  const stub = stubFetch((url) =>
    json({ hits: [{ objectID: "7", title: `${url.searchParams.get("query")} hit`, points: 12, num_comments: 3, created_at_i: 1700000000 }] }),
  );
  try {
    const before = Math.floor(Date.now() / 1000) - 30 * 86400;
    const { lists } = await find(plan);
    assert.deepEqual(stub.calls.map((url) => url.searchParams.get("query")), ["alpha", "beta", "gamma"]);
    assert.equal(stub.calls[0].searchParams.get("tags"), "story");
    const bound = Number(stub.calls[0].searchParams.get("numericFilters").match(/created_at_i>(\d+)/)[1]);
    assert.ok(Math.abs(bound - before) < 5);
    assert.deepEqual(lists[0], [
      { url: "https://news.ycombinator.com/item?id=7", title: "alpha hit", facts: "12 points | 3 comments | 2023-11-14" },
    ]);
  } finally {
    stub.restore();
  }
});

test("find keeps the searches that succeeded and reports each failed one", async () => {
  const stub = stubFetch((url) => (url.searchParams.get("query") === "beta" ? json({}, 500) : json({ hits: [] })));
  try {
    const { lists, failed } = await find(plan);
    assert.equal(lists.length, 2);
    assert.deepEqual(failed.slice(0, 1), ['no hits: "alpha"']);
    assert.match(failed[1], /^search failed: .*500/);
    assert.equal(failed[2], 'no hits: "gamma"');
  } finally {
    stub.restore();
  }
});

test("open returns the story header and live comments with labels and parents", async () => {
  const stub = stubFetch(() => json(story));
  try {
    const { header, passages } = await open({ url: "https://news.ycombinator.com/item?id=7" });
    assert.equal(stub.calls[0].pathname, "/api/v1/items/7");
    assert.match(header, /^A story\nu\/ann \| 12 points \| 2023-11-14\nhttps:\/\/news.ycombinator.com\/item\?id=7/);
    assert.match(header, /Link: https:\/\/example.com\/post/);
    assert.deepEqual(passages, [
      { id: "8", parent: null, label: "u/bob", score: null, body: "Hello & welcome", link: "https://news.ycombinator.com/item?id=8" },
      { id: "10", parent: "8", label: "u/cy", score: null, body: "deep", link: "https://news.ycombinator.com/item?id=10" },
    ]);
  } finally {
    stub.restore();
  }
});

test("collect hands its state and limit to readBest and searches nothing for a saved state", async () => {
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ hits: [] }) };
  };
  try {
    const result = await collect(plan, { cards: [], judged: 0, queue: [] }, 0);
    assert.equal(result.done, true);
    assert.deepEqual(result.read, []);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = saved;
  }
});
