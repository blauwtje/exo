// Installs exo into every detected harness from this clone.
//
//   node install.mjs [--harness claude,codex] [--scope user|project|local]
//                    [--project <dir>]... [--yes] [--update] [--remove]
//
// Scopes follow Claude Code's `-s` values: `user` (every project), `project`
// (chosen projects, shared through git), `local` (chosen projects, private).
// With no flag and a terminal it asks for the harnesses, the scope and, for a
// per-project scope, the project folders (default: the current folder), then
// prints one plan and writes. Enter at every prompt installs every detected
// harness at user scope. `--yes`, or no terminal, takes the defaults for
// anything a flag leaves unset. `--update` runs `git pull --ff-only` in this
// clone, then asks every adapter to update what it recorded; `--remove` asks
// every adapter to remove it, narrowed by `--harness`, `--scope` and `--project`.
//
// Adapters (harnesses/registry.mjs) export `name`, `label`, `detect(env)`,
// `install(plan)`, `update(record)` and `remove(record)`:
//   detect(env)  -> { detected, installable, reason? }; a detected harness that
//                   is not installable carries the reason and is listed with it.
//   install(plan) with plan = { root, env, scope, project }, once per project
//                   (`project` is undefined for `user`).
//   update(record) / remove(record) with record = { root, env, scope?, project? }:
//                   the adapter walks its own installed.json and applies every
//                   install the optional `scope` and `project` match.
// Each returns a summary string or { summary, notes? }, or throws to abort that
// install; the installer carries on with the rest and exits 1 at the end.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { adapters as registered } from './harnesses/registry.mjs';
import { isMain } from './lib/script-flags.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCOPES = ['user', 'project', 'local'];

function parse(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      harness: { type: 'string' },
      scope: { type: 'string' },
      project: { type: 'string', multiple: true },
      yes: { type: 'boolean' },
      update: { type: 'boolean' },
      remove: { type: 'boolean' },
      // Set by the update itself on the child it starts after the pull; never typed.
      pulled: { type: 'boolean' }
    }
  });
  if (values.update && values.remove) throw new Error('--update and --remove cannot be combined');
  if (values.scope !== undefined && !SCOPES.includes(values.scope)) throw new Error(`--scope must be one of ${SCOPES.join(', ')}`);
  const mutating = !values.update && !values.remove;
  if (mutating && values.project !== undefined && values.scope === undefined) throw new Error('--project needs --scope project or local');
  if (mutating && values.project !== undefined && values.scope === 'user') throw new Error('--project does not apply to --scope user');
  const harness = values.harness === undefined ? undefined : splitList(values.harness);
  return { ...values, harness };
}

const splitList = (text) => text.split(',').map((item) => item.trim()).filter((item) => item !== '');

function pickAdapters(names, adapters) {
  if (names === undefined) return adapters;
  const known = adapters.map((adapter) => adapter.name);
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0) throw new Error(`unknown harness ${unknown.join(', ')}; known: ${known.join(', ') || 'none'}`);
  return adapters.filter((adapter) => names.includes(adapter.name));
}

function projectFolder(folder, cwd) {
  const resolved = path.resolve(cwd, folder);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`project folder ${resolved} is not a folder`);
  return resolved;
}

// Reads answers line by line; a closed input answers every later prompt with Enter.
function prompter(input, stdout) {
  const reader = readline.createInterface({ input });
  const lines = reader[Symbol.asyncIterator]();
  return {
    async ask(question) {
      stdout.write(question);
      const next = await lines.next();
      if (next.done) stdout.write('\n');
      return next.done ? '' : next.value.trim();
    },
    close: () => reader.close()
  };
}

function describe(result) {
  if (typeof result === 'string') return { summary: result, notes: [] };
  return { summary: result?.summary ?? 'done', notes: result?.notes ?? [] };
}

function report(stdout, adapter, result) {
  const { summary, notes } = describe(result);
  stdout.write(`  ${adapter.label}: ${summary}\n`);
  for (const note of notes) stdout.write(`    ${note}\n`);
}

async function runAll(jobs, stdout, stderr) {
  let failed = 0;
  for (const { adapter, target, call } of jobs) {
    try {
      report(stdout, adapter, await call());
    } catch (error) {
      failed += 1;
      stderr.write(`  ${adapter.label}${target ? ` (${target})` : ''} failed: ${error.message}\n`);
    }
  }
  return failed === 0 ? 0 : 1;
}

