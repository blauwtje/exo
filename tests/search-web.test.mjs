import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect, toEvidence } from "../skills/search/scripts/web.mjs";

const pages = (map) => async (url) => {
  if (!(url in map)) throw new Error(`no page ${url}`);
  return { ok: true, text: async () => map[url] };
};
const everyQuoteOnPage = async () => ({ ok: true, text: async () => "<p>Hooks run before tools.</p>" });

const row = (url, extra = {}) => ({
  title: "A post",
  url,
  site: "Example",
  date: "2026-02-03",
  why: "explains hooks",
  quote: "Hooks run before tools.",
  subs: [1],
  ...extra,
});

test("toEvidence prints the link line, the why line and the quote", () => {
  const [item] = toEvidence([row("https://example.com/post")], ["web"]).read;
  assert.equal(item.url, "https://example.com/post");
  assert.deepEqual(item.subs, [1]);
  assert.equal(
    item.text,
    "- [A post](https://example.com/post) | Example | 2026-02-03\nwhy: explains hooks\n> Hooks run before tools.",
  );
});

test("toEvidence drops pages of the other chosen sources, including subdomains", () => {
  const rows = [
    row("https://www.reddit.com/r/x/comments/1"),
    row("https://old.reddit.com/r/x/comments/2"),
    row("https://news.ycombinator.com/item?id=3"),
    row("https://github.com/a/b"),
    row("https://example.com/keep"),
  ];
  assert.deepEqual(
    toEvidence(rows, ["web", "reddit", "hn", "github"]).read.map((item) => item.url),
    ["https://example.com/keep"],
  );
});

test("toEvidence keeps a source's pages when that source is not chosen", () => {
  const rows = [row("https://github.com/a/b"), row("https://news.ycombinator.com/item?id=3")];
  assert.deepEqual(
    toEvidence(rows, ["web", "reddit"]).read.map((item) => item.url),
    rows.map((r) => r.url),
  );
});

test("toEvidence drops skipped urls and reports a row with an invalid url", () => {
  const rows = [row("https://www.example.com/seen/"), row("docs.example.com/hooks"), row("https://example.com/new")];
  const { read, failed } = toEvidence(rows, ["web"], new Set(["https://example.com/seen"]));
  assert.deepEqual(read.map((item) => item.url), ["https://example.com/new"]);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /docs\.example\.com\/hooks/);
});

function fakeClaude(rows) {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const script = join(dir, "claude");
  writeFileSync(script, `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  require("node:fs").writeFileSync(${JSON.stringify(join(dir, "call.json"))}, JSON.stringify({ args: process.argv.slice(2), input }));
  console.log(JSON.stringify({ result: "", is_error: false, structured_output: { rows: ${JSON.stringify(rows)} } }));
});
`);
  chmodSync(script, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  return {
    call: () => JSON.parse(readFileSync(join(dir, "call.json"), "utf8")),
    restore: () => (process.env.PATH = saved),
  };
}

test("collect runs one Sonnet call with web tools and sends the plan", async () => {
  const fake = fakeClaude([row("https://example.com/a"), row("https://github.com/a/b")]);
  const plan = {
    question: "how do hooks work",
    sources: ["web", "github"],
    days: 90,
    since: "2026-01-01",
    subQuestions: [{ ask: "what events exist", terms: ["hook events", "hooks api"] }],
    skip: new Set(["https://seen.example/x"]),
  };
  try {
    const result = await collect(plan, null, Infinity, everyQuoteOnPage);
    assert.equal(result.found, 2);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.read.map((item) => item.url), ["https://example.com/a"]);
    const { args, input } = fake.call();
    const after = (flag) => args[args.indexOf(flag) + 1];
    assert.equal(after("--model"), "sonnet");
    assert.equal(after("--tools"), "WebSearch,WebFetch");
    assert.equal(after("--max-turns"), "20");
    assert.ok(args.includes("--json-schema"));
    for (const part of ["how do hooks work", "Q1 what events exist", "hook events", "hooks api", "2026-01-01", "https://seen.example/x", "github"]) {
      assert.ok(input.includes(part), `input lacks ${part}`);
    }
  } finally {
    fake.restore();
  }
});

test("collect rejects when the call fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const script = join(dir, "claude");
  writeFileSync(script, `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on("end", () => console.log(JSON.stringify({ result: "boom", is_error: true })));
`);
  chmodSync(script, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    await assert.rejects(
      collect({ question: "q", sources: ["web"], days: 30, since: "2026-01-01", subQuestions: [{ ask: "a", terms: ["t"] }], skip: new Set() }),
      /boom/,
    );
  } finally {
    process.env.PATH = saved;
  }
});

