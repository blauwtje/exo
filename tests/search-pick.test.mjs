import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ask, fuse, killChildren, searchAll, parseAnswer, parsePicks, pick, readBest, render } from "../skills/search/scripts/pick.mjs";

const comments = [
  { id: "a", parent: null, label: "u/ann", score: 12, body: "Top level text", link: "https://x/a" },
  { id: "b", parent: "a", label: "u/bob", score: null, body: "Reply text", link: "https://x/b" },
  { id: "c", parent: null, label: "u/cy", score: 3, body: "Other text", link: "https://x/c" },
];

test("parsePicks keeps known ids with their reasons", () => {
  const picks = parsePicks("b: disagrees with the claim\nc: minority view", new Set(["a", "b", "c"]));
  assert.deepEqual(picks, [
    { id: "b", reason: "disagrees with the claim" },
    { id: "c", reason: "minority view" },
  ]);
});

test("parsePicks drops unknown ids, prose lines and repeats", () => {
  const picks = parsePicks("Here are the picks:\nz: made up\nb: first\nb: again", new Set(["a", "b"]));
  assert.deepEqual(picks, [{ id: "b", reason: "first" }]);
});

test("render prints the header, the parent chain and the original body", () => {
  const out = render("Title line", comments, [{ id: "b", reason: "answers it" }]);
  const lines = out.split("\n");
  assert.equal(lines[0], "Title line");
  assert.ok(out.includes("[a] u/ann (12) https://x/a"));
  assert.ok(out.includes("[b] u/bob https://x/b"));
  assert.ok(!out.includes("u/bob ("));
  assert.ok(out.indexOf("Top level text") < out.indexOf("Reply text"));
  assert.ok(out.includes("why: answers it"));
  assert.ok(!out.includes("Other text"));
});

test("render prints only the header when nothing is picked", () => {
  assert.equal(render("Title line", comments, []), "Title line");
});

test("render keeps header lines 1-3 and cuts the rest at a word boundary within a third of the budget", () => {
  const first = ["Title line", "meta line", "https://x/post"];
  const header = [...first, "word ".repeat(800)].join("\n");
  const picks = ["p", "q", "r"].map((id) => ({ id, reason: "Q1 why" }));
  const many = picks.map(({ id }) => ({ id, parent: null, label: `u/${id}`, score: 1, body: id.repeat(300), link: `https://x/${id}` }));
  const out = render(header, many, picks, 2500);
  const head = out.split("\n\n")[0];
  assert.equal(head.split("\n").slice(0, 3).join("\n"), first.join("\n"));
  assert.ok(head.length <= Math.floor(2500 / 3));
  assert.ok(head.endsWith("word"));
  assert.ok(out.length <= 2500);
  ["p", "q", "r"].forEach((id) => assert.ok(out.includes(id.repeat(300))));
});

test("render never cuts the first 3 header lines even past the budget", () => {
  const first = ["T".repeat(500), "meta", "https://x/post"];
  const out = render([...first, "tail words here"].join("\n"), comments, [], 300);
  assert.equal(out, first.join("\n"));
});

test("render prints a shared parent once", () => {
  const more = [...comments, { id: "d", parent: "a", label: "u/dee", score: 1, body: "Second reply", link: "https://x/d" }];
  const out = render("T", more, [{ id: "b", reason: "r1" }, { id: "d", reason: "r2" }]);
  assert.equal(out.split("Top level text").length, 2);
});

test("render lists picks beyond the budget as one-liners and keeps the full part within it", () => {
  const big = ["p", "q", "r"].map((id) => ({
    id, parent: null, label: `u/u${id}`, score: 1, body: `${id}`.repeat(100), link: `https://x/${id}`,
  }));
  const picks = big.map(({ id }) => ({ id, reason: `reason ${id}` }));
  const budget = 400;
  const out = render("T", big, picks, budget);
  const [full, ...rest] = out.split("\n\n[r]");
  assert.ok(full.includes("[p] u/up"));
  assert.ok(full.includes("[q] u/uq"));
  assert.ok(full.length <= budget);
  assert.ok(!out.includes("r".repeat(100)));
  assert.ok(out.includes("[r] u/ur https://x/r why: reason r"));
  assert.equal(rest.length, 1);
});

