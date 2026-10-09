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
import { findOverrideProblems, generateTree, writeGenerated } from '../harnesses/codex/generate.mjs';

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

const TWINS = [
  'exo-critique-ui-high', 'exo-critique-ui-low', 'exo-review-branch-deep', 'exo-review-branch-deep-high',
  'exo-review-branch-deep-low', 'exo-solve-hard-high', 'exo-solve-hard-low'
];

test('one file per agent entry plus the seven codex twins, and no other', () => {
  const names = [...generateAgents(ROOT).keys()].map((file) => path.basename(file, '.toml')).sort();
  const expected = [...agentFiles.map((name) => `exo-${path.basename(name, '.md')}`), ...TWINS].sort();
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
  assert.equal(field(build, 'model_reasoning_effort'), 'medium');
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

test('each twin takes its own kind\'s model and effort and its base agent\'s body', () => {
  const cases = [
    ['exo-critique-ui-high', 'critique-ui', 'max'], ['exo-review-branch-deep', 'review-branch', 'xhigh'],
    ['exo-review-branch-deep-high', 'review-branch', 'max'], ['exo-review-branch-deep-low', 'review-branch', 'high'],
    ['exo-solve-hard-high', 'solve-hard', 'max'], ['exo-solve-hard-low', 'solve-hard', 'high']
  ];
  for (const [name, base, effort] of cases) {
    const twin = generated(name);
    assert.equal(field(twin, 'model'), 'gpt-6.1-sol', name);
    assert.equal(field(twin, 'model_reasoning_effort'), effort, name);
    const body = fs.readFileSync(path.join(ROOT, 'agents', `${base}.md`), 'utf8').split('\n---\n')[1].trim();
    assert.ok(twin.includes(body.split('\n')[0]), `${name} holds the ${base} body`);
  }
  assert.equal(field(generated('exo-review-branch-deep'), 'description'), 'Reviews one risky plan branch. Dispatched by verify only.');
});

test('every agent the codex budget rules spawn is generated', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills', 'configure', 'schema.json'), 'utf8'));
  const named = new Set(JSON.stringify(schema).match(/exo-[a-z-]+[a-z]/g));
  const names = new Set([...generateAgents(ROOT).keys()].map((file) => path.basename(file, '.toml')));
  assert.ok(named.has('exo-review-branch-deep'), [...named].join(' '));
  assert.deepEqual([...named].filter((name) => !names.has(name)), []);
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

test('every override in the sources applies', () => {
  assert.deepEqual(findOverrideProblems(ROOT), []);
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

test('an override whose source changed, or that names no generated file, is a problem', () => {
  const root = copyOfRepository();
  const overrides = path.join(root, 'harnesses', 'codex', 'overrides');
  fs.mkdirSync(path.join(overrides, 'skills', 'spec'), { recursive: true });
  fs.writeFileSync(path.join(overrides, 'skills', 'spec', 'SKILL.md'), `<!-- exo:override source-sha256=${sha256('old source')} -->\nbody\n`);
  fs.writeFileSync(path.join(overrides, 'skills', 'spec', 'gone.md'), `<!-- exo:override source-sha256=${sha256('x')} -->\nbody\n`);
  const problems = findOverrideProblems(root).map((record) => `${record.file}: ${record.problem.split(':')[0]}`).sort();
  assert.deepEqual(problems, [
    'harnesses/codex/overrides/skills/spec/SKILL.md: source hash changed',
    'harnesses/codex/overrides/skills/spec/gone.md: overrides a file the rules do not generate'
  ]);
  const result = spawnSync('node', [path.join(root, 'harnesses', 'codex', 'generate.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SKILL\.md: source hash changed/);
});

test('an agent source that leaves a skill placeholder fails generation', () => {
  const root = copyOfRepository();
  fs.appendFileSync(path.join(root, 'agents', 'run-unit.md'), '\nOpen {{SKILL_DIR}}/a.md.\n');
  assert.throws(() => generateTree(root), /agents\/run-unit\.md: left unmapped: \{\{SKILL_DIR\}\}/);
});

test('writing the tree puts exactly the generated files on disk and drops a stray one', () => {
  const root = copyOfRepository();
  const directory = path.join(root, 'harnesses', 'codex', 'generated');
  fs.mkdirSync(path.join(directory, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'agents', 'exo-stray.toml'), 'name = "exo-stray"\n');
  writeGenerated(root);
  const tree = generateTree(root);
  const listed = (folder) => fs.readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? listed(path.join(folder, entry.name)) : [path.join(folder, entry.name)]));
  const written = listed(directory).map((file) => path.relative(root, file).split(path.sep).join('/')).sort();
  assert.deepEqual(written, [...tree.keys()].sort());
  for (const file of written) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), tree.get(file));
});
