import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePlan } from "../skills/search/scripts/search.mjs";

const skillDir = fileURLToPath(new URL("../skills/search/", import.meta.url));
const skill = readFileSync(`${skillDir}SKILL.md`, "utf8");

test("the plan example in the heredoc passes parsePlan", () => {
  const [, plan] = skill.match(/<<'PLAN'\n([\s\S]*?)\nPLAN/);
  assert.doesNotThrow(() => parsePlan(plan));
});

test("every script the skill names exists", () => {
  const names = [...skill.matchAll(/scripts\/([\w-]+\.mjs)/g)].map(([, name]) => name);
  assert.ok(names.includes("search.mjs") && names.includes("verify.mjs") && names.includes("reddit.mjs"));
  for (const name of names) assert.ok(existsSync(`${skillDir}scripts/${name}`), name);
});