test("render keeps every pick and stays within the budget with the one-liners counted", () => {
  const many = Array.from({ length: 60 }, (_, index) => ({
    id: `m${index}`, parent: null, label: `u/u${index}`, score: 1, body: "x".repeat(400), link: `https://x/m${index}`,
  }));
  const picks = many.map(({ id }) => ({ id, reason: "reason" }));
  const out = render("T", many, picks, 10000);
  assert.ok(out.length <= 10000);
  many.forEach(({ id }) => assert.ok(out.includes(`[${id}] u/`)));
});

test("render names the comment when its reason follows a child's block", () => {
  const out = render("T", comments, [{ id: "b", reason: "rb" }, { id: "a", reason: "ra" }]);
  assert.ok(out.includes("[a] u/ann why: ra"));
});

test("parseAnswer returns the result text", () => {
  assert.equal(parseAnswer(JSON.stringify({ result: "hello", is_error: false })), "hello");
});

test("parseAnswer returns the structured output when a schema was sent", () => {
  const stdout = JSON.stringify({ result: "", structured_output: { rows: [1] }, is_error: false });
  assert.deepEqual(parseAnswer(stdout, { type: "object" }), { rows: [1] });
});

test("parseAnswer throws on an error answer and on missing output", () => {
  assert.throws(() => parseAnswer(JSON.stringify({ result: "boom", is_error: true })), /boom/);
  assert.throws(() => parseAnswer(JSON.stringify({ is_error: false })), /no text/);
  assert.throws(() => parseAnswer(JSON.stringify({ result: "x", is_error: false }), { type: "object" }), /no structured output/);
});

test("ask sends the model, system prompt, tools, schema and turn limit and the input on stdin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const script = join(dir, "claude");
  writeFileSync(script, `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => console.log(JSON.stringify({ result: JSON.stringify({ args: process.argv.slice(2), input }), is_error: false })));
`);
  chmodSync(script, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    const answer = JSON.parse(await ask({ model: "haiku", system: "sys", tools: "WebSearch", maxTurns: 3 }, "the input"));
    const { args, input } = answer;
    assert.equal(input, "the input");
    const after = (flag) => args[args.indexOf(flag) + 1];
    assert.equal(after("--model"), "haiku");
    assert.equal(after("--system-prompt"), "sys");
    assert.equal(after("--tools"), "WebSearch");
    assert.equal(after("--allowedTools"), "WebSearch");
    assert.equal(after("--max-turns"), "3");
    assert.ok(!args.includes("--json-schema"));
    assert.ok(args.includes("--no-session-persistence"));
  } finally {
    process.env.PATH = saved;
  }
});

const card = (url, title = url) => ({ url, title, facts: "f" });

test("fuse merges the same page across lists, ranks by reciprocal rank and numbers the ids", () => {
  const fused = fuse(
    [
      [card("https://a.com/x"), card("https://b.com/y")],
      [card("https://b.com/y/#top"), card("https://www.a.com/x")],
      [card("https://c.com/z")],
    ],
    new Set(),
  );
  assert.deepEqual(fused.map(({ id, url }) => [id, url]), [
    ["c1", "https://a.com/x"],
    ["c2", "https://b.com/y"],
    ["c3", "https://c.com/z"],
  ]);
});

test("fuse treats www.reddit.com and old.reddit.com as the same page", () => {
  const fused = fuse([[card("https://old.reddit.com/r/x/comments/abc/t/")]], new Set(["https://www.reddit.com/r/x/comments/abc/t/"]));
  assert.deepEqual(fused, []);
});

test("fuse drops skipped urls and keeps every other card", () => {
  const list = Array.from({ length: 70 }, (_, index) => card(`https://x.com/${index}`));
  const fused = fuse([list], new Set(["https://x.com/0/"]));
  assert.equal(fused.length, 69);
  assert.equal(fused[0].url, "https://x.com/1");
  assert.equal(fused[68].id, "c69");
});

const plan = (extra = {}) => ({
  question: "q",
  sources: ["hn", "github"],
  skip: new Set(),
  subQuestions: [{ ask: "one", terms: ["t"] }, { ask: "two", terms: ["t"] }],
  ...extra,
});

