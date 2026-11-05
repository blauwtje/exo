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

const specSkill = fs.readFileSync(path.join(skillsRoot, 'spec/SKILL.md'), 'utf8');

test('spec dispatches locate-code and fetch-docs in one message, and find-open-points opens with its reads together', () => {
  const locate = specSkill.split('\n').find((line) => line.includes('`exo:locate-code`'));
  assert.match(locate, /`exo:fetch-docs`/, 'locate-code and fetch-docs share one step line');
  assert.match(locate, /one (?:background )?message/, 'spec sends both lookups in one message');
  const finder = agents.find((agent) => agent.frontmatter.name === 'find-open-points');
  assert.match(finder.body, /^- First message: Read the brief and run `node [^\n]*memory\.mjs" decisions` together\.$/m);
  assert.doesNotMatch(finder.body, /before anything else/, 'no second opening call is ordered first');
});
