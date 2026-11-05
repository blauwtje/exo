import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { agentContextTarget, contextPeaks } from '../lib/context-limits.mjs';

const script = new URL('../skills/gate/scripts/context-peaks.mjs', import.meta.url).pathname;

function usageLine(tokens) {
  return JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 } } });
}

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(1000)}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-a1.jsonl'), `${usageLine(90000)}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'exo:build-task' }));
  return folder;
}

test('rows carry the agent type, sessions are typed session', () => {
  const rows = contextPeaks({ folder: fixture(), since: 0 });
  assert.deepEqual(rows.map((row) => row.agentType), ['exo:build-task', 'session']);
});

test('the CLI prints a line per row and the over-target count', () => {
  const output = execFileSync('node', [script, '--folder', fixture(), '--since', '0'], { encoding: 'utf8' });
  const lines = output.trim().split('\n');
  assert.match(lines[0], /^exo:build-task exo:build-task a1 \(session s1\) 9\d{4} over$/);
  assert.match(lines.at(-1), /^over target \(\d+\): 1$/);
});

test('a peak exactly at the target is marked over and counted', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(agentContextTarget())}\n`);
  const lines = execFileSync('node', [script, '--folder', folder, '--since', '0'], { encoding: 'utf8' }).trim().split('\n');
  assert.match(lines[0], / over$/);
  assert.match(lines.at(-1), /: 1$/);
});

function orchestratorFolder(count, tokens, effort) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(1000)}\n`);
  for (let index = 0; index < count; index += 1) {
    fs.writeFileSync(path.join(subagents, `agent-o${index}.jsonl`), `${usageLine(tokens)}\n${usageLine(tokens - 10)}\n`);
    fs.writeFileSync(path.join(subagents, `agent-o${index}.meta.json`), JSON.stringify({ agentType: 'exo:orchestrator', effort }));
  }
  return folder;
}

const verdict = (folder) => execFileSync('node', [script, '--folder', folder, '--since', '0', '--verdict', 'u4'], { encoding: 'utf8' }).trim();

test('rows carry the output tokens', () => {
  const rows = contextPeaks({ folder: orchestratorFolder(1, 5000, 'high'), since: 0 });
  assert.equal(rows.find((row) => row.agentType === 'exo:orchestrator').output, 2);
});

