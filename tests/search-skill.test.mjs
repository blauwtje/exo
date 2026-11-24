import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePlan } from "../skills/search/scripts/search.mjs";

const skillDir = fileURLToPath(new URL("../skills/search/", import.meta.url));
const skill = readFileSync(`${skillDir}SKILL.md`, "utf8");
const worker = readFileSync(`${skillDir}references/worker.md`, "utf8");

test("the plan example in the heredoc passes parsePlan", () => {
  const [, plan] = worker.match(/<<'PLAN'\n([\s\S]*?)\nPLAN/);
  assert.doesNotThrow(() => parsePlan(plan));
});

test("every script the skill names exists", () => {
  const names = [...skill.matchAll(/scripts\/([\w-]+\.mjs)/g)].map(([, name]) => name);
  assert.ok(["rank.mjs", "verify.mjs", "reddit.mjs"].every((name) => names.includes(name)));
  for (const name of names) assert.ok(existsSync(`${skillDir}scripts/${name}`), name);
});

test("the skill holds no --only and no model for the workers or the claim check", () => {
  assert.doesNotMatch(skill, /--only/);
  assert.doesNotMatch(skill, /sonnet|opus/i);
});

test("the skill names the fan-out cap, the run files and the claim check", () => {
  for (const name of ["CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS", "docs/research/", "plan.json", "ranked.json"])
    assert.ok(skill.includes(name), name);
  assert.match(skill, /claim check/i);
});

test("every skill dir path the skill names exists", () => {
  const paths = [...skill.matchAll(/\$\{CLAUDE_SKILL_DIR\}(\/[\w./-]+)/g)].map(([, path]) => path);
  assert.ok(paths.length > 0);
  for (const path of paths) assert.ok(existsSync(`${skillDir}${path.slice(1)}`), path);
});

test("worker.md names a read target per tier and SKILL.md passes it to each worker", () => {
  for (const tier of ["quick", "standard", "deep"])
    assert.match(worker, new RegExp(`${tier}: (fetch )?at least \\d+`, "i"), tier);
  assert.match(skill, /read target/i);
});
