import test from "node:test";
import assert from "node:assert/strict";
import { changedFileTree } from "../lib/draw.mjs";

test("groups changed paths into an indented tree", () => {
  const tree = changedFileTree(["lib/b.mjs", "lib/a.mjs", "README.md", "tests/x/y.mjs"]);
  assert.equal(tree, ["README.md", "lib", "  a.mjs", "  b.mjs", "tests", "  x", "    y.mjs"].join("\n"));
});

test("returns an empty string for no paths", () => {
  assert.equal(changedFileTree([]), "");
});
