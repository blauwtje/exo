import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const agentsRoot = path.join(repositoryRoot, 'agents');
const skillsRoot = path.join(repositoryRoot, 'skills');

function readAgent(fileName) {
  const text = fs.readFileSync(path.join(agentsRoot, fileName), 'utf8');
  const lines = text.split('\n');
  const closing = lines.indexOf('---', 1);
  assert.ok(lines[0] === '---' && closing > 0, `${fileName} has no frontmatter block`);
  const frontmatter = {};
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(': ');
    assert.ok(separator > 0, `${fileName} has an unreadable frontmatter line: ${line}`);
    frontmatter[line.slice(0, separator)] = line.slice(separator + 2);
  }
  const body = lines.slice(closing + 1).join('\n');
  return { fileName, frontmatter, body };
}

const agents = fs.readdirSync(agentsRoot)
  .filter((fileName) => fileName.endsWith('.md'))
  .map(readAgent);

const specSkill = fs.readFileSync(path.join(skillsRoot, 'spec/references/step-rules.md'), 'utf8');

test('spec dispatches its research-worker lookups in one message, and the open-points mode opens with its reads together', () => {
  const locate = specSkill.split('\n').find((line) => line.includes('`exo:research-worker`'));
  assert.match(locate, /`Sources: repo`.*`Sources: docs`/, 'repo and docs lookups share one step line');
  assert.match(locate, /one (?:background )?message/, 'spec sends both lookups in one message');
  const modes = fs.readFileSync(path.join(skillsRoot, 'spec/references/worker-modes.md'), 'utf8');
  assert.match(modes, /^- First message: Read the brief and run the memory script command `decisions` together\. Then read what the brief names/m);
  assert.doesNotMatch(modes, /before anything else/, 'no second opening call is ordered first');
});
