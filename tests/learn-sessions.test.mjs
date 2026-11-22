import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { projectFolder, promptMessages, sessionFiles, toolCalls } from '../skills/learn/scripts/sessions.mjs';

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

function withConfig(config, body) {
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
}

const texts = (file) => promptMessages(file).map(({ text }) => text);

test('sessionFiles lists the project sessions newest first', () => {
  const { config, project, folder } = fixture();
  const files = withConfig(config, () => sessionFiles(projectFolder(project)));
  assert.deepEqual(files, [path.join(folder, 'new.jsonl'), path.join(folder, 'old.jsonl')]);
});

test('sessionFiles finds nothing for a project with no sessions', () => {
  const { config } = fixture();
  assert.deepEqual(withConfig(config, () => sessionFiles(projectFolder('/nowhere/else'))), []);
});

test('sessionFiles skips the running session', () => {
  const { config, project, folder } = fixture();
  const files = withConfig(config, () => sessionFiles(projectFolder(project), 'new'));
  assert.deepEqual(files, [path.join(folder, 'old.jsonl')]);
});

test('promptMessages keeps typed text and skips subagent, tool, meta and summary entries', () => {
  const { folder } = fixture();
  const messages = promptMessages(path.join(folder, 'new.jsonl'));
  assert.deepEqual(messages.filter(({ kind }) => kind === 'stored').map(({ text }) => text), ['first typed', 'second typed', 'typed with image']);
  assert.deepEqual(messages.filter(({ kind }) => kind === 'rebuilt').map(({ text }) => text), ['/clear ']);
  assert.deepEqual(messages.filter(({ kind }) => kind === 'skipped').map(({ text }) => text), ['<local-command-stdout>out</local-command-stdout>', '<bash-input>ls</bash-input>']);
});

test('promptMessages skips task notifications', () => {
  const { folder } = fixture();
  const file = path.join(folder, 'new.jsonl');
  fs.writeFileSync(file, [
    line({ type: 'user', origin: { kind: 'human' }, message: { content: 'typed by a human' } }),
    line({ type: 'user', origin: { kind: 'task-notification', producer: 'session-task', runId: 'r1' }, message: { content: 'finished task output' } })
  ].join(''));
  assert.deepEqual(texts(file), ['typed by a human']);
});

test('sessionFiles reads worktree sibling folders, newest first across all folders', () => {
  const { config, project, folder } = fixture();
  const sibling = `${folder}--claude-worktrees-feature`;
  fs.mkdirSync(sibling);
  const file = path.join(sibling, 'tree.jsonl');
  fs.writeFileSync(file, line({ type: 'user', message: { content: 'worktree message' } }));
  fs.utimesSync(file, new Date(2026, 3, 1), new Date(2026, 3, 1));
  const files = withConfig(config, () => sessionFiles(projectFolder(project)));
  assert.deepEqual(files.map((name) => path.basename(name)), ['new.jsonl', 'tree.jsonl', 'old.jsonl']);
});

test('from inside a worktree sessionFiles reads the project and its worktree folders only', () => {
  const { config, project, folder } = fixture();
  const worktree = path.join(project, '.claude', 'worktrees', 'feature');
  fs.mkdirSync(worktree, { recursive: true });
  const worktreeFolder = path.join(config, 'projects', fs.realpathSync(worktree).replace(/[^A-Za-z0-9]/g, '-'));
  const evalFolder = `${folder}--exo-design-redo-results-1`;
  for (const directory of [worktreeFolder, evalFolder]) {
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 's.jsonl'), line({ type: 'user', message: { content: 'x' } }));
  }
  const files = withConfig(config, () => sessionFiles(projectFolder(worktree)));
  assert.equal(files.includes(path.join(folder, 'new.jsonl')), true);
  assert.equal(files.includes(path.join(worktreeFolder, 's.jsonl')), true);
  assert.equal(files.includes(path.join(evalFolder, 's.jsonl')), false);
});

test('toolCalls gives one entry per tool_use with its failure, text and line', () => {
  const { folder } = fixture();
  const file = path.join(folder, 'tools.jsonl');
  const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
  fs.writeFileSync(file, [
    line({ type: 'user', timestamp: '2026-03-01T10:00:00Z', message: { content: 'go' } }),
    line({ type: 'assistant', timestamp: '2026-03-01T10:00:01Z', message: { content: [use('a', 'Bash', { command: 'npm test' }), use('b', 'Bash', { command: 'ls' }), use('c', 'Skill', { skill: 'exo:build' })] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'boom' }, { type: 'tool_result', tool_use_id: 'b', content: 'ok' }] } })
  ].join(''));
  assert.deepEqual(toolCalls(file), [
    { session: 'tools', date: '2026-03-01', line: 2, name: 'Bash', text: 'Bash npm test', failed: true },
    { session: 'tools', date: '2026-03-01', line: 2, name: 'Bash', text: 'Bash ls', failed: false },
    { session: 'tools', date: '2026-03-01', line: 2, name: 'Skill', text: 'Skill exo:build', failed: false }
  ]);
});

test('promptMessages gives each entry its transcript line', () => {
  const { folder } = fixture();
  const messages = promptMessages(path.join(folder, 'new.jsonl'));
  assert.deepEqual(messages.filter(({ kind }) => kind === 'stored').map(({ line: number }) => number), [1, 5, 11]);
});