test('--summary prints per type n, peak p50 and p90, output p50 and over share', () => {
  const lines = execFileSync('node', [script, '--folder', fixture(), '--since', '0', '--summary'], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(lines.includes('exo:build-task n=1 peak p50=90000 p90=90000 output p50=1 over=100%'));
  assert.ok(lines.includes('session n=1 peak p50=1000 p90=1000 output p50=1 over=0%'));
});

test('--verdict u4 is PENDING under 30 high-effort runs', () => {
  assert.equal(verdict(orchestratorFolder(29, 5000, 'high')), 'PENDING n=29 of 30');
  assert.equal(verdict(orchestratorFolder(30, 5000, 'xhigh')), 'PENDING n=0 of 30');
});

test('--verdict u4 is KEEP at or under 90311 and DISCARD above', () => {
  assert.match(verdict(orchestratorFolder(30, 90311, 'high')), /^KEEP p50=90311 n=30$/);
  assert.match(verdict(orchestratorFolder(30, 90312, 'high')), /^DISCARD p50=90312 n=30$/);
});

function u8Folder({ count, tokens, extra = '' }) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(1000)}\n`);
  const agentCall = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent' }], usage: { input_tokens: 7000, output_tokens: 1 } } });
  for (let index = 0; index < count; index += 1) {
    fs.writeFileSync(path.join(subagents, `agent-o${index}.jsonl`), `${agentCall}\n${usageLine(tokens)}\n${extra}`);
    fs.writeFileSync(path.join(subagents, `agent-o${index}.meta.json`), JSON.stringify({ agentType: 'exo:orchestrator' }));
  }
  return folder;
}

const u8 = (folder) => execFileSync('node', [script, '--folder', folder, '--since', '0', '--verdict', 'u8'], { encoding: 'utf8' }).trim().split('\n');

test('--verdict u8 prints first-Agent context, input sum and limit firings per instance', () => {
  const note = `${JSON.stringify({ type: 'user', text: 'exo context limit: at 120k your tools are refused' })}\n${JSON.stringify({ type: 'user', text: 'exo context limit: over the 120k hard limit' })}\n`;
  const lines = u8(u8Folder({ count: 1, tokens: 50000, extra: note }));
  assert.equal(lines[0], 'o0 (session s1) peak=50000 firstAgent=7000 input=58000 denies=1 notes=1');
  assert.equal(lines.at(-1), 'PENDING n=1 of 30');
});

test('--verdict u8 is KEEP at or under the over-target share and DISCARD above', () => {
  assert.match(u8(u8Folder({ count: 30, tokens: 50000 })).at(-1), /^KEEP over=0\.0% inputPerJob=\d+ n=30$/);
  assert.match(u8(u8Folder({ count: 30, tokens: agentContextTarget() })).at(-1), /^DISCARD over=100\.0% /);
});

function sizedFolder({ pairs, peak }) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  const calls = [];
  for (let index = 0; index < pairs; index += 1) {
    const content = [{ type: 'tool_use', id: `t${index}`, name: 'Agent', input: { prompt: 'Reads: none\nFetches: 5' } }];
    calls.push(JSON.stringify({ type: 'assistant', message: { content, usage: { input_tokens: 1 } } }));
    fs.writeFileSync(path.join(subagents, `agent-w${index}.jsonl`), `${usageLine(peak)}\n`);
    fs.writeFileSync(path.join(subagents, `agent-w${index}.meta.json`), JSON.stringify({ agentType: 'exo:locate-code', toolUseId: `t${index}` }));
  }
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${calls.join('\n')}\n`);
  return folder;
}

const sized = (folder) => execFileSync('node', [script, '--folder', folder, '--since', '0', '--sized'], { encoding: 'utf8' }).trim().split('\n');

test('--sized prints estimate and peak per dispatch and KEEP 30000 at 50 pairs under target', () => {
  const lines = sized(sizedFolder({ pairs: 50, peak: 20000 }));
  assert.equal(lines[0], 'exo:locate-code 8000 20000');
  assert.equal(lines.at(-1), 'budget exo:locate-code KEEP 30000');
});

test('--sized prints target minus the p90 growth under 50 pairs', () => {
  const lines = sized(sizedFolder({ pairs: 3, peak: 20000 }));
  assert.equal(lines.at(-1), `budget exo:locate-code ${agentContextTarget() - 12000}`);
});

function toolsFolder(peak) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  const transcript = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/a' } }, { type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/a' } }], usage: { input_tokens: peak } } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'x'.repeat(100) }, { type: 'tool_result', tool_use_id: 'r2', content: [{ type: 'text', text: 'y'.repeat(50) }] }] } }
  ].map((line) => JSON.stringify(line)).join('\n');
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${transcript}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-a1.jsonl'), `${transcript}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'exo:locate-code' }));
  return folder;
}

const tools = (folder) => execFileSync('node', [script, '--folder', folder, '--since', '0', '--tools'], { encoding: 'utf8' }).trim().split('\n');

test('--tools prints result bytes, calls and repeated reads per type and tool', () => {
  const lines = tools(toolsFolder(1000));
  assert.ok(lines.includes('exo:locate-code Read bytes=150 calls=2 repeatedReads=1'));
  assert.ok(lines.includes('session Read bytes=150 calls=2 repeatedReads=1'));
});

test('--tools prints the composition only for lead sessions over 72279 tokens', () => {
  assert.equal(tools(toolsFolder(1000)).some((line) => line.startsWith('lead ')), false);
  assert.ok(tools(toolsFolder(72280)).includes('lead s1 peak=72280 repeatedReads=1 Read=150'));
});

