import test from "node:test";
import assert from "node:assert/strict";
import { claimSource } from "../skills/search/scripts/claims.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("one page tagged with different utm parameters is one source and keeps its other parameters", () => {
  const dir = mkdtempSync(join(tmpdir(), "canonical-utm-"));
  claimSource(dir, "https://example.com/a?id=7&utm_source=x", "Q1", { now: 0 });
  assert.deepEqual(claimSource(dir, "https://example.com/a?utm_medium=y&utm_campaign=z&id=7", "Q2", { now: 1 }), { taken: "Q1" });
  assert.deepEqual(claimSource(dir, "https://example.com/a?id=8", "Q2", { now: 2 }), { claimed: true });
});
