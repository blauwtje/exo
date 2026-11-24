import test from "node:test";
import assert from "node:assert/strict";
import { misses } from "../skills/search/scripts/verify.mjs";

test("a summary link to a host outside hosts is flagged", () => {
  const answer = "https://other.example/page (summary; verify)";
  assert.deepEqual(misses(answer, [""], undefined, ["github.com"]), ["link outside hosts: https://other.example/page"]);
});

test("a summary link to an allowed host passes", () => {
  const answer = "https://github.com/page (summary; verify)";
  assert.deepEqual(misses(answer, [""], undefined, ["github.com"]), []);
});