const adapter = (cards, docs = {}) => ({
  find: async () => ({ lists: [cards], failed: [] }),
  open: async ({ url }) => {
    if (docs[url] instanceof Error) throw docs[url];
    return docs[url] ?? { header: `H ${url}`, passages: [{ id: "p1", parent: null, label: "u/a", score: 1, body: `body ${url}`, link: `${url}#p1` }] };
  },
});

const chooser = (judged, picked = () => [{ id: "p1", reason: "Q1 good" }]) => async (prompt, _plan, _header, items) =>
  prompt === "judge" ? judged(items) : picked(items);

test("readBest reads only the judged cards up to the cap and keeps the pick's sub-questions", async () => {
  const cards = Array.from({ length: 9 }, (_, index) => card(`https://x.com/${index}`));
  const result = await readBest(
    plan({ subQuestions: [{ ask: "one", terms: ["t"] }] }),
    adapter(cards),
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), () => [{ id: "p1", reason: "Q1 Q2 why" }]),
  );
  assert.equal(result.found, 9);
  assert.equal(result.read.length, 3);
  assert.deepEqual(result.read.map(({ url }) => url), ["https://x.com/0", "https://x.com/1", "https://x.com/2"]);
  assert.deepEqual(result.read[0].subs, [1, 2]);
  assert.ok(result.read[0].text.includes("body https://x.com/0"));
  assert.deepEqual(result.failed, []);
});

test("readBest lets a document without passages be picked on its body and reports failed searches", async () => {
  const docs = { "https://x.com/a": { header: "Issue body answers it", passages: [] } };
  const base = adapter([card("https://x.com/a")], docs);
  const result = await readBest(
    plan(),
    { ...base, find: async () => ({ lists: [[card("https://x.com/a")]], failed: ["search failed: boom"] }) },
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), (items) => (items[0].body.includes("Issue body") ? [{ id: items[0].id, reason: "Q1 body" }] : [])),
  );
  assert.deepEqual(result.read.map(({ url }) => url), ["https://x.com/a"]);
  assert.ok(result.read[0].text.includes("Issue body answers it"));
  assert.deepEqual(result.read[0].subs, [1]);
  assert.deepEqual(result.failed, ["search failed: boom"]);
});

test("readBest lets the header body be picked when the only passage is a thank-you", async () => {
  const doc = { header: "Title\nmeta\nurl\nThe fix is to set retries to 3", passages: [{ id: "p1", parent: null, label: "u/a", score: 1, body: "Thanks", link: "l1" }] };
  const result = await readBest(
    plan(),
    adapter([card("https://x.com/a")], { "https://x.com/a": doc }),
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), () => [{ id: "body", reason: "Q1 states the fix" }]),
  );
  assert.equal(result.read.length, 1);
  assert.ok(result.read[0].text.includes("set retries to 3"));
  assert.ok(result.read[0].text.includes("why: Q1 states the fix"));
  assert.ok(!result.read[0].text.includes("Thanks"));
});

test("readBest drops a document with no pick", async () => {
  const cards = [card("https://x.com/a"), card("https://x.com/b")];
  const result = await readBest(
    plan(),
    adapter(cards),
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), (items) => (items[0].body.includes("/a") ? [] : [{ id: "p1", reason: "Q2 ok" }])),
  );
  assert.deepEqual(result.read.map(({ url }) => url), ["https://x.com/b"]);
  assert.deepEqual(result.failed, []);
});

test("readBest reports a failed judge and reads nothing", async () => {
  const result = await readBest(plan(), adapter([card("https://x.com/a")]), chooser(() => { throw new Error("judge down"); }));
  assert.deepEqual(result.read, []);
  assert.equal(result.found, 1);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /judge down/);
});