async function chooseInstall(options, adapters, context) {
  const { env, cwd, input, stdout, interactive } = context;
  const statuses = new Map();
  for (const adapter of adapters) statuses.set(adapter.name, await adapter.detect(env));
  const ready = adapters.filter((adapter) => statuses.get(adapter.name).installable);
  const blocked = adapters.filter((adapter) => statuses.get(adapter.name).detected && !statuses.get(adapter.name).installable);
  const asking = interactive && !options.yes;
  const ask = asking ? prompter(input, stdout) : undefined;
  try {
    let chosen = ready;
    if (options.harness !== undefined) {
      chosen = pickAdapters(options.harness, adapters);
      for (const adapter of chosen) {
        const status = statuses.get(adapter.name);
        if (status.detected && !status.installable) throw new Error(`${adapter.label} is not installable: ${status.reason ?? 'unknown reason'}`);
      }
    } else if (asking) {
      const names = ready.map((adapter) => adapter.name);
      for (const adapter of ready) stdout.write(`  ${adapter.name}: ${adapter.label}\n`);
      const answer = await ask.ask(`Harnesses [${names.join(',')}]: `);
      if (answer !== '') chosen = pickAdapters(splitList(answer), ready.length > 0 ? ready : adapters);
    }
    if (chosen.length === 0) {
      const reasons = blocked.map((adapter) => `${adapter.label}: ${statuses.get(adapter.name).reason ?? 'not installable'}`);
      throw new Error(`no harness to install into${reasons.length > 0 ? ` (${reasons.join('; ')})` : ''}`);
    }

    let scope = options.scope;
    if (scope === undefined && asking) {
      const answer = await ask.ask(`Scope ${SCOPES.join('|')} [user]: `);
      scope = answer === '' ? 'user' : answer;
      if (!SCOPES.includes(scope)) throw new Error(`scope must be one of ${SCOPES.join(', ')}`);
    }
    scope ??= 'user';

    let projects = [];
    if (scope !== 'user') {
      let folders = options.project;
      if (folders === undefined && asking) {
        const answer = await ask.ask(`Project folders, comma-separated [${cwd}]: `);
        if (answer !== '') folders = splitList(answer);
      }
      projects = (folders ?? [cwd]).map((folder) => projectFolder(folder, cwd));
    }
    return { chosen, blocked, statuses, scope, projects };
  } finally {
    ask?.close();
  }
}

function printPlan(stdout, root, { chosen, blocked, statuses, scope, projects }) {
  stdout.write(`exo install plan (from ${root})\n`);
  for (const adapter of chosen) stdout.write(`  ${adapter.label}: ${scope}${projects.length > 0 ? ` in ${projects.join(', ')}` : ''}\n`);
  for (const adapter of blocked.filter((entry) => !chosen.includes(entry))) {
    stdout.write(`  ${adapter.label}: not installable (${statuses.get(adapter.name).reason ?? 'unknown reason'})\n`);
  }
}

function pullClone(root) {
  const pulled = spawnSync('git', ['-C', root, 'pull', '--ff-only'], { encoding: 'utf8' });
  if (pulled.error) throw new Error(`git pull failed: ${pulled.error.message}`);
  if (pulled.status !== 0) throw new Error(`git pull --ff-only failed in ${root}: ${pulled.stderr.trim()}`);
  return pulled.stdout.trim();
}

// Returns the exit code. `context` lets a test inject the adapter list, the
// streams, the environment and the clone root; `restartAfterPull` makes --update
// finish in a new process, so the pulled adapters are the ones that run.
export async function run(argv, context = {}) {
  const {
    root = ROOT,
    env = process.env,
    cwd = process.cwd(),
    adapters = registered,
    input = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr
  } = context;
  const interactive = context.interactive ?? Boolean(input.isTTY);
  const options = parse(argv);
  if (options.update || options.remove) {
    const verb = options.update ? 'update' : 'remove';
    const selected = pickAdapters(options.harness, adapters);
    // A filter names a project that may be gone, so it is resolved but not checked.
    const projects = options.project?.map((folder) => path.resolve(cwd, folder)) ?? [undefined];
    if (options.update && !options.pulled) {
      stdout.write(`${pullClone(root)}\n`);
      // This process imported the adapters before the pull, so the pulled sources
      // would be written by the old rules; a fresh process imports the new ones.
      // Only the command line asks for the restart; a caller of run() keeps its own adapters.
      if (context.restartAfterPull) {
        const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...argv, '--pulled'], { stdio: 'inherit' });
        if (child.error) throw new Error(`update after the pull failed to start: ${child.error.message}`);
        return child.status ?? 1;
      }
    }
    const jobs = selected.flatMap((adapter) => projects.map((project) => ({
      adapter,
      target: project,
      call: () => adapter[verb]({ root, env, ...(options.scope === undefined ? {} : { scope: options.scope }), ...(project === undefined ? {} : { project }) })
    })));
    return runAll(jobs, stdout, stderr);
  }

  const choice = await chooseInstall(options, adapters, { env, cwd, input, stdout, interactive });
  printPlan(stdout, root, choice);
  const targets = choice.scope === 'user' ? [undefined] : choice.projects;
  const jobs = choice.chosen.flatMap((adapter) => targets.map((project) => ({
    adapter,
    target: project,
    call: () => adapter.install({ root, env, scope: choice.scope, project })
  })));
  return runAll(jobs, stdout, stderr);
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2), { restartAfterPull: true });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
