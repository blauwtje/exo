#!/usr/bin/env node

import process from 'node:process';
import { isMain, environmentMs } from '#script-flags';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';
import { SESSION_REFUSAL, insideClaudeCode } from './run-session-env.mjs';
import { approveCommand, runCommand } from './run-command.mjs';
import { claudeCommand, keyCommand, setupCommand } from './setup-commands.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configDir, loadRunConfig, readKeys } from './run-config.mjs';
import { readOps, FINAL_PHASES, keptDir, listRuns, readGates, readState, runDir } from './run-state.mjs';
import { gitResult, shortSha } from '#git';
import { orWhenAbsent } from '#absent-path';
import { parseLine } from '#basics';
import { isAlive } from '#land-lock';
import { pollUntil } from '../../../lib/loop-budget.mjs';
import { CLI, watchCommand } from './run-session-paths.mjs';

const USAGE = 'usage: exo run [plan] [--detach] [run-plan flags] | exo run --resume <id> | exo approve <id> | exo status [<id>] | exo wait <id> | exo undo <id> [--apply] | exo run config [<key> <value>] | exo key set <provider> | exo claude [--provider <name>] [--effort <level>] [-- <claude args>] | exo setup';

const EXIT_CODE_COMMANDS = {
  undo: undoCommand,
  approve: approveCommand,
  wait: waitCommand,
  run: runCommand
};

function refuseInsideClaudeCode(command, rest) {
  const guarded = command === 'run' || command === 'approve' || (command === 'undo' && rest.includes('--apply'));
  if (guarded && insideClaudeCode()) throw new Refusal(`refused: ${SESSION_REFUSAL}`);
}

async function dispatch(command, rest) {
  if (command === 'setup') return setupCommand();
  if (command === 'key') return keyCommand(rest);
  if (command === 'claude') return claudeCommand(rest);
  if (command === 'run' && rest[0] === 'config') return configCommand(rest.slice(1));
  refuseInsideClaudeCode(command, rest);
  if (command === 'status') return statusCommand(rest);
  if (command === '--help') return process.stdout.write(`${USAGE}\n`);
  if (!Object.hasOwn(EXIT_CODE_COMMANDS, command)) throw new Refusal(USAGE);
  process.exitCode = await EXIT_CODE_COMMANDS[command](rest);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    await dispatch(command, rest);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}

function leaves(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix ? `${prefix}.${key}` : key));
}

function has(object, dotted) {
  let at = object;
  for (const key of dotted.split('.')) {
    if (at === null || typeof at !== 'object' || !(key in at)) return false;
    at = at[key];
  }
  return true;
}

function readUserConfig(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Refusal(`cannot read ${file}: ${error.message}`);
  }
}

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return raw;
  }
}

function printConfig(home, file) {
  const user = readUserConfig(file);
  const merged = loadRunConfig({ home });
  for (const [key, value] of leaves(merged)) {
    process.stdout.write(`${key} = ${JSON.stringify(value)} (${has(user, key) ? 'run.json' : 'catalog'})\n`);
  }
  const keys = readKeys(path.join(configDir(home), 'keys.env'));
  for (const [name, entry] of Object.entries(merged.providers)) {
    if (entry.key) process.stdout.write(`key ${entry.key} (${name}): ${keys[entry.key] ? 'set' : 'missing'}\n`);
  }
}

