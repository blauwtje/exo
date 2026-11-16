import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/learn/scripts/sessions.mjs', import.meta.url));

function line(entry) {
  return `${JSON.stringify(entry)}\n`;
}

function fixture() {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-config-'));
  const project = path.join(fs.realpathSync(os.tmpdir()), 'learn.project_x', 'app');
  fs.mkdirSync(project, { recursive: true });
  const folder = path.join(config, 'projects', fs.realpathSync(project).replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(folder, { recursive: true });
  const write = (name, lines, mtime) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, lines.join(''));
    fs.utimesSync(file, mtime, mtime);
  };
  write('old.jsonl', [line({ type: 'user', message: { content: 'old message' } })], new Date(2026, 0, 1));
  write('new.jsonl', [
    line({ type: 'user', message: { content: 'first typed' } }),
    line({ type: 'user', isSidechain: true, message: { content: 'from a subagent' } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'tool output' }] } }),
    line({ type: 'assistant', message: { content: 'assistant words' } }),
    line({ type: 'user', message: { content: 'second typed' } }),
    line({ type: 'user', isMeta: true, message: { content: 'meta text' } }),
    line({ type: 'user', isCompactSummary: true, message: { content: 'summary text' } }),
    line({ type: 'user', message: { content: '<command-name>/clear</command-name>' } }),
    line({ type: 'user', message: { content: '<local-command-stdout>out</local-command-stdout>' } }),
    line({ type: 'user', message: { content: '<bash-input>ls</bash-input>' } }),
    line({ type: 'user', message: { content: [{ type: 'text', text: 'typed with image' }, { type: 'image' }] } })
  ], new Date(2026, 5, 1));
  return { config, project, folder };
}

function run(args, config) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: config } });
}

test('prints user-typed text of each session, newest first', () => {
  const { config, project, folder } = fixture();
  const result = run(['--cwd', project], config);
  assert.equal(result.status, 0, result.stderr);
  const newest = path.join(folder, 'new.jsonl');
  const oldest = path.join(folder, 'old.jsonl');
  assert.equal(result.stdout, `=== ${newest} ===\nfirst typed\nsecond typed\ntyped with image\n\n=== ${oldest} ===\nold message\n`);
});

test('--limit caps the number of sessions', () => {
  const { config, project, folder } = fixture();
  const result = run(['--cwd', project, '--limit', '1'], config);
  assert.equal(result.stdout.includes(path.join(folder, 'new.jsonl')), true);
  assert.equal(result.stdout.includes('old.jsonl'), false);
});

test('a project with no sessions prints nothing', () => {
  const { config } = fixture();
  const result = run(['--cwd', '/nowhere/else'], config);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

function runWithSession(args, config, sessionId) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  if (sessionId === undefined) delete env.CLAUDE_CODE_SESSION_ID;
  else env.CLAUDE_CODE_SESSION_ID = sessionId;
  return spawnSync('node', [script, ...args], { encoding: 'utf8', env });
}

test('skips task notifications', () => {
  const { config, project, folder } = fixture();
  fs.writeFileSync(path.join(folder, 'new.jsonl'), [
    line({ type: 'user', origin: { kind: 'human' }, message: { content: 'typed by a human' } }),
    line({ type: 'user', origin: { kind: 'task-notification', producer: 'session-task', runId: 'r1' }, message: { content: 'finished task output' } })
  ].join(''));
  const result = runWithSession(['--cwd', project, '--limit', '1'], config);
  assert.equal(result.stdout.includes('typed by a human'), true);
  assert.equal(result.stdout.includes('finished task output'), false);
});

test('--chars keeps the last characters of each session', () => {
  const { config, project, folder } = fixture();
  const result = runWithSession(['--cwd', project, '--chars', '5'], config);
  assert.equal(result.stdout, `=== ${path.join(folder, 'new.jsonl')} ===\nimage\n\n=== ${path.join(folder, 'old.jsonl')} ===\nssage\n`);
});

test('drops pasted blocks and prints no block for a session left empty', () => {
  const { config, project, folder } = fixture();
  fs.writeFileSync(path.join(folder, 'new.jsonl'), [
    line({ type: 'user', message: { content: 'see <pasted_content id="1" kind="text">\nlong paste\n</pasted_content>this' } }),
    line({ type: 'user', message: { content: '<pasted_content id="2">only paste</pasted_content>' } })
  ].join(''));
  fs.writeFileSync(path.join(folder, 'old.jsonl'), line({ type: 'user', message: { content: '<pasted_content id="3">x</pasted_content>' } }));
  const result = runWithSession(['--cwd', project], config);
  assert.equal(result.stdout, `=== ${path.join(folder, 'new.jsonl')} ===\nsee this\n`);
});

test('skips the running session', () => {
  const { config, project, folder } = fixture();
  const result = runWithSession(['--cwd', project], config, 'new');
  assert.equal(result.stdout, `=== ${path.join(folder, 'old.jsonl')} ===\nold message\n`);
});

test('reads worktree sibling folders, newest first across all folders', () => {
  const { config, project, folder } = fixture();
  const sibling = `${folder}--claude-worktrees-feature`;
  fs.mkdirSync(sibling);
  const file = path.join(sibling, 'tree.jsonl');
  fs.writeFileSync(file, line({ type: 'user', message: { content: 'worktree message' } }));
  fs.utimesSync(file, new Date(2026, 3, 1), new Date(2026, 3, 1));
  const result = runWithSession(['--cwd', project], config);
  const order = ['new.jsonl', 'tree.jsonl', 'old.jsonl'].map((name) => result.stdout.indexOf(name));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(order.includes(-1), false);
});

test('from inside a worktree reads the project and its worktree folders only', () => {
  const { config, project, folder } = fixture();
  const worktree = path.join(project, '.claude', 'worktrees', 'feature');
  fs.mkdirSync(worktree, { recursive: true });
  const encoded = fs.realpathSync(worktree).replace(/[^A-Za-z0-9]/g, '-');
  const worktreeFolder = path.join(config, 'projects', encoded);
  const evalFolder = `${folder}--exo-design-redo-results-1`;
  for (const [directory, text] of [[worktreeFolder, 'from the worktree'], [evalFolder, 'from an eval run']]) {
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 's.jsonl'), line({ type: 'user', message: { content: text } }));
  }
  const result = runWithSession(['--cwd', worktree], config);
  assert.equal(result.stdout.includes('first typed'), true);
  assert.equal(result.stdout.includes('from the worktree'), true);
  assert.equal(result.stdout.includes('from an eval run'), false);
});
