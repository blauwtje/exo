import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { misses } from "../skills/search/scripts/verify.mjs";

const script = fileURLToPath(new URL("../skills/search/scripts/verify.mjs", import.meta.url));
const bundleText = "## hn\nhttps://news.ycombinator.com/item?id=1\nThe  hooks run\nbefore every tool call.\nSee https://example.com/a for more";

test("quotes and urls copied from the bundle are not missed", () => {
  const answer = "Finding\n> The hooks run before every tool call.\n> \nlink https://example.com/a).\n(https://news.ycombinator.com/item?id=1)";
  assert.deepEqual(misses(answer, [bundleText]), []);
});

test("an invented quote is missed and a changed case is missed", () => {
  assert.deepEqual(misses("> the hooks run", [bundleText]), ["missing quote: the hooks run"]);
  assert.deepEqual(misses("> Hooks never run", [bundleText]), ["missing quote: Hooks never run"]);
});

test("an invented url is missed", () => {
  assert.deepEqual(misses("see https://example.com/b.", [bundleText]), ["missing url: https://example.com/b"]);
});

test("a quote or url found in any bundle passes", () => {
  assert.deepEqual(misses("> second bundle text\nhttps://other.example/z", ["x", "second bundle text https://other.example/z"]), []);
});

const run = (answer, ...texts) => {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  const files = texts.map((text, index) => {
    const file = join(dir, `${index}.md`);
    writeFileSync(file, text);
    return file;
  });
  return spawnSync("node", [script, ...files], { input: answer, encoding: "utf8" });
};

test("the command exits 1 listing each miss and 0 when all is found", () => {
  const bad = run("> invented\nhttps://nope.example/x", bundleText);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /missing quote: invented\nmissing url: https:\/\/nope\.example\/x/);
  const good = run("> The hooks run before every tool call.", bundleText);
  assert.equal(good.status, 0);
});

test("the command exits 1 on an unreadable bundle", () => {
  const result = spawnSync("node", [script, "/nonexistent/bundle.md"], { input: "x", encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundle\.md/);
});

test("a quote flagged as not on its page is missed", () => {
  const flagged = "> Hooks run before tools.\n(quote not found on page)";
  assert.deepEqual(misses("> Hooks run before tools.", [flagged]), ["missing quote: Hooks run before tools."]);
});

test("urls wrapped in angle brackets, bold or quotes still match", () => {
  const answer = "<https://example.com/a> **(https://example.com/a)** \"https://example.com/a\" https://example.com/a: https://example.com/a! [https://example.com/a]";
  assert.deepEqual(misses(answer, [bundleText]), []);
});
