import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSource } from "../skills/search/scripts/claims.mjs";
import { readBest } from "../skills/search/scripts/pick.mjs";

const plan = (run, sub) => ({ question: "q", sources: ["hn"], skip: new Set(), subQuestions: [{ ask: "one", terms: ["t"] }], run, sub });

const source = (urls, opened, broken = new Set()) => ({
  find: async () => ({ lists: [urls.map((url) => ({ url, title: url, facts: "f" }))], failed: [] }),
  open: async ({ url }) => {
    opened.push(url);
    if (broken.has(url)) throw new Error("page down");
    return { header: `H ${url}`, passages: [{ id: "p1", parent: null, label: "u/a", score: 1, body: "body", link: `${url}#p1` }] };
  },
});

const chooseAll = async (prompt, _plan, _header, items) =>
  prompt === "judge" ? items.map(({ id }) => ({ id, reason: "r" })) : [{ id: "p1", reason: "Q1 good" }];

const A = "https://x.com/a";
const B = "https://x.com/b";

test("a hit another sub holds is skipped without opening it, and a hit whose read failed is left to another sub", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pick-claim-first-"));
  const first = await readBest(plan(dir, "Q1"), source([A, B], [], new Set([B])), chooseAll);
  assert.deepEqual(first.read.map(({ url }) => url), [A]);
  const opened = [];
  const second = await readBest(plan(dir, "Q2"), source([A, B], opened), chooseAll);
  assert.deepEqual(opened, [B]);
  assert.deepEqual(second.read.map(({ url }) => url), [B]);
});

test("a claim error on one hit goes into failed and the other hits are still read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pick-claim-first-"));
  claimSource(dir, A, "Q9");
  const [record] = readdirSync(join(dir, "claims"));
  unlinkSync(join(dir, "claims", record));
  mkdirSync(join(dir, "claims", record));
  const result = await readBest(plan(dir, "Q1"), source([A, B], []), chooseAll);
  assert.deepEqual(result.read.map(({ url }) => url), [B]);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /^https:\/\/x\.com\/a failed: /);
});
