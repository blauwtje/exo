// The Codex tree is generated from the sources: one agent file per agent entry
// and one per low twin, with the codex block's model and effort, a sandbox that
// approximates the tool list and the preamble ahead of the agent body; one
// rewritten file per skill Markdown file plus a policy file for each explicit-only
// skill; and an override replaces a file only while its source hash holds.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findGeneratedDrift, generateTree } from '../harnesses/codex/generate.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const agentFiles = fs.readdirSync(path.join(ROOT, 'agents')).filter((name) => name.endsWith('.md'));

function field(text, name) {
  const line = text.split('\n').find((row) => row.startsWith(`${name} = `));
  return line === undefined ? null : JSON.parse(line.slice(name.length + 3));
}

const AGENT_DIRECTORY = 'harnesses/codex/generated/agents/';

function generateAgents(root) {
  return new Map([...generateTree(root)].filter(([file]) => file.startsWith(AGENT_DIRECTORY)));
}

function generated(name) {
  return generateAgents(ROOT).get(`${AGENT_DIRECTORY}${name}.toml`);
}

function copyOfRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-agents-'));
  for (const entry of ['agents', 'lib', 'harnesses', 'skills']) fs.cpSync(path.join(ROOT, entry), path.join(root, entry), { recursive: true });
  return root;
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('one file per agent entry plus the two low twins, and no other', () => {
  const names = [...generateAgents(ROOT).keys()].map((file) => path.basename(file, '.toml')).sort();
  const expected = [
    ...agentFiles.map((name) => `exo-${path.basename(name, '.md')}`),
    'exo-critique-ui-low',
    'exo-review-branch-deep-low'
  ].sort();
  assert.equal(names.length, 17);
  assert.deepEqual(names, expected);
});

