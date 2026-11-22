import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("../skills/ideas/", import.meta.url));
const skill = readFileSync(`${skillDir}SKILL.md`, "utf8");

test("every prompt path the skill names exists", () => {
  const paths = [...skill.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w-]+\/[\w-]+\.md)/g)].map(([, path]) => path);
  assert.ok(paths.length >= 8);
  for (const path of paths) assert.ok(existsSync(`${skillDir}${path}`), path);
});
