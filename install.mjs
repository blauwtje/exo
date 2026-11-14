
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
      pulled: { type: 'boolean' },
      recorded: { type: 'boolean' }
    }
  });
  checkOptions(values);
  const harness = values.harness === undefined ? undefined : splitList(values.harness);
  return { ...values, harness };
}

function checkOptions(values) {
  if (values.update && values.remove) throw new Error('--update and --remove cannot be combined');
  if (values.scope !== undefined && !SCOPES.includes(values.scope)) throw new Error(`--scope must be one of ${SCOPES.join(', ')}`);
  const mutating = !values.update && !values.remove;
  if (mutating && values.project !== undefined && values.scope === undefined) throw new Error('--project needs --scope project or local');
  if (mutating && values.project !== undefined && values.scope === 'user') throw new Error('--project does not apply to --scope user');
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

const installable = ({ adapters, statuses }) => adapters.filter((adapter) => statuses.get(adapter.name).installable);

const unavailable = ({ adapters, statuses }) => adapters.filter((adapter) => statuses.get(adapter.name).detected && !statuses.get(adapter.name).installable);

function requireInstallable(chosen, statuses) {
  for (const adapter of chosen) {
    const status = statuses.get(adapter.name);
    if (status.detected && !status.installable) throw new Error(`${adapter.label} is not installable: ${status.reason ?? 'unknown reason'}`);
  }
}

function requireSome(chosen, catalog) {
  if (chosen.length > 0) return chosen;
  const reasons = unavailable(catalog).map((adapter) => `${adapter.label}: ${catalog.statuses.get(adapter.name).reason ?? 'not installable'}`);
  throw new Error(`no harness to install into${reasons.length > 0 ? ` (${reasons.join('; ')})` : ''}`);
}

async function askHarnesses(ready, adapters, { ask, stdout }) {
  for (const adapter of ready) stdout.write(`  ${adapter.name}: ${adapter.label}\n`);
  const answer = await ask.ask(`Harnesses [${ready.map((adapter) => adapter.name).join(',')}]: `);
  if (answer === '') return ready;
  return pickAdapters(splitList(answer), ready.length > 0 ? ready : adapters);
}

async function chooseHarnesses(options, catalog, session) {
  if (options.harness !== undefined) {
    const chosen = pickAdapters(options.harness, catalog.adapters);
    requireInstallable(chosen, catalog.statuses);
    return chosen;
  }
  const ready = installable(catalog);
  return session.ask ? askHarnesses(ready, catalog.adapters, session) : ready;
}

async function chooseScope(options, { ask }) {
  if (options.scope !== undefined) return options.scope;
  if (!ask) return 'user';
  const answer = await ask.ask(`Scope ${SCOPES.join('|')} [user]: `);
  const scope = answer === '' ? 'user' : answer;
  if (!SCOPES.includes(scope)) throw new Error(`scope must be one of ${SCOPES.join(', ')}`);
  return scope;
}

async function askFolders({ ask, cwd }) {
  if (!ask) return undefined;
  const answer = await ask.ask(`Project folders, comma-separated [${cwd}]: `);
  return answer === '' ? undefined : splitList(answer);
}

async function chooseProjects(options, scope, session) {
  if (scope === 'user') return [];
  const folders = options.project ?? await askFolders(session);
  return (folders ?? [session.cwd]).map((folder) => projectFolder(folder, session.cwd));
}

async function chooseInstall(options, adapters, { env, cwd, input, stdout, interactive }) {
  const statuses = new Map();
  for (const adapter of adapters) statuses.set(adapter.name, await adapter.detect(env));
  const catalog = { adapters, statuses };
  const ask = interactive && !options.yes ? prompter(input, stdout) : undefined;
  const session = { ask, stdout, cwd };
  try {
    const chosen = requireSome(await chooseHarnesses(options, catalog, session), catalog);
    const scope = await chooseScope(options, session);
    const projects = await chooseProjects(options, scope, session);
    return { chosen, blocked: unavailable(catalog), statuses, scope, projects };
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

function pullThenRestart(argv, { root, stdout, restartAfterPull }) {
  stdout.write(`${pullClone(root)}\n`);
  if (!restartAfterPull) return undefined;
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...argv, '--pulled'], { stdio: 'inherit' });
  if (child.error) throw new Error(`update after the pull failed to start: ${child.error.message}`);
  return child.status ?? 1;
}

async function maintain(options, settings, argv) {
  const { root, env, cwd, adapters, stdout, stderr } = settings;
  const verb = options.update ? 'update' : 'remove';
  const selected = pickAdapters(options.harness, adapters);
  const projects = options.project?.map((folder) => path.resolve(cwd, folder)) ?? [undefined];
  if (options.update && !options.pulled) {
    const code = pullThenRestart(argv, settings);
    if (code !== undefined) return code;
  }
  const jobs = selected.flatMap((adapter) => projects.map((project) => ({
    adapter,
    target: project,
    call: () => adapter[verb]({ root, env, ...(options.scope === undefined ? {} : { scope: options.scope }), ...(project === undefined ? {} : { project }) })
  })));
  return runAll(jobs, stdout, stderr);
}

async function install(options, settings) {
  const { root, env, cwd, adapters, input, stdout, stderr, interactive } = settings;
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

async function listRecorded({ adapters, env, stdout }) {
  for (const adapter of adapters) if (await adapter.recorded(env) > 0) stdout.write(`${adapter.label}\n`);
  return 0;
}

export async function run(argv, context = {}) {
  const input = context.input ?? process.stdin;
  const settings = {
    root: ROOT,
    env: process.env,
    cwd: process.cwd(),
    adapters: registered,
    stdout: process.stdout,
    stderr: process.stderr,
    ...context,
    input,
    interactive: context.interactive ?? Boolean(input.isTTY)
  };
  const options = parse(argv);
  if (options.recorded) return listRecorded(settings);
  if (options.update || options.remove) return maintain(options, settings, argv);
  return install(options, settings);
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2), { restartAfterPull: true });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
