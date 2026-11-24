import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../skills/search/references/worker.md", import.meta.url), "utf8");
const skill = readFileSync(new URL("../skills/search/SKILL.md", import.meta.url), "utf8");

test("worker copies failed-source lines as Failed: <source> <reason>", () => {
  assert.match(worker, /Failed: <source> <reason>/);
});

test("lead lists Failed lines under the report Gaps", () => {
  assert.match(skill, /Failed[^\n]*Gaps|Gaps[^\n]*Failed/);
});
