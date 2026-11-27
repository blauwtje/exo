import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lines = readFileSync(new URL("../skills/spec/SKILL.md", import.meta.url), "utf8").split("\n");

test("spec looks in docs/specs and docs/research before the open decisions step", () => {
  const stepTwo = lines.findIndex((line) => line.includes("**Find the open decisions.**"));
  assert.ok(stepTwo > 0);
  assert.ok(lines.slice(0, stepTwo).some((line) => line.includes("docs/specs") && line.includes("docs/research")));
});
