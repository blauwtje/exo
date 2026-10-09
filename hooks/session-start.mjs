#!/usr/bin/env node
// SessionStart hook on startup, resume, clear and compact: builds one
// additionalContext string, in order: a handoff pointer, a project-memory
// pointer, the settings line, the Codex host note on Codex, then the text of
// hooks/session-rules.md when that file exists. Facts only: no skill body, no
// welcome. It runs in Node so a host without `jq` still gets the injection.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { currentHost } from '#host';
import { readHookText } from '#hook-input';

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const onCodex = currentHost() === 'codex';
// A Codex session keeps its pointer under Codex's own folder, so it cannot
// repoint Claude's copy of the plugin root.
const configDirectory = onCodex
  ? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'exo')
  : path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo');

// Runs a script of this plugin in its own process, for the one that is not
// importable: settings.mjs runs its command at load. Lift it by exporting
// `contextLine` and importing it.
function runScript(relativePath, argument, input) {
  return spawnSync(process.execPath, [path.join(root, relativePath), argument], { input, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// A file inside the repository is named from its root, because a full path
// grows with every folder above the checkout; one outside it keeps its full path.
function located(file, top) {
  if (!top) return `\`${file}\``;
  const relative = path.relative(top, file);
  // A linked worktree keeps its handoff and memory under the main checkout, so
  // the relative path climbs out of the root and only the full path resolves.
  if (relative === '' || relative.startsWith('..')) return `\`${file}\``;
  return `\`${relative}\` from the repository root`;
}

// A handoff the user wrote before a clear sits beside the branch it belongs to,
// so a session resuming that work is told where it is instead of searching for
// it. Only the pointer is injected: the file itself is often longer than this
// whole body, and most sessions here are not the one it was written for.
function pointersFor(cwd) {
  let pointers = '';
  // The commit sentence is added only inside a repository, where the reader has
  // a HEAD to compare the file against.
  let staleness = '';
  let scope;
  let handoffFile;
  let top = null;
  const gitDirectory = git(cwd, 'rev-parse', '--absolute-git-dir');
  if (gitDirectory !== null) {
    top = git(cwd, 'rev-parse', '--show-toplevel');
    scope = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? '';
    handoffFile = path.join(gitDirectory, 'exo', 'handoff', `${scope}.md`);
    staleness = ' Compare its `Written:` commit with `git rev-parse --short HEAD`.';
  } else {
    scope = path.basename(cwd);
    handoffFile = path.join(configDirectory, 'handoff', `${scope}.md`);
  }
  if (fs.existsSync(handoffFile) && fs.statSync(handoffFile).isFile()) {
    pointers += `A handoff for \`${scope}\` sits at ${located(handoffFile, top)}. Read it only when this session continues that work.${staleness}\n\n`;
  }
  // The project memory belongs to the repository rather than to one branch, so
  // it sits in the common git directory a linked worktree shares. Only the
  // pointer is injected: the body is read by the session that needs it.
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

// The installed copy lives under a versioned cache path, so the status line
// and the skills reach the scripts through this pointer instead of a path that
// rots per bump; a resumed session can run a newer copy than it started on.
try {
  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(path.join(configDirectory, 'plugin-root'), `${root}\n`);
  // The savings ledger and counter left by earlier versions are dead weight now.
  fs.rmSync(path.join(configDirectory, 'savings'), { recursive: true, force: true });
} catch (error) {
  console.error(`exo: plugin-root pointer not written, ${error.message}`);
}

const pointers = typeof input.cwd === 'string' && input.cwd !== '' ? pointersFor(input.cwd) : '';
// Skills read project and global choices, such as where spec stores a spec,
// from this one line instead of opening the settings files themselves.
const settingsRun = runScript('skills/configure/scripts/settings.mjs', 'context');
const settings = settingsRun.status === 0 ? settingsRun.stdout.replace(/\n+$/, '') : 'exo settings: unresolved, defaults apply';
const parts = [`${pointers}${settings}`];
if (onCodex) parts.push(fs.readFileSync(path.join(root, 'harnesses', 'codex', 'host-note.md'), 'utf8').replaceAll('{root}', root).trimEnd());
const rulesFile = path.join(root, 'hooks', 'session-rules.md');
if (fs.existsSync(rulesFile)) parts.push(fs.readFileSync(rulesFile, 'utf8').trimEnd());
const additionalContext = parts.join('\n\n');
process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } })}\n`);
