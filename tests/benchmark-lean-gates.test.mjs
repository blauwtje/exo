// lean-gates.mjs starts one benchmark session per run dir. These tests cover
// its pure parts: arguments, run dir names, the child env, the argv, the out
// dir isolation and the probe's transcript count; no claude runs and no
// repository is prepared.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BRANCH, EXO_SETTINGS, ISOLATION_ENV, PLAN_PATH, PROBE_PROMPT, PROMPT, childEnvironment, claudeArguments, contextAncestors, environmentDiff, parseArguments, refuseContaminatedOut, runDirectoryName, transcriptLeaks } from '../benchmarks/lean-gates.mjs';

const SCHEMA = fileURLToPath(new URL('../skills/configure/schema.json', import.meta.url));

test('arguments take defaults and refuse a bad version or run', () => {
  const options = parseArguments(['--version', 'new', '--run', '3', '--out', '/tmp/x']);
  assert.deepEqual(
    { model: options.model, effort: options.effort, budget: options.budget, timeoutMin: options.timeoutMin, dryRun: options.dryRun },
    { model: 'claude-opus-5-5', effort: 'medium', budget: '30', timeoutMin: 110, dryRun: false }
  );
  assert.throws(() => parseArguments(['--version', 'mid', '--run', '1', '--out', '/tmp/x']), /old or new/);
  assert.throws(() => parseArguments(['--version', 'old', '--run', '0', '--out', '/tmp/x']), /positive integer/);
  assert.throws(() => parseArguments(['--version', 'old', '--run', '1']), /--out/);
  assert.equal(runDirectoryName(3, 'old'), '03-old');
  assert.equal(runDirectoryName(12, 'new'), '12-new');
});

test('--plan defaults to the version and lets either version run either plan', () => {
  const base = ['--run', '1', '--out', '/tmp/x'];
  assert.equal(parseArguments(['--version', 'old', ...base]).plan, 'old');
  assert.equal(parseArguments(['--version', 'old', '--plan', 'new', ...base]).plan, 'new');
  assert.throws(() => parseArguments(['--version', 'old', '--plan', 'mid', ...base]), /--plan must be old or new/);
  assert.ok(PROMPT.startsWith('First run `npm test` once in the foreground'));
});

test('--probe needs no run and pins haiku at fifty cents', () => {
  const options = parseArguments(['--version', 'old', '--probe', '--out', '/tmp/x']);
  assert.deepEqual({ probe: options.probe, model: options.model, budget: options.budget }, { probe: true, model: 'haiku', budget: '0.5' });
  assert.equal(runDirectoryName(options.run, 'old', true), 'probe-old');
  const argv = claudeArguments(options, '/plugins/old', 'sid', PROBE_PROMPT);
  assert.equal(argv[1], PROBE_PROMPT);
  assert.equal(argv[argv.indexOf('--setting-sources') + 1], 'project,local');
});

test('the child env drops the parent session, turns off CLAUDE.md and memory, and adds the run logs', () => {
  const base = { PATH: '/bin', CLAUDECODE: '1', CLAUDE_EFFORT: 'high', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '0', CLAUDE_CONFIG_DIR: '/c' };
  const env = childEnvironment(base, '/runs/01-old');
  assert.deepEqual(env, {
    PATH: '/bin',
    CLAUDE_CONFIG_DIR: '/c',
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    BENCH_SUITE_LOG: path.join('/runs/01-old', 'suite-runs.jsonl'),
    EXO_SESSIONS_DIR: path.join('/runs/01-old', 'sessions')
  });
  assert.deepEqual(ISOLATION_ENV, { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' });
  const diff = environmentDiff(base, env);
  assert.deepEqual(diff.removed, ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_EFFORT']);
  assert.ok(diff.added.includes('CLAUDE_CODE_DISABLE_CLAUDE_MDS=1') && diff.added.includes('CLAUDE_CODE_DISABLE_AUTO_MEMORY=1'));
});

test('an out dir under a CLAUDE.md, a .claude/ or a git work tree is refused', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lean-gates-')));
  try {
    const out = path.join(root, 'a', 'b', 'out');
    fs.mkdirSync(path.join(root, 'a', '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# x\n');
    const own = (found) => found.filter((entry) => entry.startsWith(root));
    assert.deepEqual(own(contextAncestors(path.join(out, '01-old'), [])), [path.join(root, 'a', '.claude'), path.join(root, 'CLAUDE.md')]);
    assert.deepEqual(own(contextAncestors(path.join(out, '01-old'), [path.join(root, 'a', '.claude')])), [path.join(root, 'CLAUDE.md')]);
    assert.throws(() => refuseContaminatedOut(path.join(out, '01-old')), /CLAUDE\.md/);
    const clean = path.join(root, 'clean');
    fs.mkdirSync(clean);
    fs.rmSync(path.join(root, 'CLAUDE.md'));
    fs.rmSync(path.join(root, 'a'), { recursive: true });
    assert.doesNotThrow(() => refuseContaminatedOut(path.join(clean, '01-old')));
    execFileSync('git', ['init', '-q', clean]);
    assert.throws(() => refuseContaminatedOut(path.join(clean, 'out', '01-old')), /git work tree/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('transcript leaks count CLAUDE.md paths and headings, not prose naming CLAUDE.md', () => {
  assert.deepEqual(transcriptLeaks('Not for a rule or CLAUDE.md; read references/x.md'), { contentsOf: 0, claudeMdPaths: 0 });
  assert.deepEqual(transcriptLeaks('{"path":"/u/.claude/CLAUDE.md"} Contents of /r/CLAUDE.local.md (project)'), { contentsOf: 1, claudeMdPaths: 2 });
});

test('argv names the plugin, model, effort, budget and session; the prompt is version-free', () => {
  const options = parseArguments(['--version', 'old', '--run', '1', '--out', '/tmp/x', '--budget', '12']);
  const argv = claudeArguments(options, '/plugins/old', 'sid');
  const flag = (name) => argv[argv.indexOf(name) + 1];
  assert.equal(argv[0], '-p');
  assert.equal(flag('--plugin-dir'), '/plugins/old');
  assert.equal(flag('--max-budget-usd'), '12');
  assert.equal(flag('--session-id'), 'sid');
  assert.equal(flag('--setting-sources'), 'project,local');
  assert.ok(argv.includes('--strict-mcp-config'));
  assert.ok(PROMPT.includes(PLAN_PATH) && PROMPT.includes(BRANCH));
  const other = claudeArguments(parseArguments(['--version', 'new', '--run', '1', '--out', '/tmp/x', '--budget', '12']), '/plugins/new', 'sid');
  assert.deepEqual(argv.map((value, index) => (value === other[index] ? null : index)).filter((index) => index !== null), [argv.indexOf('--plugin-dir') + 1]);
});

test('the neutral exo settings set every schema key to a valid value', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  assert.deepEqual(Object.keys(EXO_SETTINGS).sort(), Object.keys(schema).sort());
  for (const [key, value] of Object.entries(EXO_SETTINGS)) {
    assert.equal(typeof value, schema[key].type, key);
    if (schema[key].options) assert.ok(schema[key].options.includes(value), key);
  }
});
