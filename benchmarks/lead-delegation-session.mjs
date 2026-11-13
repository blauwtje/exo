import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confinedClaude } from '#confine-claude';
import { withHome } from '../skills/edit-skills/scripts/pressure-home.mjs';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lead-delegation-fixture');
const PROMPT = 'Refactor the pipeline board visually in full: give every component in src/board (Board, Column, Card, Drawer, Toolbar) a new modern look with shared design tokens, a drawer that slides in, and drag styling on the cards. Decide everything yourself and ask nothing.';
const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lead-delegation-hook.mjs');
const SIDECAR = 'lead-bash-writes.jsonl';
const SESSION_MS = 1_800_000;

function git(directory, args) {
  execFileSync('git', ['-C', directory, ...args], { stdio: 'ignore' });
}

function freshProject() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-lead-delegation-')));
  const project = path.join(base, 'project');
  fs.cpSync(FIXTURE, project, { recursive: true });
  fs.mkdirSync(path.join(base, 'tmp'));
  git(project, ['init', '-q']);
  git(project, ['add', '-A']);
  git(project, ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', 'commit', '-q', '-m', 'fixture']);
  return { base, project, tmp: path.join(base, 'tmp') };
}

function bashHooks(project, tmp) {
  const entry = (phase) => [{ matcher: 'Bash', hooks: [{ type: 'command', command: `node ${HOOK} ${phase} ${project} ${tmp}` }] }];
  return JSON.stringify({ hooks: { PreToolUse: entry('pre'), PostToolUse: entry('post') } });
}

function sessionArgs({ cell, budget, pluginDir, project, tmp, prompt = PROMPT }) {
  const [model, effort] = cell.split(':');
  return ['-p', prompt, '--model', model, '--effort', effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(budget), '--plugin-dir', pluginDir, '--settings', bashHooks(project, tmp)];
}

function appendBashWrites(stream, tmp) {
  const sidecar = path.join(tmp, SIDECAR);
  if (fs.existsSync(sidecar)) fs.appendFileSync(stream, fs.readFileSync(sidecar));
}

export function runSession({ cell, budget, pluginDir, stream, home, prompt }) {
  const { base, project, tmp } = freshProject();
  const confined = confinedClaude({ args: sessionArgs({ cell, budget, pluginDir, project, tmp, prompt }), roots: [base], cwd: project, tmp });
  const run = withHome(confined, home);
  return new Promise((resolve) => {
    const output = fs.openSync(stream, 'w');
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', output, 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), SESSION_MS);
    child.on('close', () => {
      clearTimeout(timer);
      fs.closeSync(output);
      appendBashWrites(stream, tmp);
      fs.rmSync(base, { recursive: true, force: true });
      resolve();
    });
  });
}
