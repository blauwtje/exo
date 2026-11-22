import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adapters, advance, bundle, bundlePath, limits, newRun, parsePlan, record } from "../skills/search/scripts/search.mjs";

const script = fileURLToPath(new URL("../skills/search/scripts/search.mjs", import.meta.url));
const planText = (extra = {}) =>
  JSON.stringify({ question: "How do hooks work?", subQuestions: [{ ask: "what runs", terms: ["hook events"] }], ...extra });

test("adapters are the four sources", () => {
  assert.deepEqual(Object.keys(adapters).sort(), ["github", "hn", "reddit", "web"]);
  for (const adapter of Object.values(adapters)) assert.equal(typeof adapter.collect, "function");
});

test("parsePlan fills the defaults", () => {
  const plan = parsePlan(planText(), new Date("2026-03-11T12:00:00Z"));
  assert.deepEqual(plan.sources, ["reddit", "github", "hn", "web"]);
  assert.equal(plan.days, 365);
  assert.equal(plan.since, "2025-03-11");
  assert.deepEqual(plan.subreddits, []);
  assert.deepEqual(plan.topics, []);
  assert.deepEqual(plan.skip, new Set());
});

test("parsePlan keeps given values and turns skip into a set", () => {
  const plan = parsePlan(planText({ sources: ["hn"], days: 7, skip: ["https://a.example/x"] }), new Date("2026-03-11T12:00:00Z"));
  assert.deepEqual(plan.sources, ["hn"]);
  assert.equal(plan.since, "2026-03-04");
  assert.deepEqual(plan.skip, new Set(["https://a.example/x"]));
});

test("parsePlan throws on an unknown source", () => {
  assert.throws(() => parsePlan(planText({ sources: ["hn", "x"] })), {
    message: "Unknown source: x. Valid: reddit, github, hn, web",
  });
});

test("parsePlan rejects a missing question, bad sources and skip entries without a scheme", () => {
  const sq = [{ ask: "a", terms: ["term one"] }];
  assert.throws(() => parsePlan(JSON.stringify({ subQuestions: sq })), /question/);
  assert.throws(() => parsePlan(planText({ sources: "hn" })), /sources/);
  assert.throws(() => parsePlan(planText({ sources: [] })), /sources/);
  assert.throws(() => parsePlan(planText({ sources: ["hn", "hn"] })), /Duplicate source: hn/);
  assert.throws(() => parsePlan(planText({ skip: ["github.com/ann/hooks"] })), /github\.com\/ann\/hooks/);
  assert.throws(() => parsePlan(planText({ skip: "https://a.example" })), /skip/);
});

test("parsePlan throws without sub-questions or terms", () => {
  assert.throws(() => parsePlan(JSON.stringify({ question: "q", subQuestions: [] })), /sub-question/);
  assert.throws(() => parsePlan(JSON.stringify({ question: "q", subQuestions: [{ ask: "a", terms: [] }] })), /terms/);
});

