import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSource } from "../skills/search/scripts/claims.mjs";
import { readBest } from "../skills/search/scripts/pick.mjs";

const plan = (run, sub) => ({ question: "q", sources: ["hn"], skip: new Set(), subQuestions: [{ ask: "one", terms: ["t"] }], run, sub });

const A = "https://x.com/a";
const B = "https://x.com/b";

const source = (urls, open) => ({
  find: async () => ({ lists: [urls.map((url) => ({ url, title: url, facts: "f" }))], failed: [] }),
  open,
});

const page = (url) => ({ header: `H ${url}`, passages: [{ id: "p1", parent: null, label: "u/a", score: 1, body: "body", link: `${url}#p1` }] });

const chooseAll = async (prompt, _plan, _header, items) =>
  prompt === "judge" ? items.map(({ id }) => ({ id, reason: "r" })) : [{ id: "p1", reason: "Q1 good" }];

test("a read page is kept and a read error is reported when the claim mark fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pick-claim-mark-"));
  const open = async ({ url }) => {
    for (const name of readdirSync(join(dir, "claims"))) unlinkSync(join(dir, "claims", name));
    if (url === B) throw new Error("page down");
    return page(url);
  };
  const result = await readBest(plan(dir, "Q1"), source([A, B], open), chooseAll);
  assert.deepEqual(result.read.map(({ url }) => url), [A]);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /^https:\/\/x\.com\/b failed: page down$/);
});

test("a read page is dropped when another sub took its claim during the read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pick-claim-mark-"));
  const open = async ({ url }) => {
    claimSource(dir, url, "Q2", { now: Date.now() + 1e9 });
    return page(url);
  };
  const result = await readBest(plan(dir, "Q1"), source([A], open), chooseAll);
  assert.deepEqual(result.read, []);
  assert.deepEqual(result.failed, []);
});
