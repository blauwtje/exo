import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generateOpenCodeTree } from '../harnesses/opencode/generate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXO_ROOT = '/opt/exo';

const agentFiles = fs.readdirSync(`${ROOT}agents`).filter((name) => name.endsWith('.md'));

test('one subagent file per exo agent with no model line by default', () => {
  const tree = generateOpenCodeTree(ROOT, { exoRoot: EXO_ROOT, config: {} });
  for (const file of agentFiles) {
    const text = tree.get(`agents/exo-${file}`);
    assert.ok(text, file);
    assert.match(text, /^---\nmode: subagent\ndescription: /);
    assert.doesNotMatch(text.split('\n---\n')[0], /^model:/m);
  }
});

test('skills carry the exo clone path and no plugin root variable', () => {
  const tree = generateOpenCodeTree(ROOT, { exoRoot: EXO_ROOT, config: {} });
  const skills = [...tree.keys()].filter((file) => file.startsWith('skills/'));
  assert.ok(skills.length > 0);
  for (const file of skills) {
    assert.doesNotMatch(tree.get(file), /\$\{CLAUDE_(PLUGIN_ROOT|SKILL_DIR)\}/, file);
  }
});

test('opencode.model with a variant per effort writes model: <model>#<variant>', () => {
  const config = { opencode: { model: 'provider/model', variants: { low: 'min', medium: 'mid', high: 'top', xhigh: 'top', max: 'top' } } };
  const tree = generateOpenCodeTree(ROOT, { exoRoot: EXO_ROOT, config });
  const lines = [...tree.entries()]
    .filter(([file]) => file.startsWith('agents/'))
    .map(([, text]) => text.split('\n---\n')[0].split('\n').find((line) => line.startsWith('model:')));
  assert.ok(lines.length > 0);
  for (const line of lines) assert.match(line, /^model: provider\/model(#\w+)?$/);
  assert.ok(lines.some((line) => line.includes('#')));
});

function modelOf(tree, file) {
  const header = tree.get(`agents/exo-${file}`).split('\n---\n')[0];
  return header.split('\n').find((line) => line.startsWith('model:'));
}

test('each agent file carries the variant of its kind effort', () => {
  const variants = { low: 'min', medium: 'mid', high: 'top', xhigh: 'top', max: 'top' };
  const config = { opencode: { model: 'provider/model', variants } };
  const tree = generateOpenCodeTree(ROOT, { exoRoot: EXO_ROOT, config });
  assert.equal(modelOf(tree, 'build-task.md'), 'model: provider/model#mid');
  assert.equal(modelOf(tree, 'orchestrator.md'), 'model: provider/model#mid');
});