test("bundle prints sections, failures and uncovered sub-questions", () => {
  const plan = parsePlan(
    planText({
      sources: ["hn", "github", "web"],
      subQuestions: [
        { ask: "what runs", terms: ["term a"] },
        { ask: "who uses", terms: ["term b"] },
        { ask: "why", terms: ["term c"] },
      ],
    }),
  );
  const results = [
    { status: "fulfilled", value: { read: [{ url: "u1", text: "TEXT ONE", subs: [1] }], found: 5, failed: ["u2 failed: boom"] } },
    { status: "rejected", reason: new Error("gh missing") },
    { status: "fulfilled", value: { read: [], found: 0, failed: [] } },
  ];
  const text = bundle(plan, results);
  assert.match(text, /^# Evidence: How do hooks work\?\n/);
  assert.match(text, /Q1 what runs\nQ2 who uses\nQ3 why/);
  assert.match(text, /## hn: 1 read, 5 found\n[\s\S]*u2 failed: boom[\s\S]*TEXT ONE/);
  assert.match(text, /## github: failed\n[\s\S]*gh missing/);
  assert.match(text, /## web: 0 read, 0 found/);
  assert.match(text, /Uncovered: Q2\nUncovered: Q3\n\nReport:\nu2 failed: boom\ngithub: failed: gh missing$/);
  assert.doesNotMatch(text, /Uncovered: Q1/);
});

test("the command exits 1 with the message on an unknown source", () => {
  const run = spawnSync("node", [script], { input: planText({ sources: ["nope"] }), encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Unknown source: nope\. Valid: reddit, github, hn, web/);
  assert.equal(run.stdout, "");
});

test("the command runs when its folder is reached through a symlink", () => {
  const link = join(mkdtempSync(join(tmpdir(), "search-")), "scripts");
  symlinkSync(dirname(script), link);
  const run = spawnSync("node", [join(link, "search.mjs")], { input: planText({ sources: ["nope"] }), encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Unknown source: nope/);
});

test("parsePlan rejects a term of more than 4 words and names the sub-question and term", () => {
  const text = JSON.stringify({
    question: "q",
    subQuestions: [
      { ask: "a", terms: ["one two three four"] },
      { ask: "b", terms: ["ok term", "one two three four five"] },
    ],
  });
  assert.throws(() => parsePlan(text), { message: "Sub-question Q2 term has more than 4 words: one two three four five" });
});

test("parsePlan rejects a term that is not a string and names the sub-question", () => {
  const text = JSON.stringify({ question: "q", subQuestions: [{ ask: "a", terms: ["ok term"] }, { ask: "b", terms: [42] }] });
  assert.throws(() => parsePlan(text), { message: "Sub-question Q2 term is not a string: 42" });
});

test("parsePlan returns reads or null and rejects other values", () => {
  assert.equal(parsePlan(planText()).reads, null);
  assert.equal(parsePlan(planText({ reads: 20 })).reads, 20);
  for (const reads of [0, 1.5, "20", -1]) {
    assert.throws(() => parsePlan(planText({ reads })), { message: "Plan reads must be a whole number of at least 1" });
  }
});

test("limits splits the remainder evenly with the rest to the first sources", () => {
  assert.deepEqual(limits(10, 3), [4, 3, 3]);
  assert.deepEqual(limits(2, 3), [1, 1, 0]);
  assert.deepEqual(limits(Infinity, 2), [Infinity, Infinity]);
});

const fakeSource = (total) => ({
  collect: async (plan, state, limit) => {
    const from = state?.next ?? 0;
    const count = Math.min(limit, total - from);
    const read = Array.from({ length: count }, (_, i) => ({ url: `u${from + i}`, text: "T", subs: [1] }));
    return { read, found: total, failed: [], state: { next: from + count }, done: from + count >= total };
  },
});

test("two calls of one run never read more than reads and the second continues the state", async () => {
  const saved = { ...adapters };
  Object.assign(adapters, { hn: fakeSource(10), github: fakeSource(10) });
  try {
    const plan = parsePlan(planText({ sources: ["hn", "github"], reads: 7 }));
    const run = newRun({});
    await advance(plan, run);
    assert.equal(run.read, 7);
    assert.match(bundle(plan, [null, null], run, "/tmp/r.json"), /Done: read 7 of 7\.$/);
    const wide = parsePlan(planText({ sources: ["hn", "github"], reads: 30 }));
    const run2 = newRun({});
    await advance(wide, run2);
    assert.equal(run2.read, 20);
    assert.deepEqual(run2.done, ["hn", "github"]);
    assert.match(bundle(wide, [null, null], run2, "/tmp/r.json"), /Stopped: read 20 of 30, no candidates left\.$/);
    const partial = parsePlan(planText({ sources: ["hn", "github"], reads: 12 }));
    const run3 = newRun({});
    await advance(partial, run3);
    assert.equal(run3.read, 12);
    const more = parsePlan(planText({ sources: ["hn", "github"], reads: 14 }));
    const run4 = newRun({});
    run4.read = 4;
    await advance(more, run4);
    assert.equal(run4.read, 14);
  } finally {
    Object.assign(adapters, saved);
  }
});

test("advance calls no source that has no reads left to give and keeps it for a later call", async () => {
  const saved = { ...adapters };
  const calls = [];
  for (const name of Object.keys(adapters)) adapters[name] = { collect: async (_plan, _state, limit) => (calls.push(`${name}:${limit}`), { read: [], found: 0, failed: [], state: null, done: true }) };
  try {
    const plan = parsePlan(planText({ sources: ["hn", "github", "web"], reads: 2 }));
    const run = newRun({});
    await advance(plan, run);
    assert.deepEqual(calls, ["hn:1", "github:1"]);
    assert.deepEqual(run.done, ["hn", "github"]);
    calls.length = 0;
    const finished = { ...newRun({}), read: 2 };
    await advance(plan, finished);
    assert.deepEqual(calls, []);
    assert.deepEqual(finished.done, []);
  } finally {
    Object.assign(adapters, saved);
  }
});

test("the end line names the failed sources instead of saying no candidates are left", async () => {
  const saved = { ...adapters };
  for (const name of ["hn", "github"]) adapters[name] = { collect: async () => Promise.reject(new Error("down")) };
  try {
    const plan = parsePlan(planText({ sources: ["hn", "github"], reads: 20 }));
    const run = newRun({});
    const results = await advance(plan, run);
    assert.match(bundle(plan, results, run, "/tmp/r.json"), /Stopped: read 0 of 20, failed: hn, github\.$/);
  } finally {
    Object.assign(adapters, saved);
  }
});

test("bundle ends with More and the continue command while sources are not done", () => {
  const plan = parsePlan(planText({ sources: ["hn"], reads: 9 }));
  const run = { ...newRun({}), read: 3, covered: [1] };
  const text = bundle(plan, [{ status: "fulfilled", value: { read: [], found: 0, failed: [] } }], run, "/tmp/r.json");
  assert.match(text, /\nMore: read 3 of 9\. Continue: node ".*search\.mjs" --continue "\/tmp\/r\.json"$/);
});

test("--continue on a missing file exits 1 without reading stdin", () => {
  const run = spawnSync("node", [script, "--continue", "/nonexistent/run.json"], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Cannot continue \/nonexistent\/run\.json: /);
});

test("parsePlan rejects more than 2 terms and a term of fewer than 2 words", () => {
  const terms = (list) => JSON.stringify({ question: "q", subQuestions: [{ ask: "a", terms: list }] });
  assert.throws(() => parsePlan(terms(["one two", "three four", "five six"])), { message: "Sub-question Q1 has more than 2 terms" });
  assert.throws(() => parsePlan(terms(["single"])), { message: "Sub-question Q1 term has fewer than 2 words: single" });
  assert.throws(() => parsePlan(terms(["one two", "   "])), /fewer than 2 words/);
});

test("parsePlan rejects days that is not a whole number of at least 1", () => {
  for (const days of [0, -3, 1.5, "7", null]) {
    assert.throws(() => parsePlan(planText({ days })), { message: "Plan days must be a whole number of at least 1" });
  }
  assert.equal(parsePlan(planText({ days: 1 })).days, 1);
});

test("parsePlan rejects a subreddit and a topic that break their pattern and names the value", () => {
  assert.throws(() => parsePlan(planText({ subreddits: ["ClaudeAI", "r/x"] })), { message: "Plan subreddit is not valid: r/x" });
  assert.throws(() => parsePlan(planText({ subreddits: ["a"] })), /subreddit/);
  assert.throws(() => parsePlan(planText({ subreddits: "ClaudeAI" })), /subreddits/);
  assert.throws(() => parsePlan(planText({ topics: ["claude-code", "Bad Topic"] })), { message: "Plan topic is not valid: Bad Topic" });
  assert.throws(() => parsePlan(planText({ topics: ["-x"] })), /topic/);
  assert.throws(() => parsePlan(planText({ topics: "claude" })), /topics/);
  const plan = parsePlan(planText({ subreddits: ["ClaudeAI", "a_b2"], topics: ["claude-code", "ai"] }));
  assert.deepEqual(plan.subreddits, ["ClaudeAI", "a_b2"]);
  assert.deepEqual(plan.topics, ["claude-code", "ai"]);
});

test("a source that never resolves times out as failed while the other source prints and is not retried", async () => {
  const saved = { ...adapters };
  adapters.hn = { collect: () => new Promise(() => {}) };
  adapters.github = fakeSource(1);
  try {
    const plan = parsePlan(planText({ sources: ["hn", "github"], reads: 20 }));
    const run = newRun({});
    const results = await advance(plan, run, 20);
    const text = bundle(plan, results, run, "/tmp/r.json");
    assert.match(text, /## hn: failed\n\ntimed out after 0\.02 s/);
    assert.match(text, /## github: 1 read, 1 found/);
    assert.deepEqual(run.failed, ["hn"]);
    assert.ok(run.done.includes("hn"));
  } finally {
    Object.assign(adapters, saved);
  }
});

test("bundle prints Report: none when nothing limited the call", () => {
  const plan = parsePlan(planText({ sources: ["hn"] }));
  const text = bundle(plan, [{ status: "fulfilled", value: { read: [{ url: "u", text: "T", subs: [1] }], found: 1, failed: [] } }]);
  assert.match(text, /\n\nReport: none$/);
});

test("bundle orders Uncovered, Report, Bundle and the end line and repeats each limit line", () => {
  const plan = parsePlan(planText({ sources: ["hn"], reads: 9 }));
  const run = { ...newRun({}), read: 1 };
  const failed = ["no hits: hook events", "dropped 2 of 50 searches: limit is 40: a, b", "search failed: boom"];
  const text = bundle(plan, [{ status: "fulfilled", value: { read: [], found: 0, failed } }], run, "/tmp/r.json");
  const tail = text.slice(text.indexOf("Uncovered:"));
  assert.match(tail, /^Uncovered: Q1\n\nReport:\nno hits: hook events\ndropped 2 of 50 searches: limit is 40: a, b\nsearch failed: boom\n\nBundle: \/tmp\/r\.md\n\nMore: read 1 of 9\./);
});

test("record writes the bundle for a run without reads and appends the next call to the same file", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-test-"));
  const file = join(dir, "1.json");
  const empty = { status: "fulfilled", value: { read: [], found: 0, failed: [] } };
  const plan = parsePlan(planText({ sources: ["hn"] }));
  const first = record(plan, [empty], newRun({}), file);
  assert.equal(readFileSync(join(dir, "1.md"), "utf8"), `${first}\n`);
  const second = record(plan, [{ status: "rejected", reason: new Error("late") }], newRun({}), file);
  assert.equal(readFileSync(join(dir, "1.md"), "utf8"), `${first}\n${second}\n`);
  assert.match(second, /Report:\nhn: failed: late\n\nBundle: .*1\.md$/);
});

test("parsePlan rejects a days value too large for a date and names days", () => {
  assert.throws(() => parsePlan(planText({ days: 1000000000 })), /Plan days is too large: 1000000000/);
});

test("bundlePath always gives a different .md path", () => {
  assert.equal(bundlePath("/tmp/run.json"), "/tmp/run.md");
  assert.equal(bundlePath("/tmp/run"), "/tmp/run.md");
});

test("a continued run prints its whole bundle through a pipe", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-big-"));
  const file = join(dir, "run.json");
  const question = "q".repeat(300000);
  const plan = JSON.parse(planText({ question, sources: ["hn"], reads: 1 }));
  writeFileSync(file, JSON.stringify({ plan, read: 0, covered: [], states: {}, done: ["hn"], failed: [] }));
  const run = spawnSync("node", [script, "--continue", file], { encoding: "utf8", maxBuffer: 10000000 });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.length > 300000);
  assert.ok(run.stdout.trimEnd().endsWith("."));
});
