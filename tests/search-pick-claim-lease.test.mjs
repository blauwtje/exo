import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBest } from "../skills/search/scripts/pick.mjs";

const plan = (run, sub) => ({ question: "q", sources: ["hn"], skip: new Set(), subQuestions: [{ ask: "one", terms: ["t"] }], run, sub });

const URL_A = "https://x.com/a";

const source = (open) => ({
  find: async () => ({ lists: [[{ url: URL_A, title: URL_A, facts: "f" }]], failed: [] }),
  open,
});

const page = async ({ url }) => ({ header: `H ${url}`, passages: [{ id: "p1", parent: null, label: "u/a", score: 1, body: "body", link: `${url}#p1` }] });

const chooseAll = async (prompt, _plan, _header, items) =>
  prompt === "judge" ? items.map(({ id }) => ({ id, reason: "r" })) : [{ id: "p1", reason: "Q1 good" }];

test("a claim held by a reader that never finishes can be taken by another sub after the read lease", async (t) => {
  process.env.EXO_SEARCH_URL_BUDGET_MS = "5";
  process.env.EXO_SEARCH_FETCH_MS = "5";
  t.after(() => {
    delete process.env.EXO_SEARCH_URL_BUDGET_MS;
    delete process.env.EXO_SEARCH_FETCH_MS;
  });
  const dir = mkdtempSync(join(tmpdir(), "pick-claim-lease-"));
  let opened;
  const started = new Promise((resolve) => (opened = resolve));
  readBest(plan(dir, "Q1"), source(() => (opened(), new Promise(() => {}))), chooseAll);
  await started;
  const claims = join(dir, "claims");
  for (const name of readdirSync(claims)) {
    const file = join(claims, name);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), leaseUntil: 1 }));
  }
  const second = await readBest(plan(dir, "Q2"), source(page), chooseAll);
  assert.deepEqual(second.read.map(({ url }) => url), [URL_A]);
});
