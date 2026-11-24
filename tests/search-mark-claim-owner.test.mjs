import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSource, markClaim } from "../skills/search/scripts/claims.mjs";

const URL_A = "https://example.com/a";
const records = (dir) =>
  readdirSync(join(dir, "claims"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, "claims", name), "utf8")));

test("a sub whose lease expired and was taken over cannot mark the new holder's claim", () => {
  const dir = mkdtempSync(join(tmpdir(), "claims-"));
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 });
  claimSource(dir, URL_A, "Q2", { now: 1000, leaseMs: 1000 });
  assert.equal(markClaim(dir, URL_A, "Q1", { status: "failed" }), false);
  assert.deepEqual(records(dir).map(({ sub, status }) => ({ sub, status })), [
    { sub: "Q1", status: undefined },
    { sub: "Q2", status: undefined },
  ]);
  assert.equal(markClaim(dir, URL_A, "Q2", { status: "ok" }), true);
  assert.deepEqual(records(dir).map(({ sub, status }) => ({ sub, status })), [
    { sub: "Q1", status: undefined },
    { sub: "Q2", status: "ok" },
  ]);
});