test("readBest reports a failed pick and a failed open and keeps the other documents", async () => {
  const cards = [card("https://x.com/a"), card("https://x.com/b"), card("https://x.com/c")];
  const result = await readBest(
    plan(),
    adapter(cards, { "https://x.com/c": new Error("open down") }),
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), (items) => {
      if (items[0].body.includes("/a")) throw new Error("pick down");
      return [{ id: "p1", reason: "Q1 ok" }];
    }),
  );
  assert.deepEqual(result.read.map(({ url }) => url), ["https://x.com/b"]);
  assert.equal(result.failed.length, 2);
  assert.ok(result.failed.some((line) => line.includes("https://x.com/a") && line.includes("pick down")));
  assert.ok(result.failed.some((line) => line.includes("https://x.com/c") && line.includes("open down")));
});

test("readBest gives each document a budget of min(12000, 60000 / (thread sources * cap))", async () => {
  const body = "x".repeat(5000);
  const docs = { "https://x.com/a": { header: "H", passages: [
    { id: "p1", parent: null, label: "u/a", score: 1, body, link: "l1" },
    { id: "p2", parent: null, label: "u/b", score: 1, body, link: "l2" },
  ] } };
  const picked = () => [{ id: "p1", reason: "Q1 a" }, { id: "p2", reason: "Q1 b" }];
  const judged = (items) => items.map(({ id }) => ({ id, reason: "r" }));
  const wide = await readBest(plan({ sources: ["hn", "github", "reddit"], subQuestions: Array(3).fill({ ask: "a", terms: ["t"] }) }), adapter([card("https://x.com/a")], docs), chooser(judged, picked));
  assert.ok(wide.read[0].text.length <= 60000 / (3 * 8) + 1);
  const narrow = await readBest(plan({ sources: ["hn"], subQuestions: [{ ask: "a", terms: ["t"] }] }), adapter([card("https://x.com/a")], docs), chooser(judged, picked));
  assert.ok(narrow.read[0].text.length > 10000 && narrow.read[0].text.length <= 12000);
});

test("searchAll keeps an empty list, reports it as no hits and reports a rejected search", async () => {
  const { lists, failed } = await searchAll([
    { label: '"a" on all of Reddit', cards: Promise.resolve([]) },
    { label: '"b"', cards: Promise.reject(new Error("boom")) },
    { label: '"c"', cards: Promise.resolve([{ url: "https://x.com/c" }]) },
  ]);
  assert.deepEqual(lists, [[], [{ url: "https://x.com/c" }]]);
  assert.deepEqual(failed, ['no hits: "a" on all of Reddit', "search failed: boom"]);
});

test("readBest called again with its state reads the next cards and searches nothing", async () => {
  const cards = Array.from({ length: 70 }, (_, index) => card(`https://x.com/${index}`));
  const base = adapter(cards);
  let searches = 0;
  const counted = { ...base, find: async (...args) => (searches++, base.find(...args)) };
  const judgedSizes = [];
  const choose = chooser((items) => (judgedSizes.push(items.length), items.map(({ id }) => ({ id, reason: "r" }))));
  const one = plan({ subQuestions: [{ ask: "one", terms: ["t"] }] });
  const first = await readBest(one, counted, choose, null, 2);
  assert.deepEqual(first.read.map(({ url }) => url), ["https://x.com/0", "https://x.com/1"]);
  assert.equal(first.found, 70);
  assert.equal(first.done, false);
  const second = await readBest(one, counted, choose, JSON.parse(JSON.stringify(first.state)), 3);
  assert.deepEqual(second.read.map(({ url }) => url), ["https://x.com/2", "https://x.com/3", "https://x.com/4"]);
  assert.equal(searches, 1);
  assert.deepEqual(second.failed, []);
  assert.deepEqual(judgedSizes, [60]);
});

test("readBest judges the next 60 cards when the queue runs short and is done after the last card", async () => {
  const cards = Array.from({ length: 62 }, (_, index) => card(`https://x.com/${index}`));
  const judgedSizes = [];
  const choose = chooser((items) => (judgedSizes.push(items.length), items.filter(({ id }) => id === "c1" || id === "c62").map(({ id }) => ({ id, reason: "r" }))));
  const one = plan({ subQuestions: [{ ask: "one", terms: ["t"] }] });
  const result = await readBest(one, adapter(cards), choose);
  assert.deepEqual(judgedSizes, [60, 2]);
  assert.deepEqual(result.read.map(({ url }) => url), ["https://x.com/0", "https://x.com/61"]);
  assert.equal(result.done, true);
});

