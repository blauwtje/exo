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

test("a line marked (summary; verify) is skipped for its quote and url", () => {
  const answer = "https://summary.example/page (summary; verify)\n> not on any page (summary; verify)\n> not on any page either";
  assert.deepEqual(misses(answer, [bundleText]), ["missing quote: not on any page either"]);
});

test("an evidence id that is not in the ranked file is listed once", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  const ranked = join(dir, "ranked.json");
  writeFileSync(ranked, JSON.stringify({ ranked: [{ id: "E1" }, { id: "E2" }] }));
  const bundle = join(dir, "bundle.md");
  writeFileSync(bundle, bundleText);
  const result = spawnSync("node", [script, "--ranked", ranked, bundle], { input: "Hooks run [E1] [E7]. Again [E7] and [E2].", encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), "unknown evidence id: E7");
});

const withPlan = (plan) => {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  const ranked = join(dir, "ranked.json");
  writeFileSync(ranked, JSON.stringify({ ranked: [{ id: "E1" }] }));
  if (plan) writeFileSync(join(dir, "plan.json"), JSON.stringify(plan));
  const bundle = join(dir, "bundle.md");
  writeFileSync(bundle, "https://github.com/a/b https://docs.github.com/x https://notgithub.com/y https://example.com/z");
  return { ranked, bundle };
};

const verifyWith = (plan, answer) => {
  const { ranked, bundle } = withPlan(plan);
  return spawnSync("node", [script, "--ranked", ranked, bundle], { input: answer, encoding: "utf8" });
};

test("a link outside the plan hosts is flagged and a listed host or subdomain passes", () => {
  const answer = "See https://github.com/a/b and https://docs.github.com/x [E1] and https://notgithub.com/y and https://example.com/z";
  const result = verifyWith({ hosts: ["github.com", "example.com"] }, answer);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), "link outside hosts: https://notgithub.com/y");
});

test("without hosts in plan.json or without plan.json the links are not flagged", () => {
  const answer = "See https://notgithub.com/y [E1]";
  assert.equal(verifyWith({ other: 1 }, answer).status, 0);
  assert.equal(verifyWith(null, answer).status, 0);
});

test("an indented quote line is checked like a flush one", () => {
  assert.deepEqual(misses("  > Hooks never run", [bundleText]), ["missing quote: Hooks never run"]);
  assert.deepEqual(misses("  > The hooks run before every tool call.", [bundleText]), []);
});
