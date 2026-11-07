#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { currentHost } from '#host';
import { inSidecall, readHookText } from '#hook-input';
import { refreshStatusLauncher, writePluginPointer } from '#plugin-pointer';
import { pruneExo } from '#exo-prune';
import { removeSavedOutputs } from '../lib/saved-outputs.mjs';
import { passUnmatchedGlobs } from '../lib/shell-fixes.mjs';
import { pointersFor } from '../lib/session-pointers.mjs';
import { dispatchMarker, readDispatchRules } from './dispatch-rules.mjs';

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const onCodex = currentHost() === 'codex';
const configDirectory = onCodex
  ? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'exo')
  : path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo');

if (inSidecall()) process.exit(0);

let input = {};
try {
  input = JSON.parse((await readHookText()) || '{}');
} catch (error) {
  console.error(`exo: session hook input unreadable, ${error.message}`);
}

try {
  fs.mkdirSync(configDirectory, { recursive: true });
  // why: only the harness sets CLAUDE_PLUGIN_ROOT to the copy it loads; a hand run or a clone loaded by a pressure session must not repoint the real pointer.
  const loadedRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (loadedRoot && fs.existsSync(loadedRoot) && fs.realpathSync(loadedRoot) === fs.realpathSync(root)) {
    writePluginPointer(configDirectory, root);
  }
  if (!onCodex) refreshStatusLauncher(configDirectory);
} catch (error) {
  console.error(`exo: plugin-root pointer not written, ${error.message}`);
}

try {
  removeSavedOutputs();
  passUnmatchedGlobs(process.env.CLAUDE_ENV_FILE);
} catch (error) {
  console.error(`exo: saved Bash logs or the session shell setup not written, ${error.message}`);
}

// why: a detached run session (EXO_RUN_DIR, set by exo-cli.mjs for every spawned kind) reads no human-facing context; its final report is machine-read.
if (process.env.EXO_RUN_DIR) process.exit(0);

if (typeof input.cwd === 'string' && input.cwd !== '') pruneExo({ cwd: input.cwd });

const pointers = typeof input.cwd === 'string' && input.cwd !== '' ? pointersFor(configDirectory, input.cwd, input.source) : '';
// why: the hook process starts wherever the host ran it; the session's folder, input.cwd, holds the project settings.
const sessionDirectory = typeof input.cwd === 'string' && fs.existsSync(input.cwd) && fs.statSync(input.cwd).isDirectory() ? input.cwd : undefined;
const settingsRun = spawnSync(process.execPath, [path.join(root, 'skills/configure/scripts/settings.mjs'), 'context'], { encoding: 'utf8', cwd: sessionDirectory });
const settings = settingsRun.status === 0 ? settingsRun.stdout.replace(/\n+$/, '') : 'exo settings: unresolved, defaults apply';
const parts = [`${pointers}${settings}`];
if (onCodex) parts.push(fs.readFileSync(path.join(root, 'harnesses', 'codex', 'host-note.md'), 'utf8').replaceAll('{root}', root).trimEnd());
const rulesKeptByTranscript = !onCodex && input.source === 'resume';
const staticFiles = rulesKeptByTranscript ? [] : ['session-routing.md', 'session-rules.md'];
for (const name of staticFiles) {
  const file = path.join(root, 'hooks', name);
  if (fs.existsSync(file)) parts.push(fs.readFileSync(file, 'utf8').trimEnd());
}
// why: Codex serves no Agent hook, so its session text keeps the dispatch rules; on Claude Code a clear or compaction drops them, so the next Agent call delivers them again.
if (onCodex) parts.push(readDispatchRules());
else if (typeof input.session_id === 'string' && input.session_id !== '') fs.rmSync(dispatchMarker(input.session_id), { force: true });
const additionalContext = parts.join('\n\n');
// why: systemMessage shows to the user only, so the line costs no model tokens. The `receipts` setting turns "exo is on" off, and Codex never shows it; a Node warning still shows.
let neededNode = 0;
try {
  neededNode = Number(/>=\s*(\d+)/.exec(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).engines?.node ?? '')?.[1] ?? 0);
} catch {}
const nodeWarning = Number(process.versions.node.split('.')[0]) < neededNode
  ? `\nexo needs Node ${neededNode} or newer, and this is Node ${process.versions.node}. Update Node, or some exo hooks and scripts will fail.`
  : '';
const receiptsRun = onCodex ? undefined : spawnSync(process.execPath, [path.join(root, 'skills/configure/scripts/settings.mjs'), 'get', 'receipts'], { encoding: 'utf8', cwd: sessionDirectory });
const receiptsOff = onCodex || (receiptsRun.status === 0 && receiptsRun.stdout.trim() === 'off');
const systemMessage = `${receiptsOff ? '' : 'exo is on'}${nodeWarning}`.trim();
process.stdout.write(`${JSON.stringify({ ...(systemMessage && { systemMessage }), hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } })}\n`);