function u2Folder({ count, peak, denies = 0, baselinePeak = 1000 }) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(1000)}\n`);
  const denial = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/a' } }], usage: { input_tokens: peak } } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'exo result cap: this Read returns more than 4096 bytes' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/a' } }], usage: { input_tokens: peak } } }
  ].map((line) => JSON.stringify(line)).join('\n');
  const old = new Date(Date.now() - 86400000);
  for (let index = 0; index < count + 1; index += 1) {
    const file = path.join(subagents, `agent-c${index}.jsonl`);
    const isBaseline = index === count;
    fs.writeFileSync(file, `${isBaseline ? usageLine(baselinePeak) : denies ? denial : usageLine(peak)}\n`);
    fs.writeFileSync(path.join(subagents, `agent-c${index}.meta.json`), JSON.stringify({ agentType: 'exo:locate-code' }));
    if (isBaseline) fs.utimesSync(file, old, old);
  }
  return folder;
}

const u2 = (folder) => execFileSync('node', [script, '--folder', folder, '--since', String(Date.now() - 3600000), '--verdict', 'u2'], { encoding: 'utf8' }).trim().split('\n');

test('--verdict u2 is PENDING under 500 capped runs', () => {
  assert.deepEqual(u2(u2Folder({ count: 499, peak: 1000 })), ['PENDING n=499 of 500']);
});

test('--verdict u2 prints share, deny and retry turns and KEEP when share and cost hold', () => {
  const lines = u2(u2Folder({ count: 500, peak: 1000, denies: 1 }));
  assert.match(lines[0], /^exo:locate-code n=500 over=0\.0% denyTurns=500 retries=500 cost=\d+ rise=/);
  assert.match(lines[0], /rise=\d+\.\d+%$/);
});

test('--verdict u2 is UNCAP when the over-target share stays high', () => {
  const lines = u2(u2Folder({ count: 500, peak: agentContextTarget() }));
  assert.equal(lines.at(-1), 'UNCAP exo:locate-code');
});

test('--verdict u2 is KEEP when the share is low and cost does not rise', () => {
  const lines = u2(u2Folder({ count: 500, peak: 1000, baselinePeak: 1000 }));
  assert.equal(lines.at(-1), 'KEEP exo:locate-code');
});

function resumedFolder({ entrypoint, runs, resumedRuns }) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${JSON.stringify({ type: 'user', entrypoint, message: { content: 'go' } })}\n`);
  for (let index = 0; index < runs; index += 1) {
    const launch = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Agent', input: { run_in_background: true } }] } };
    const ended = { type: 'assistant', message: { stop_reason: 'end_turn', content: [] } };
    const notification = { type: 'user', message: { content: '<task-notification>done</task-notification>' } };
    const after = { type: 'assistant', message: { content: [] } };
    const lines = index < resumedRuns ? [launch, ended, notification, after] : [launch, ended, notification];
    fs.writeFileSync(path.join(subagents, `agent-r${index}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
    fs.writeFileSync(path.join(subagents, `agent-r${index}.meta.json`), JSON.stringify({ agentType: 'exo:orchestrator' }));
  }
  return folder;
}

const resumed = (folder) => execFileSync('node', [script, '--folder', folder, '--since', '0', '--resumed'], { encoding: 'utf8' }).trim().split('\n');

test('--resumed prints W1 for an interactive group where 10 of 10 resumed', () => {
  assert.deepEqual(resumed(resumedFolder({ entrypoint: 'cli', runs: 10, resumedRuns: 10 })), ['interactive resumed=10 of 10 W1', '-p resumed=0 of 0 PENDING n=0 of 10']);
});

test('--resumed prints W2 for a -p group where a run did not resume', () => {
  assert.deepEqual(resumed(resumedFolder({ entrypoint: 'sdk-cli', runs: 10, resumedRuns: 9 })), ['interactive resumed=0 of 0 PENDING n=0 of 10', '-p resumed=9 of 10 W2']);
});

test('--resumed is PENDING below 10 runs', () => {
  assert.equal(resumed(resumedFolder({ entrypoint: 'cli', runs: 9, resumedRuns: 9 }))[0], 'interactive resumed=9 of 9 PENDING n=9 of 10');
});