test('each file holds the decided fields and drops maxTurns and omitClaudeMd', () => {
  for (const text of generateAgents(ROOT).values()) {
    assert.ok(field(text, 'name').startsWith('exo-'));
    assert.ok(field(text, 'description').length > 0);
    assert.ok(field(text, 'model'));
    assert.ok(field(text, 'model_reasoning_effort'));
    assert.ok(['read-only', 'workspace-write'].includes(field(text, 'sandbox_mode')));
    assert.match(text, /\ndeveloper_instructions = '''\n/);
    assert.doesNotMatch(text, /^\s*(maxTurns|omitClaudeMd)\s*[:=]/m);
  }
});

test('model and effort resolve through the codex block, shifted up one step on the strong tier', () => {
  const build = generated('exo-build-task');
  assert.equal(field(build, 'model'), 'gpt-6.1-sol');
  assert.equal(field(build, 'model_reasoning_effort'), 'high');
  const critique = generated('exo-critique-ui');
  assert.equal(field(critique, 'model'), 'gpt-6.1-sol');
  assert.equal(field(critique, 'model_reasoning_effort'), 'xhigh');
  const lookup = generated('exo-locate-code');
  assert.equal(field(lookup, 'model'), 'gpt-6-luna');
  assert.equal(field(lookup, 'model_reasoning_effort'), 'medium');
});

test('a low twin takes the low budget tier and keeps its source body', () => {
  const twin = generated('exo-critique-ui-low');
  assert.equal(field(twin, 'name'), 'exo-critique-ui-low');
  assert.equal(field(twin, 'model'), 'gpt-6.1-sol');
  assert.equal(field(twin, 'model_reasoning_effort'), 'high');
  const body = fs.readFileSync(path.join(ROOT, 'agents', 'critique-ui.md'), 'utf8').split('\n---\n')[1].trim();
  assert.ok(twin.includes(body));
  assert.ok(generated('exo-review-branch-deep-low').includes('exo-review-branch-deep-low'));
});

test('only the agents without Edit or Write run read-only', () => {
  const readOnly = [...generateAgents(ROOT).entries()]
    .filter(([, text]) => field(text, 'sandbox_mode') === 'read-only')
    .map(([file]) => path.basename(file, '.toml'))
    .sort();
  assert.deepEqual(readOnly, ['exo-fetch-docs', 'exo-locate-code']);
});

test('the instructions open with the preamble and then the agent body', () => {
  const preamble = fs.readFileSync(path.join(ROOT, 'harnesses', 'codex', 'agent-preamble.md'), 'utf8');
  const text = generated('exo-locate-code');
  assert.ok(text.includes(`'''\n${preamble.trimEnd()}\n\n`));
  assert.ok(text.includes('You are a read-only codebase explorer.'));
  assert.ok(!text.includes('tools: Read'));
});

test('the committed tree matches the sources', () => {
  assert.deepEqual(findGeneratedDrift(ROOT), []);
});

test('each skill Markdown file is generated and an explicit-only skill gets a policy file', () => {
  const tree = generateTree(ROOT);
  const skill = tree.get('harnesses/codex/generated/skills/spec/SKILL.md');
  assert.match(skill, /^---\nname: spec\ndescription: "/);
  assert.doesNotMatch(skill, /disable-model-invocation|\$\{CLAUDE_/);
  for (const name of ['start', 'save-session', 'remember', 'route-skills']) {
    assert.equal(tree.get(`harnesses/codex/generated/skills/${name}/agents/openai.yaml`), 'policy:\n  allow_implicit_invocation: false\n');
  }
  assert.equal(tree.has('harnesses/codex/generated/skills/spec/agents/openai.yaml'), false);
});

test('an override with a matching source hash replaces the generated file', () => {
  const root = copyOfRepository();
  const source = fs.readFileSync(path.join(root, 'skills', 'spec', 'SKILL.md'), 'utf8');
  const overridden = '---\nname: spec\ndescription: "by hand"\n---\nHand-written body.\n';
  const override = path.join(root, 'harnesses', 'codex', 'overrides', 'skills', 'spec', 'SKILL.md');
  fs.mkdirSync(path.dirname(override), { recursive: true });
  fs.writeFileSync(override, `<!-- exo:override source-sha256=${sha256(source)} -->\n${overridden}`);
  assert.equal(generateTree(root).get('harnesses/codex/generated/skills/spec/SKILL.md'), overridden);
});

test('an override whose source changed, or that names no generated file, is drift', () => {
  const root = copyOfRepository();
  const overrides = path.join(root, 'harnesses', 'codex', 'overrides');
  fs.mkdirSync(path.join(overrides, 'skills', 'spec'), { recursive: true });
  fs.writeFileSync(path.join(overrides, 'skills', 'spec', 'SKILL.md'), `<!-- exo:override source-sha256=${sha256('old source')} -->\nbody\n`);
  fs.writeFileSync(path.join(overrides, 'skills', 'spec', 'gone.md'), `<!-- exo:override source-sha256=${sha256('x')} -->\nbody\n`);
  const drift = findGeneratedDrift(root).map((record) => `${record.file}: ${record.problem.split(':')[0]}`).sort();
  assert.deepEqual(drift, [
    'harnesses/codex/overrides/skills/spec/SKILL.md: source hash changed',
    'harnesses/codex/overrides/skills/spec/gone.md: overrides a file the rules do not generate'
  ]);
  const result = spawnSync('node', [path.join(root, 'harnesses', 'codex', 'generate.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SKILL\.md: source hash changed/);
});

test('--check exits 1 and names a changed, a missing and a stray file', () => {
  const root = copyOfRepository();
  const directory = path.join(root, 'harnesses', 'codex', 'generated', 'agents');
  fs.appendFileSync(path.join(directory, 'exo-build-task.toml'), '# drift\n');
  fs.rmSync(path.join(directory, 'exo-locate-code.toml'));
  fs.writeFileSync(path.join(directory, 'exo-stray.toml'), 'name = "exo-stray"\n');
  const drift = findGeneratedDrift(root).map((record) => `${path.basename(record.file)}: ${record.problem}`).sort();
  assert.deepEqual(drift, [
    'exo-build-task.toml: differs from the sources',
    'exo-locate-code.toml: missing',
    'exo-stray.toml: not generated from the sources'
  ]);
  const result = spawnSync('node', [path.join(root, 'harnesses', 'codex', 'generate.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /exo-build-task\.toml: differs from the sources/);
});
