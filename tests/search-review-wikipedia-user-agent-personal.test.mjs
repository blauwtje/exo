import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wikipedia.mjs holds no personal github.com URL", () => {
  const source = readFileSync(new URL("../skills/search/scripts/wikipedia.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /github\.com\/[\w-]+/);
});
