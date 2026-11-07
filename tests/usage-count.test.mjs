import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildUsage, encodeDir, parseArgs } from '../usage-count.mjs';
import { tempDir } from './harness.mjs';

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const toolUse = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

function fixture() {
  const repo = tempDir('exo-usage-repo-');
  write(path.join(repo, 'skills/alpha/SKILL.md'), 'a');
  write(path.join(repo, 'skills/beta/SKILL.md'), 'b');
  write(path.join(repo, 'agents/worker.md'), 'w');
  write(path.join(repo, 'lib/used.mjs'), "import { dep } from './dep.mjs';\n");
  write(path.join(repo, 'lib/dep.mjs'), 'export const dep = 1;\n');
  write(path.join(repo, 'lib/idle.mjs'), 'export const idle = 1;\n');
  write(path.join(repo, 'lib/script.sh'), 'x');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  return repo;
}

function sessions(dir, texts) {
  texts.forEach((text, index) => {
    const file = path.join(dir, `s${index}.jsonl`);
    write(file, text);
    const time = new Date(Date.now() - (texts.length - index) * 10000);
    fs.utimesSync(file, time, time);
  });
}

const countOf = (usage, file) => usage.rows.find((row) => row.file === file);

test('Read, Skill, Agent and Bash hits count and imports propagate', () => {
  const repo = fixture();
  const dir = tempDir('exo-usage-projects-');
  sessions(dir, [[
    toolUse('Read', { file_path: '/work/exo/skills/alpha/SKILL.md' }),
    toolUse('Skill', { skill: 'exo:beta' }),
    toolUse('Agent', { subagent_type: 'exo:worker' }),
    toolUse('Bash', { command: 'node lib/used.mjs' }),
  ].join('\n')]);
  const usage = buildUsage(repo, { projects: dir, sessions: 30 });
  assert.equal(countOf(usage, 'skills/alpha/SKILL.md').count, 1);
  assert.equal(countOf(usage, 'skills/beta/SKILL.md').count, 1);
  assert.equal(countOf(usage, 'agents/worker.md').count, 1);
  assert.equal(countOf(usage, 'lib/used.mjs').count, 1);
  assert.equal(countOf(usage, 'lib/dep.mjs').via, 'lib/used.mjs');
  assert.equal(usage.rows[0].count, 0);
  assert.equal(usage.unused, 2);
});

test('--sessions keeps only the newest transcripts', () => {
  const repo = fixture();
  const dir = tempDir('exo-usage-projects-');
  sessions(dir, [
    toolUse('Skill', { skill: 'alpha' }),
    toolUse('Skill', { skill: 'beta' }),
  ]);
  const usage = buildUsage(repo, { projects: dir, sessions: 1 });
  assert.equal(usage.sessions, 1);
  assert.equal(countOf(usage, 'skills/alpha/SKILL.md').count, 0);
  assert.equal(countOf(usage, 'skills/beta/SKILL.md').count, 1);
});

test('flags parse and directories encode like Claude Code', () => {
  assert.deepEqual(parseArgs(['--projects', 'p', '--sessions', '5', '--json']), { projects: 'p', sessions: 5, json: true, allProjects: false });
  assert.equal(encodeDir('/a/.b_c'), '-a--b-c');
});

test('--all-projects counts every project folder and all sessions', () => {
  const repo = fixture();
  const root = tempDir('exo-usage-projects-');
  sessions(path.join(root, 'one'), [toolUse('Skill', { skill: 'exo:alpha' }), toolUse('Skill', { skill: 'exo:alpha' })]);
  sessions(path.join(root, 'two'), [toolUse('Agent', { subagent_type: 'exo:worker' })]);
  const options = parseArgs(['--all-projects', '--projects', root, '--sessions', 'all']);
  const usage = buildUsage(repo, options);
  const count = (file) => usage.rows.find((row) => row.file === file).count;
  assert.equal(usage.sessions, 3);
  assert.equal(count('skills/alpha/SKILL.md'), 2);
  assert.equal(count('agents/worker.md'), 1);
});
