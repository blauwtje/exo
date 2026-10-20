#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { currentHost } from '#host';
import { readHookText } from '#hook-input';

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const onCodex = currentHost() === 'codex';
const configDirectory = onCodex
  ? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'exo')
  : path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo');

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function located(file, top) {
  const relative = top ? path.relative(top, file) : '';
  if (relative === '' || relative.startsWith('..')) return `\`${file}\``;
  return `\`${relative}\` from the repository root`;
}

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
    const resumeLine = fs.readFileSync(handoffFile, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line.startsWith('Resume: ')).pop();
    const resume = resumeLine === undefined ? '' : ` To continue it, the user sends: ${resumeLine.slice('Resume: '.length, 'Resume: '.length + 300)}`;
    pointers += `A handoff for \`${scope}\` sits at ${located(handoffFile, top)}. Read it only when this session continues that work.${staleness}${resume}\n\n`;
  }
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

try {
  fs.mkdirSync(configDirectory, { recursive: true });
  // why: only the harness sets CLAUDE_PLUGIN_ROOT to the copy it loads; a hand run or a clone loaded by a pressure session must not repoint the real pointer.
  const loadedRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (loadedRoot && fs.existsSync(loadedRoot) && fs.realpathSync(loadedRoot) === fs.realpathSync(root)) {
    fs.writeFileSync(path.join(configDirectory, 'plugin-root'), `${root}\n`);
  }
  fs.rmSync(path.join(configDirectory, 'savings'), { recursive: true, force: true });
} catch (error) {
  console.error(`exo: plugin-root pointer not written, ${error.message}`);
}

// why: a detached run session (EXO_RUN_DIR, set by exo-cli.mjs for every spawned kind) reads no human-facing context; its final report is machine-read.
if (process.env.EXO_RUN_DIR) process.exit(0);

const pointers = typeof input.cwd === 'string' && input.cwd !== '' ? pointersFor(input.cwd) : '';
// why: the hook process starts wherever the host ran it; the session's folder, input.cwd, holds the project settings.
const sessionDirectory = typeof input.cwd === 'string' && fs.existsSync(input.cwd) && fs.statSync(input.cwd).isDirectory() ? input.cwd : undefined;
const settingsRun = spawnSync(process.execPath, [path.join(root, 'skills/configure/scripts/settings.mjs'), 'context'], { encoding: 'utf8', cwd: sessionDirectory });
const settings = settingsRun.status === 0 ? settingsRun.stdout.replace(/\n+$/, '') : 'exo settings: unresolved, defaults apply';
const parts = [`${pointers}${settings}`];
if (onCodex) parts.push(fs.readFileSync(path.join(root, 'harnesses', 'codex', 'host-note.md'), 'utf8').replaceAll('{root}', root).trimEnd());
const routingFile = path.join(root, 'hooks', 'session-routing.md');
if (fs.existsSync(routingFile)) parts.push(fs.readFileSync(routingFile, 'utf8').trimEnd());
const rulesFile = path.join(root, 'hooks', 'session-rules.md');
if (fs.existsSync(rulesFile)) parts.push(fs.readFileSync(rulesFile, 'utf8').trimEnd());
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
