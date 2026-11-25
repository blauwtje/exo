import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const prompts = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'trigger.json'), 'utf8'));
const SKILLS = ['author', 'build', 'diagnose', 'document', 'ideas', 'learn', 'save', 'search', 'ship', 'spec', 'watch'];

const toolLine = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const textLine = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } });

function fakeClaude(directory, script) {
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, 'claude');
  fs.writeFileSync(file, `#!/usr/bin/env node\n${script}\n`, { mode: 0o755 });
  return bin;
}

function runTrigger(bin, ...args) {
  return spawnSync('node', [path.join(root, 'evals', 'trigger.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
}

test('trigger.json holds 4 should-fire and 4 near-miss prompts for each of the eleven skills', () => {
  assert.deepEqual(Object.keys(prompts).sort(), SKILLS);
  for (const skill of SKILLS) {
    assert.equal(prompts[skill].length, 8, skill);
    assert.equal(prompts[skill].filter((entry) => entry.should_trigger).length, 4, skill);
  }
});

test('a fired skill is right for yes prompts and wrong for no prompts, and the last line counts the wrong', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-'));
  const bin = fakeClaude(directory, `console.log(${JSON.stringify(toolLine('Skill', { skill: 'exo:save' }))});\nsetInterval(() => {}, 1000);`);
  const result = runTrigger(bin, 'save');
  assert.equal(result.status, 1, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 9);
  assert.match(lines[0], /^save 2\/2 ".+" expected (yes|no)$/);
  assert.equal(lines.at(-1), 'wrong: 4 of 8');
});

test('another tool first, or text only, counts as not fired', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-'));
  const anotherTool = fakeClaude(directory, `console.log(${JSON.stringify(toolLine('Bash', { command: 'ls' }))});\nsetInterval(() => {}, 1000);`);
  const first = runTrigger(anotherTool, 'save');
  assert.match(first.stdout.split('\n')[0], /^save 0\/2 /);
  assert.equal(first.stdout.trim().split('\n').at(-1), 'wrong: 4 of 8');
  const textOnly = fakeClaude(fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-')), `console.log(${JSON.stringify(textLine)});`);
  const second = runTrigger(textOnly, 'save');
  assert.match(second.stdout.split('\n')[0], /^save 0\/2 /);
});

test('two runs that split get a third run and the majority decides', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-'));
  const script = `
const fs = require('node:fs');
const counter = ${JSON.stringify(directory)} + '/' + Buffer.from(process.argv[process.argv.indexOf('-p') + 1]).toString('hex').slice(0, 60);
const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
fs.writeFileSync(counter, String(n + 1));
if (n === 1) { console.log(${JSON.stringify(textLine)}); } else { console.log(${JSON.stringify(toolLine('Skill', { skill: 'exo:watch' }))}); setInterval(() => {}, 1000); }
`;
  const result = runTrigger(fakeClaude(directory, script), 'watch');
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 9);
  for (const line of lines.slice(0, 8)) assert.match(line, /^watch 2\/3 /);
  assert.equal(lines.at(-1), 'wrong: 4 of 8');
});

test('an unknown skill name exits 2', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-'));
  const result = runTrigger(fakeClaude(directory, ''), 'nope');
  assert.equal(result.status, 2);
});
