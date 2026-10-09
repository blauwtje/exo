#!/usr/bin/env node
// SessionStart hook: injects facts only, in order: a handoff pointer, a
// project-memory pointer, the settings line, the Codex host note on Codex, then
// hooks/session-rules.md when it exists. Node, so a host without `jq` works.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { currentHost } from '#host';
import { readHookText } from '#hook-input';

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const onCodex = currentHost() === 'codex';
// Codex keeps its own pointer, so it cannot repoint Claude's plugin root.
const configDirectory = onCodex
  ? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'exo')
  : path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo');

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// A file inside the repository is named from its root; one outside it, or under
// the main checkout of a linked worktree, keeps its full path.
function located(file, top) {
  const relative = top ? path.relative(top, file) : '';
  if (relative === '' || relative.startsWith('..')) return `\`${file}\``;
  return `\`${relative}\` from the repository root`;
}

// Only pointers are injected: the files are long and most sessions do not need them.
function pointersFor(cwd) {
  let pointers = '';
  const gitDirectory = git(cwd, 'rev-parse', '--absolute-git-dir');
  const top = gitDirectory === null ? null : git(cwd, 'rev-parse', '--show-toplevel');
  const scope = gitDirectory === null ? path.basename(cwd) : git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? '';
  const handoffFile = gitDirectory === null
    ? path.join(configDirectory, 'handoff', `${scope}.md`)
    : path.join(gitDirectory, 'exo', 'handoff', `${scope}.md`);
  if (fs.existsSync(handoffFile) && fs.statSync(handoffFile).isFile()) {
    const staleness = gitDirectory === null ? '' : ' Compare its `Written:` commit with `git rev-parse --short HEAD`.';
    pointers += `A handoff for \`${scope}\` sits at ${located(handoffFile, top)}. Read it only when this session continues that work.${staleness}\n\n`;
  }
  // The memory belongs to the repository, so it sits in the common git directory.
  const commonDirectory = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  const memoryFile = commonDirectory === null
    ? path.join(configDirectory, 'memory', path.basename(cwd), 'memory.md')
    : path.join(commonDirectory, 'exo', 'memory.md');
  if (fs.existsSync(memoryFile) && fs.statSync(memoryFile).isFile()) {
    pointers += `A project memory for this repository sits at ${located(memoryFile, top)}. Read it before changing code you have not read here, and run \`/exo:remember\` to change it.\n\n`;
  }
  return pointers;
}

let input = {};
try {
  input = JSON.parse((await readHookText()) || '{}');
} catch (error) {
  console.error(`exo: session hook input unreadable, ${error.message}`);
}

// The status line and skills reach the versioned install through this pointer.
try {
  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(path.join(configDirectory, 'plugin-root'), `${root}\n`);
  fs.rmSync(path.join(configDirectory, 'savings'), { recursive: true, force: true });
} catch (error) {
  console.error(`exo: plugin-root pointer not written, ${error.message}`);
}

const pointers = typeof input.cwd === 'string' && input.cwd !== '' ? pointersFor(input.cwd) : '';
// settings.mjs runs its command at load, so it runs in its own process.
const settingsRun = spawnSync(process.execPath, [path.join(root, 'skills/configure/scripts/settings.mjs'), 'context'], { encoding: 'utf8' });
const settings = settingsRun.status === 0 ? settingsRun.stdout.replace(/\n+$/, '') : 'exo settings: unresolved, defaults apply';
const parts = [`${pointers}${settings}`];
if (onCodex) parts.push(fs.readFileSync(path.join(root, 'harnesses', 'codex', 'host-note.md'), 'utf8').replaceAll('{root}', root).trimEnd());
const rulesFile = path.join(root, 'hooks', 'session-rules.md');
if (fs.existsSync(rulesFile)) parts.push(fs.readFileSync(rulesFile, 'utf8').trimEnd());
const additionalContext = parts.join('\n\n');
process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } })}\n`);