test("collect skips the urls of earlier calls, keeps at most limit rows and reports the state", async () => {
  const fake = fakeClaude([row("https://example.com/a"), row("https://example.com/b"), row("https://example.com/c")]);
  const plan = {
    question: "q",
    sources: ["web"],
    days: 30,
    since: "2026-01-01",
    subQuestions: [{ ask: "a", terms: ["t"] }],
    skip: new Set(["https://seen.example/x"]),
  };
  try {
    const result = await collect(plan, { read: ["https://example.com/a"] }, 1, everyQuoteOnPage);
    assert.deepEqual(result.read.map((item) => item.url), ["https://example.com/b"]);
    assert.deepEqual(result.state, { read: ["https://example.com/a", "https://example.com/b"] });
    assert.equal(result.done, false);
    const { input } = fake.call();
    assert.ok(input.includes("https://seen.example/x"));
    assert.ok(input.includes("https://example.com/a"));
  } finally {
    fake.restore();
  }
});

test("collect is done when the call gave no new row", async () => {
  const fake = fakeClaude([row("https://example.com/a")]);
  const plan = { question: "q", sources: ["web"], days: 30, since: "2026-01-01", subQuestions: [{ ask: "a", terms: ["t"] }], skip: new Set() };
  try {
    const result = await collect(plan, { read: ["https://example.com/a"] }, Infinity, everyQuoteOnPage);
    assert.deepEqual(result.read, []);
    assert.equal(result.done, true);
  } finally {
    fake.restore();
  }
});

const onePlan = { question: "q", sources: ["web"], days: 30, since: "2026-01-01", subQuestions: [{ ask: "a", terms: ["t"] }], skip: new Set() };

test("collect flags a quote that is not on its page and leaves its sub-questions uncovered", async () => {
  const fake = fakeClaude([row("https://example.com/a", { quote: "Invented words." })]);
  try {
    const { read } = await collect(onePlan, null, Infinity, pages({ "https://example.com/a": "<p>Hooks run before tools.</p>" }));
    assert.equal(read.length, 1);
    assert.ok(read[0].text.endsWith("> Invented words.\n(quote not found on page)"));
    assert.deepEqual(read[0].subs, []);
  } finally {
    fake.restore();
  }
});

test("collect finds a quote through tags, entities and whitespace and keeps its subs", async () => {
  const fake = fakeClaude([row("https://example.com/a", { quote: "Tom & Jerry say \"hi\" <now>" })]);
  const html = "<p>Tom &amp;\n  Jerry <b>say</b> &quot;hi&quot;&nbsp;&lt;now&gt;</p>";
  try {
    const { read } = await collect(onePlan, null, Infinity, pages({ "https://example.com/a": html }));
    assert.ok(!read[0].text.includes("(quote not found on page)"));
    assert.deepEqual(read[0].subs, [1]);
  } finally {
    fake.restore();
  }
});

test("collect matches a quote case-sensitively", async () => {
  const fake = fakeClaude([row("https://example.com/a", { quote: "hooks run before tools." })]);
  try {
    const { read } = await collect(onePlan, null, Infinity, everyQuoteOnPage);
    assert.ok(read[0].text.endsWith("(quote not found on page)"));
  } finally {
    fake.restore();
  }
});

test("collect marks a page that cannot be fetched and keeps its subs", async () => {
  const fake = fakeClaude([row("https://example.com/a"), row("https://example.com/b")]);
  const fetchPage = async (url) => (url.endsWith("/a") ? { ok: false, text: async () => "" } : Promise.reject(new Error("down")));
  try {
    const { read } = await collect(onePlan, null, Infinity, fetchPage);
    for (const item of read) {
      assert.ok(item.text.endsWith("> Hooks run before tools.\n(page not fetched)"));
      assert.deepEqual(item.subs, [1]);
    }
  } finally {
    fake.restore();
  }
});

test("collect fetches only rows within limit, each with a 15 s timeout", async () => {
  const fake = fakeClaude([row("https://example.com/a"), row("https://example.com/b")]);
  const calls = [];
  const fetchPage = async (url, options) => {
    calls.push({ url, aborts: options.signal instanceof AbortSignal });
    return { ok: true, text: async () => "Hooks run before tools." };
  };
  try {
    await collect(onePlan, null, 1, fetchPage);
    assert.deepEqual(calls, [{ url: "https://example.com/a", aborts: true }]);
  } finally {
    fake.restore();
  }
});

test("collect decodes numeric and punctuation entities when it looks for a quote", async () => {
  const fake = fakeClaude([row("https://example.com/a", { quote: "It\u2019s \u201cfine\u201d \u2014 it\u2019s ok\u2026 don't" })]);
  const html = "<p>It&#8217;s &ldquo;fine&rdquo; &mdash; it&rsquo;s ok&hellip; don&#x27;t</p>";
  try {
    const { read } = await collect(onePlan, null, Infinity, pages({ "https://example.com/a": html }));
    assert.ok(!read[0].text.includes("(quote not found on page)"));
  } finally {
    fake.restore();
  }
});

test("collect checks each row's own quote when two rows share a url", async () => {
  const fake = fakeClaude([row("https://example.com/a"), row("https://example.com/a", { quote: "Invented words." })]);
  try {
    const { read } = await collect(onePlan, null, Infinity, everyQuoteOnPage);
    assert.ok(!read[0].text.includes("(quote not found on page)"));
    assert.ok(read[1].text.endsWith("(quote not found on page)"));
  } finally {
    fake.restore();
  }
});
