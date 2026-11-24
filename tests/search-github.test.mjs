import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { find, issueCards, open, repoCards, sections } from "../skills/search/scripts/github.mjs";

const plan = {
  question: "q",
  sources: ["github"],
  days: 30,
  since: "2026-01-01",
  topics: ["claude-code", "hooks"],
  skip: new Set(),
  subQuestions: [
    { ask: "first", terms: ["alpha", "beta"] },
    { ask: "second", terms: ["gamma"] },
  ],
};

function fakeGh(respond) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const log = join(dir, "calls.jsonl");
  const responses = join(dir, "respond.mjs");
  writeFileSync(responses, `export default ${respond.toString()};`);
  writeFileSync(
    join(dir, "gh"),
    `#!${process.execPath}\nimport { appendFileSync } from "node:fs";\nconst args = process.argv.slice(2);\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");\nconst { default: respond } = await import(${JSON.stringify(responses)});\nconst out = respond(args);\nif (out instanceof Error) { process.stderr.write(out.message); process.exit(1); }\nprocess.stdout.write(typeof out === "string" ? out : JSON.stringify(out));\n`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  const original = process.env.PATH;
  process.env.PATH = `${dir}:${original}`;
  return {
    calls: () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)),
    restore: () => (process.env.PATH = original),
  };
}

const repoRow = { fullName: "ann/hooks", url: "https://github.com/ann/hooks", description: "Hook kit", stargazersCount: 120, pushedAt: "2026-03-05T10:00:00Z" };
const issueRow = {
  title: "Hook fails",
  url: "https://github.com/ann/hooks/issues/12",
  body: "It breaks",
  commentsCount: 2,
  createdAt: "2026-02-01T00:00:00Z",
  repository: { nameWithOwner: "ann/hooks" },
};

test("repoCards and issueCards turn gh rows into cards", () => {
  assert.deepEqual(repoCards([repoRow]), [
    { url: "https://github.com/ann/hooks", title: "ann/hooks", facts: "120 stars | pushed 2026-03-05 | Hook kit", signals: { stars: 120, date: "2026-03-05" } },
  ]);
  assert.deepEqual(issueCards([issueRow]), [
    { url: "https://github.com/ann/hooks/issues/12", title: "ann/hooks: Hook fails", facts: "2 comments | 2026-02-01", signals: { comments: 2, date: "2026-02-01" } },
  ]);
});

