import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync(new URL("../guide/search.md", import.meta.url), "utf8");

test("the search guide documents no --only flag", () => {
  assert.doesNotMatch(guide, /--only/);
});

test("the search guide lists no web source", () => {
  assert.doesNotMatch(guide, /\bthe web\b|`web`/);
});
