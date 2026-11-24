import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPage } from "../skills/search/scripts/fetch.mjs";

process.env.EXO_SEARCH_URL_BUDGET_MS = "300";
process.env.EXO_SEARCH_DOMAIN_GAP_MS = "0";

test("one hanging URL fails within the per-URL time budget", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "exo-fetch-budget-"));
  const hang = () => new Promise(() => {});
  const startedAt = Date.now();
  const outcome = await Promise.race([
    fetchPage("https://example.com/slow", { cacheDir, fetchImpl: hang }).then(() => "resolved", () => "rejected"),
    new Promise((resolve) => setTimeout(resolve, 1500, "still hanging")),
  ]);
  assert.equal(outcome, "rejected", "fetchPage still hanging after 1500 ms with a 300 ms budget");
  assert.ok(Date.now() - startedAt < 1000);
});
