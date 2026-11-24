import test from "node:test";
import assert from "node:assert/strict";
import { misses } from "../skills/search/scripts/verify.mjs";

test("a link missing from the bundles and outside hosts is reported once", () => {
  assert.deepEqual(misses("see https://other.example/page", [""], undefined, ["github.com"]), ["missing url: https://other.example/page"]);
});