test("sections gives one passage per heading with an anchored link", () => {
  const markdown = "Intro text\n\n# Title\n\n## Install & Run\nnpm i\n\n```sh\n# not a heading\n```\n\n## Usage\nrun it\n";
  const passages = sections(markdown, "https://github.com/ann/hooks");
  assert.deepEqual(
    passages.map(({ label, link }) => [label, link]),
    [
      ["Overview", "https://github.com/ann/hooks"],
      ["Install & Run", "https://github.com/ann/hooks#install--run"],
      ["Usage", "https://github.com/ann/hooks#usage"],
    ],
  );
  assert.match(passages[1].body, /npm i[\s\S]*# not a heading/);
  assert.equal(new Set(passages.map(({ id }) => id)).size, 3);
});

test("find runs repo searches per term, per topic and issue searches per sub-question, in that order", async () => {
  const gh = fakeGh((args) => (args[1] === "repos" ? [{ fullName: "ann/hooks", url: "https://github.com/ann/hooks", description: null, stargazersCount: 1, pushedAt: "2026-03-05T10:00:00Z" }] : []));
  try {
    const { lists, failed } = await find(plan);
    const calls = gh.calls();
    assert.equal(calls.filter((args) => args[1] === "repos").length, 7);
    assert.equal(calls.filter((args) => args[1] === "issues").length, 2);
    assert.ok(calls.some((args) => args[1] === "repos" && args[2] === "beta pushed:>=2026-01-01" && !args.includes("--topic")));
    assert.ok(calls.some((args) => args[1] === "repos" && args[2].startsWith("gamma ") && args.join(" ").includes("--topic hooks")));
    assert.ok(calls.some((args) => args[1] === "issues" && args[2] === "gamma created:>=2026-01-01"));
    assert.ok(calls.filter((args) => args[1] === "issues").every((args) => args[2].endsWith(" created:>=2026-01-01")));
    assert.equal(lists.length, 9);
    assert.equal(lists[0][0].title, "ann/hooks");
    assert.deepEqual(failed, ['no hits: issues "alpha"', 'no hits: issues "gamma"']);
  } finally {
    gh.restore();
  }
});

test("find drops topic searches first and reports the dropped count at 20 gh calls", async () => {
  const many = {
    ...plan,
    topics: ["a", "b", "c", "d", "e", "f"],
    subQuestions: Array.from({ length: 7 }, (_, index) => ({ ask: `q${index}`, terms: [`x${index}`, `y${index}`] })),
  };
  const gh = fakeGh(() => []);
  try {
    const { failed } = await find(many);
    const calls = gh.calls();
    assert.equal(calls.length, 20);
    assert.equal(calls.filter((args) => args[1] === "repos").length, 14);
    assert.equal(calls.filter((args) => args[1] === "issues").length, 6);
    assert.ok(calls.every((args) => !args.includes("--topic")));
    const [, prefix, labels] = failed.at(-1).match(/^(dropped 43 of 63 searches: limit is 20): (.*)$/);
    assert.equal(prefix, "dropped 43 of 63 searches: limit is 20");
    const list = labels.split(", ");
    assert.equal(list.length, 43);
    assert.equal(list[0], 'issues "x6"');
    assert.equal(list[1], 'repos "x0" topic a');
    assert.equal(list.at(-1), 'repos "x6" topic f');
  } finally {
    gh.restore();
  }
});

test("find keeps the searches that succeeded and reports each failed one", async () => {
  const gh = fakeGh((args) => (args[2].startsWith("beta ") ? new Error("rate limited") : []));
  try {
    const { lists, failed } = await find(plan);
    assert.equal(lists.length, 8);
    assert.ok(failed.includes('no hits: repos "alpha" topic hooks'));
    assert.ok(failed.includes('no hits: repos "gamma"'));
    assert.equal(failed.filter((line) => line.startsWith("search failed: ")).length, 1);
    assert.match(failed.find((line) => line.startsWith("search failed: ")), /rate limited/);
  } finally {
    gh.restore();
  }
});

test("open reads a repo README into sections", async () => {
  const gh = fakeGh(() => "# Hooks\n\n## Usage\nrun it\n");
  try {
    const { header, passages } = await open({ url: "https://github.com/ann/hooks", title: "ann/hooks" });
    assert.deepEqual(gh.calls()[0], ["api", "-H", "Accept: application/vnd.github.raw", "repos/ann/hooks/readme"]);
    assert.match(header, /ann\/hooks/);
    assert.match(header, /https:\/\/github.com\/ann\/hooks/);
    assert.deepEqual(passages.map(({ label }) => label), ["Usage"]);
  } finally {
    gh.restore();
  }
});

test("open reads an issue body as header and comments as passages", async () => {
  const gh = fakeGh((args) =>
    args.at(-1).endsWith("/comments")
      ? [[{ id: 55, user: { login: "bob" }, body: "me too", html_url: "https://github.com/ann/hooks/issues/12#issuecomment-55" }], [{ id: 56, user: { login: "cy" }, body: "same", html_url: "https://github.com/ann/hooks/issues/12#issuecomment-56" }]]
      : { title: "Hook fails", body: "It breaks", user: { login: "ann" }, html_url: "https://github.com/ann/hooks/issues/12", created_at: "2026-02-01T00:00:00Z" },
  );
  try {
    const { header, passages } = await open({ url: "https://github.com/ann/hooks/issues/12", title: "ann/hooks: Hook fails" });
    assert.deepEqual(gh.calls().map((args) => args.at(-1)).sort(), ["repos/ann/hooks/issues/12", "repos/ann/hooks/issues/12/comments"]);
    assert.match(header, /Hook fails/);
    assert.match(header, /u\/ann/);
    assert.match(header, /It breaks/);
    assert.deepEqual(passages.map(({ id }) => id), ["55", "56"]);
    assert.ok(gh.calls().some((args) => args.includes("--paginate") && args.includes("--slurp")));
  } finally {
    gh.restore();
  }
});

test("find turns a gh call that outlasts EXO_SEARCH_FETCH_MS into one search failed line", async () => {
  process.env.EXO_SEARCH_FETCH_MS = "300";
  const gh = fakeGh((args) => {
    if (args[2].startsWith("beta ")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
    return [];
  });
  try {
    const { failed } = await find(plan);
    assert.equal(failed.filter((line) => line.startsWith("search failed: ")).length, 1);
  } finally {
    gh.restore();
    delete process.env.EXO_SEARCH_FETCH_MS;
  }
});
