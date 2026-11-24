import test from "node:test";
import assert from "node:assert/strict";
import { collect, find, open } from "../skills/search/scripts/arxiv.mjs";

process.env.EXO_SEARCH_ARXIV_GAP_MS = "40";

const plan = {
  question: "q",
  sources: ["arxiv"],
  days: 365,
  skip: new Set(),
  subQuestions: [{ ask: "first", terms: ["alpha beta", "gamma delta"] }],
};

const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>http://arxiv.org/abs/2401.00001v1</id><published>2024-01-02T10:00:00Z</published>
<title>Alpha &amp; Beta
  models</title><summary>  We study  alpha.
Second line. </summary>
<author><name>Ann Lee</name></author><author><name>Bo Chan</name></author></entry></feed>`;

const text = (body, status = 200) => ({ ok: status === 200, status, text: async () => body });

test("find sends one request at a time with a gap and turns entries into cards", async () => {
  const starts = [];
  let active = 0;
  const fetcher = async (url) => {
    assert.equal(active, 0);
    active += 1;
    starts.push({ at: Date.now(), url: new URL(url) });
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return text(feed);
  };
  const { lists } = await find(plan, fetcher);
  assert.equal(starts[0].url.host, "export.arxiv.org");
  assert.equal(starts[0].url.pathname, "/api/query");
  assert.ok(starts[1].at - starts[0].at >= 40);
  assert.deepEqual(lists[0], [
    {
      url: "https://arxiv.org/abs/2401.00001v1",
      title: "Alpha & Beta models",
      facts: "Ann Lee, Bo Chan | 2024-01-02",
      abstract: "We study alpha. Second line.",
      signals: { date: "2024-01-02" },
    },
  ]);
});

test("find reports a failed request", async () => {
  const { failed } = await find(plan, async () => text("", 503));
  assert.match(failed[0], /^search failed: .*503/);
});

test("open shows the title, authors, date and abstract", async () => {
  const card = { url: "https://arxiv.org/abs/2401.00001v1", title: "T", facts: "Ann Lee | 2024-01-02", abstract: "We study alpha." };
  const { header, passages } = await open(card);
  assert.equal(header, "T\nAnn Lee | 2024-01-02\nhttps://arxiv.org/abs/2401.00001v1");
  assert.deepEqual(passages.map(({ label, body }) => ({ label, body })), [{ label: "Abstract", body: "We study alpha." }]);
});

test("collect searches nothing for a saved state with no limit left", async () => {
  let calls = 0;
  const result = await collect(plan, { cards: [], judged: 0, queue: [] }, 0, 1000, async () => (calls += 1, text(feed)));
  assert.equal(result.done, true);
  assert.equal(calls, 0);
});
