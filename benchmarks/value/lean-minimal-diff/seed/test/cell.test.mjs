import assert from "node:assert/strict";
import test from "node:test";

import { cell, line } from "../src/shared/cell.mjs";

test("plain text and numbers pass through", () => {
  assert.equal(cell("abc"), "abc");
  assert.equal(cell(-5), "-5");
});

test("null and undefined are empty", () => {
  assert.equal(cell(null), "");
  assert.equal(cell(undefined), "");
});

test("a formula-looking string gets a leading apostrophe", () => {
  assert.equal(cell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
});

test("the separator, a double quote and a line break wrap the cell", () => {
  assert.equal(cell("a,b"), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell("a\nb"), '"a\nb"');
});

test("the separator is a parameter", () => {
  assert.equal(cell("a,b", "\t"), "a,b");
  assert.equal(cell("a\tb", "\t"), '"a\tb"');
});

test("line joins the cells", () => {
  assert.equal(line(["a", "b,c", null]), 'a,"b,c",');
});
