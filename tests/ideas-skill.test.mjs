import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("../skills/ideas/", import.meta.url));
const skill = readFileSync(`${skillDir}SKILL.md`, "utf8");
const judge = readFileSync(`${skillDir}references/judge.md`, "utf8");

test("the skill names exactly three prompt files and each exists", () => {
  const paths = [...skill.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w-]+\/[\w-]+\.md)/g)].map(([, path]) => path);
  assert.equal(new Set(paths).size, 3);
  for (const path of paths) assert.ok(existsSync(`${skillDir}${path}`), path);
});

test("references holds exactly scout, generate and judge", () => {
  assert.deepEqual(readdirSync(`${skillDir}references`).sort(), ["generate.md", "judge.md", "scout.md"]);
});

test("every helper runs on sonnet", () => {
  const lines = skill.split("\n");
  const step = (name) => lines.find((line) => line.includes(name));
  assert.equal(lines.filter((line) => /model (fable|opus)/i.test(line)).length, 0);
  assert.match(step("scout.md"), /model sonnet, effort medium/);
  const generate = lines.filter((line) => line.includes("generate.md"));
  assert.equal(generate.length, 2);
  for (const line of generate) assert.match(line, /model sonnet, effort high/);
  assert.match(step("judge.md"), /model sonnet, effort high/);
});

test("the skill and the judge prompt state the strong rule", () => {
  for (const text of [skill, judge]) {
    assert.match(text, /16/);
    assert.match(text, /both orders/);
  }
});

test("the skill has no extra round", () => {
  assert.doesNotMatch(skill, /report-r2\.md|ideas-r2\.md/);
});
