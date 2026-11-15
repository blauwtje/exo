import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readAgents } from './harness.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const skillsRoot = path.join(repositoryRoot, 'skills');

const agents = readAgents();

test('a Design: task with a named direction goes to a design-ui delegate, not the implementer', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'builder');
  assert.ok(implementer, 'agents/builder.md exists');
  assert.doesNotMatch(implementer.body, /enter it at its Build phase/);
  assert.doesNotMatch(implementer.frontmatter.description, /opus/);

  const designTasksPath = path.join(skillsRoot, 'build', 'references', 'design-tasks.md');
  const designTasks = fs.readFileSync(designTasksPath, 'utf8');
  assert.doesNotMatch(designTasks, /exo:builder/);
});