test("readBest loses only the failed judge batch, runs the next batch and is done after the last card", async () => {
  const cards = Array.from({ length: 70 }, (_, index) => card(`https://x.com/${index}`));
  let batches = 0;
  const choose = chooser((items) => {
    if (++batches === 1) throw new Error("judge down");
    return items.map(({ id }) => ({ id, reason: "r" }));
  });
  const one = plan({ subQuestions: [{ ask: "one", terms: ["t"] }] });
  const result = await readBest(one, adapter(cards), choose, null, 2);
  assert.deepEqual(result.failed, ["judge failed: judge down"]);
  assert.deepEqual(result.read.map(({ url }) => url), ["https://x.com/60", "https://x.com/61"]);
  assert.equal(result.state.judged, 70);
  assert.equal(result.done, false);
});

test("readBest is done when every judge batch failed and no card is left", async () => {
  const result = await readBest(plan(), adapter([card("https://x.com/a")]), chooser(() => { throw new Error("judge down"); }));
  assert.deepEqual(result.failed, ["judge failed: judge down"]);
  assert.equal(result.done, true);
});

function withFakeClaude(answer, run) {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const script = join(dir, "claude");
  writeFileSync(script, `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on("end", () => console.log(JSON.stringify({ result: ${JSON.stringify(answer)}, is_error: false })));
`);
  chmodSync(script, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  return run().finally(() => {
    process.env.PATH = saved;
  });
}

const bodyItem = { id: "body", label: "body", parent: null, body: "Issue text" };

test("pick takes the first answer line as the body pick when the page has no passages", async () => {
  const picks = await withFakeClaude("[49812465]: Q3 Q6\nsecond: ignored", () => pick("pick", plan(), "H", [bodyItem]));
  assert.deepEqual(picks, [{ id: "body", reason: "Q3 Q6" }]);
});

test("pick still rejects an unknown id when the page has passages", async () => {
  const items = [{ ...bodyItem, id: "p1" }, { ...bodyItem, id: "p2" }];
  await assert.rejects(withFakeClaude("zzz: Q1", () => pick("pick", plan(), "H", items)), /no pick line/);
});

test("readBest drops a pick whose reason names no sub-question and keeps one that does", async () => {
  const doc = {
    header: "H",
    passages: [
      { id: "c1", parent: null, label: "u/a", score: 1, body: "first text", link: "l1" },
      { id: "c2", parent: null, label: "u/b", score: 1, body: "second text", link: "l2" },
    ],
  };
  const result = await readBest(
    plan(),
    adapter([card("https://x.com/a")], { "https://x.com/a": doc }),
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), () => [{ id: "c1", reason: "no." }, { id: "c2", reason: "Q1 shows numbers" }]),
  );
  assert.deepEqual(result.read[0].subs, [1]);
  assert.ok(result.read[0].text.includes("second text"));
  assert.ok(!result.read[0].text.includes("first text"));
});

test("readBest drops a document when no pick names a sub-question", async () => {
  const result = await readBest(
    plan(),
    adapter([card("https://x.com/a")]),
    chooser((items) => items.map(({ id }) => ({ id, reason: "r" })), () => [{ id: "p1", reason: "Thanks the author" }]),
  );
  assert.deepEqual(result.read, []);
});

test("render lets a page with no comments and no picks use the whole budget for its header", () => {
  const first = ["Title line", "meta line", "https://x/post"];
  const header = [...first, "word ".repeat(800)].join("\n");
  const out = render(header, [], [], 3000);
  assert.ok(out.length > 1000);
  assert.ok(out.length <= 3000);
});

test("killChildren stops a running claude so its ask rejects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const script = join(dir, "claude");
  writeFileSync(script, `#!/usr/bin/env node
setTimeout(() => {}, 60000);
`);
  chmodSync(script, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    const pending = ask({ model: "haiku", system: "sys" }, "in");
    await new Promise((resolve) => setTimeout(resolve, 300));
    killChildren();
    await assert.rejects(pending, /claude exited/);
  } finally {
    process.env.PATH = saved;
  }
});
