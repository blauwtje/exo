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

function sessionArgs({ cell, budget, pluginDir }) {
  const [model, effort] = cell.split(':');
  return ['-p', PROMPT, '--model', model, '--effort', effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(budget), '--plugin-dir', pluginDir];
}

export function runSession({ cell, budget, pluginDir, stream, home }) {
  const { base, project, tmp } = freshProject();
  const confined = confinedClaude({ args: sessionArgs({ cell, budget, pluginDir }), roots: [base], cwd: project, tmp });
  const run = withHome(confined, home);
  return new Promise((resolve) => {
    const output = fs.openSync(stream, 'w');
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', output, 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), SESSION_MS);
    child.on('close', () => {
      clearTimeout(timer);
      fs.closeSync(output);
      fs.rmSync(base, { recursive: true, force: true });
      resolve();
    });
  });
}