function writeConfig(home, file, [key, raw]) {
  const value = parseValue(raw);
  const user = readUserConfig(file);
  user[key] = value;
  fs.mkdirSync(configDir(home), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(user, null, 2)}\n`);
  process.stdout.write(`exo: ${key} = ${JSON.stringify(value)} written to ${file}\n`);
}

function configCommand(args) {
  const home = os.homedir();
  const file = path.join(configDir(home), 'run.json');
  if (args.length === 0) return printConfig(home, file);
  if (args.length !== 2) throw new Refusal(`usage: exo run config [<key> <value>]; got: ${args.join(' ')}`);
  writeConfig(home, file, args);
}

const shaLabel = (sha) => (sha === null ? 'none' : shortSha(sha));
const refSha = (root, ref) => {
  const found = gitResult(root, ['rev-parse', '-q', '--verify', ref]);
  return found.ok ? found.text : null;
};

function checkedOutAt(root, ref) {
  const listed = gitResult(root, ['worktree', 'list', '--porcelain']).text.split('\n\n');
  const entry = listed.find((block) => block.split('\n').includes(`branch ${ref}`));
  return entry === undefined ? null : entry.split('\n')[0].slice('worktree '.length);
}

const isDirty = (tree) => gitResult(tree, ['status', '--porcelain']).text !== '';
const refused = (text) => ({ status: 'refused', text });
const settled = (text) => ({ status: 'already', text });

function reverseRef(root, id, op) {
  const current = refSha(root, op.ref);
  const label = `${op.ref} ${shaLabel(op.after)} -> ${shaLabel(op.before)}`;
  if (current === op.before) return settled(`${label}: already undone`);
  if (current !== op.after) return refused(`${label}: ${op.ref} is now at ${shaLabel(current)}, not the recorded ${shaLabel(op.after)}`);
  const holder = checkedOutAt(root, op.ref);
  const backup = `refs/exo/undo/${id}/${op.ref.replace(/^refs\//, '')}`;
  if (op.after === null) {
    if (!gitResult(root, ['cat-file', '-e', `${op.before}^{commit}`]).ok) return refused(`${label}: commit ${shaLabel(op.before)} is gone`);
    return { status: 'would', text: `${label}: recreate the deleted ref`, run: () => gitResult(root, ['update-ref', op.ref, op.before, '']) };
  }
  if (holder !== null && isDirty(holder)) return refused(`${label}: checked out in ${holder} with uncommitted work`);
  if (op.before === null) {
    if (holder !== null) return refused(`${label}: checked out in ${holder}; remove that worktree first`);
    return {
      status: 'would',
      text: `${label}: remove the created ref, backup ${backup}`,
      run: () => {
        gitResult(root, ['update-ref', backup, op.after]);
        return gitResult(root, ['update-ref', '-d', op.ref, op.after]);
      },
    };
  }
  return {
    status: 'would',
    text: `${label}: move the ref back, backup ${backup}`,
    run: () => {
      gitResult(root, ['update-ref', backup, op.after]);
      return holder === null ? gitResult(root, ['update-ref', op.ref, op.before, op.after]) : gitResult(holder, ['reset', '--hard', '-q', op.before]);
    },
  };
}

function reverseHead(op) {
  const now = gitResult(op.root, ['symbolic-ref', '-q', 'HEAD']).text || null;
  const label = `HEAD of ${op.root} ${op.after ?? 'detached'} -> ${op.before ?? 'detached'}`;
  if (now === op.before) return settled(`${label}: already undone`);
  if (now !== op.after) return refused(`${label}: HEAD is now ${now ?? 'detached'}`);
  if (op.before === null) return { status: 'manual', text: `${label}: left as is, the checkout was detached before the run` };
  if (isDirty(op.root)) return refused(`${label}: ${op.root} has uncommitted work`);
  return { status: 'would', text: `${label}: switch back`, run: () => gitResult(op.root, ['switch', op.before.replace(/^refs\/heads\//, '')]) };
}

function reverseWorktree(op) {
  if (!fs.existsSync(op.path)) return settled(`worktree ${op.path}: already gone`);
  const state = isDirty(op.path) ? 'has uncommitted work' : 'is clean';
  return { status: 'manual', text: `worktree ${op.path} ${state}; undo leaves it in place, you remove it when done` };
}

const reversePush = (op) => ({
  status: 'manual',
  text: `pushed ${shortSha(op.sha)} to ${op.remote}/${op.ref}; remote operations are not reversed, revert it on the remote yourself`,
});

const REVERSERS = {
  ref: (root, id, op) => reverseRef(root, id, op),
  head: (root, id, op) => reverseHead(op),
  worktree: (root, id, op) => reverseWorktree(op),
  push: (root, id, op) => reversePush(op),
};

function planUndo(root, id, ops) {
  return [...ops].reverse().map((op) => (REVERSERS[op.kind] ?? (() => refused(`unknown operation ${op.kind}`)))(root, id, op));
}

function settle(item, apply) {
  if (!apply || item.status !== 'would') return item;
  const done = item.run();
  return done.ok ? { status: 'done', text: item.text } : refused(`${item.text}: ${done.error.split('\n')[0]}`);
}

function undoRun(root, id, { apply }) {
  const ops = readOps(root, id);
  if (ops.length === 0) throw new Refusal(`run ${id} recorded no operations in this checkout`);
  const items = [];
  for (const op of [...ops].reverse()) {
    const item = planUndo(root, id, [op])[0];
    const blocked = items.some((earlier) => earlier.status === 'refused');
    items.push(blocked && item.status === 'would' ? { status: 'skipped', text: `${item.text}: not applied, a later step was refused` } : settle(item, apply));
  }
  return {
    lines: items.map((item) => `${item.status}: ${item.text}`),
    refused: items.filter((item) => item.status === 'refused').length,
    pending: items.filter((item) => item.status === 'would').length,
  };
}

function undoCommand(args) {
  const apply = args.includes('--apply');
  const ids = args.filter((arg) => arg !== '--apply');
  if (ids.length !== 1 || ids[0].startsWith('-')) throw new Refusal(`usage: exo undo <id> [--apply] (got: ${args.join(' ') || 'no arguments'})`);
  const result = undoRun(checkoutRoot(process.cwd()), ids[0], { apply });
  process.stdout.write(`${result.lines.join('\n')}\n`);
  const plural = result.pending === 1 ? '' : 's';
  if (!apply) process.stdout.write(`exo: dry run, nothing changed; ${result.pending} step${plural} to apply with: exo undo ${ids[0]} --apply\n`);
  if (apply) process.stdout.write(`exo: moved refs are kept under refs/exo/undo/${ids[0]}/; restore one with git update-ref <ref> <backup>\n`);
  return result.refused === 0 ? 0 : 3;
}

const WAIT_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 1000;
const WATCHING = path.join(path.dirname(CLI), '..', '..', 'spec', 'references', 'watching.md');
const WAITING_PHASES = ['stopped', 'crashed', 'parked', 'refused'];

function phaseText(state) {
  return WAITING_PHASES.includes(state.phase) && state.updatedAt ? `${state.phase}, waiting since ${state.updatedAt}` : state.phase;
}

function statusCommand(args) {
  const root = checkoutRoot(process.cwd());
  const runs = args[0] === undefined ? listRuns(root) : [readState(root, args[0])].filter(Boolean);
  if (runs.length === 0) throw new Refusal(args[0] === undefined ? 'no runs in this checkout' : `no run ${args[0]} in this checkout`);
  for (const run of runs) {
    const gone = !FINAL_PHASES.includes(run.phase) && !isAlive(run.pid);
    const note = run.phase === 'parked' ? `; exo approve ${run.id}` : gone ? `; process gone, continue with: exo run --resume ${run.id}` : '';
    process.stdout.write(`${run.id}  ${phaseText(run)}  ${path.basename(run.plan)}  pid ${run.pid}${run.log ? `  log ${run.log}` : ''}${note}\n`);
    for (const gate of readGates(runDir(root, run.id)).filter((g) => g.status === 'open')) {
      process.stdout.write(`  open gate: ${gate.source}: ${gate.action} (${gate.reason})\n`);
    }
  }
}

function findRun(root, id) {
  const dir = keptDir(root, id);
  const kept = orWhenAbsent(() => parseLine(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')), null);
  if (kept !== null) return { state: kept, dir, kept: true };
  const state = readState(root, id);
  return state === null ? null : { state, dir: runDir(root, id), kept: false };
}

function finishWait(state, id, dir) {
  const report = path.join(dir, 'report.md');
  process.stdout.write(`exo: run ${id} ${phaseText(state)}; report ${report}\n`);
  if (['passed', 'landed'].includes(state.phase)) return 0;
  const next = {
    refused: `fix the cause, then rerun node "${CLI}" run "${state.plan}" --detach`,
    parked: `read ${report}, then node "${CLI}" approve ${id}`
  }[state.phase] ?? `read ${report}, one worktree agent repairs per ${WATCHING} (the lead edits no file), then node "${CLI}" run --resume ${id} --detach`;
  process.stdout.write(`${state.reason ? `Reason: ${state.reason}\n` : ''}Next: ${next}\n`);
  return 1;
}

function requireRun(root, id) {
  const found = findRun(root, id);
  if (found === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
  return found;
}

function runSettled(root, id) {
  const { state, kept } = requireRun(root, id);
  const final = FINAL_PHASES.includes(state.phase);
  const alive = isAlive(state.pid);
  return final ? kept || !alive : !alive;
}

function settledExit(root, id) {
  const { state, dir } = requireRun(root, id);
  if (FINAL_PHASES.includes(state.phase)) return finishWait(state, id, dir);
  process.stdout.write(`exo: run ${id} ${state.phase}; process gone, continue with: exo run --resume ${id}\n`);
  return 1;
}

async function waitCommand(args) {
  const root = checkoutRoot(process.cwd());
  const id = args[0];
  if (id === undefined || args.length !== 1) throw new Refusal(`usage: exo wait <id> (got: ${args.join(' ') || 'no arguments'})`);
  const settled = await pollUntil(() => runSettled(root, id), { intervalMs: POLL_MS, wallMs: environmentMs('EXO_WAIT_MS', WAIT_MS) });
  if (settled) return settledExit(root, id);
  const { state } = findRun(root, id);
  process.stdout.write(`exo: run ${id} still ${state.phase} at the wait deadline; keep waiting with: ${watchCommand(id)}\n`);
  return 124;
}

if (isMain(import.meta.url)) await main();
