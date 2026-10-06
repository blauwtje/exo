// The Claude Code harness for install.mjs: installs exo through Claude Code's own
// plugin CLI, so Claude Code keeps the plugin copy and updates it. It runs
// `claude plugin marketplace add blauwtje/exo` and
// `claude plugin install exo@blauwtje -s <scope>`; `project` and `local` run in
// the project folder, where Claude Code writes its settings. Update and remove run
// `claude plugin update` and `claude plugin uninstall` with the same scope and
// folder. A non-zero exit aborts that call with the CLI's stderr.
//
// Each install (scope, project folder) goes to `${CLAUDE_CONFIG_DIR:-~/.claude}/exo/installed.json`
// as `{ version: 2, installs: [{ scope, project? }] }`, written only after the CLI
// succeeded; update and remove act only on what it lists. The record is read back
// as untrusted data and checked before any CLI call.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const name = 'claude';
export const label = 'Claude Code';

const SCOPES = ['user', 'project', 'local'];
const MARKETPLACE_SOURCE = 'blauwtje/exo';
const PLUGIN = 'exo@blauwtje';

const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function configDirectory(env) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  return path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'));
}

const recordFileOf = (env) => path.join(configDirectory(env), 'exo', 'installed.json');

const validInstall = (entry) => isPlain(entry)
  && SCOPES.includes(entry.scope)
  && (entry.scope === 'user' ? entry.project === undefined : typeof entry.project === 'string' && path.isAbsolute(entry.project));

function readInstalls(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const notRecord = new Error(`${file} is not an exo install record; fix or move it, nothing was run`);
  let record;
  try {
    record = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} does not parse (${error.message}); fix or move it, nothing was run`);
  }
  if (!isPlain(record) || !Array.isArray(record.installs) || !record.installs.every(validInstall)) throw notRecord;
  return record.installs;
}

function writeInstalls(file, installs) {
  if (installs.length === 0) {
    fs.rmSync(file, { force: true });
    try {
      fs.rmdirSync(path.dirname(file));
    } catch {
      // The folder holds other exo files; leave it.
    }
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.exo-${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ version: 2, installs }, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

const sameInstall = (left, right) => left.scope === right.scope && left.project === right.project;
const matches = (install, selector) => (selector.scope === undefined || install.scope === selector.scope)
  && (selector.project === undefined || install.project === selector.project);

// Runs `claude <args>` and throws with its stderr on a failure to start or a non-zero exit.
function claude(args, cwd, env) {
  // Windows ships claude as a .cmd file, which only a shell starts; the arguments are fixed text.
  const result = spawnSync('claude', args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' });
  const command = `claude ${args.join(' ')}`;
  if (result.error) throw new Error(`${command} did not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} exited ${result.status}${detail === '' ? '' : `: ${detail}`}`);
  }
}

function onPath(command, env) {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const folder of (env.PATH ?? '').split(path.delimiter)) {
    if (folder === '') continue;
    for (const extension of extensions) {
      if (fs.statSync(path.join(folder, `${command}${extension}`), { throwIfNoEntry: false })?.isFile()) return true;
    }
  }
  return false;
}

export function detect(env) {
  if (onPath('claude', env)) return { detected: true, installable: true };
  if (fs.existsSync(configDirectory(env))) {
    return { detected: true, installable: false, reason: '`claude` is not on PATH although the Claude Code folder exists' };
  }
  return { detected: false, installable: false, reason: '`claude` is not on PATH' };
}

export function install({ env, scope, project }) {
  if (!SCOPES.includes(scope)) throw new Error(`unknown scope ${scope}`);
  let folder;
  if (scope !== 'user') {
    if (project === undefined) throw new Error(`Claude Code ${scope} scope needs a project folder`);
    folder = path.resolve(project);
    if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`project folder ${folder} does not exist`);
  }
  const file = recordFileOf(env);
  const installs = readInstalls(file);
  claude(['plugin', 'marketplace', 'add', MARKETPLACE_SOURCE], folder, env);
  claude(['plugin', 'install', PLUGIN, '-s', scope], folder, env);
  const entry = folder === undefined ? { scope } : { scope, project: folder };
  writeInstalls(file, [...installs.filter((existing) => !sameInstall(existing, entry)), entry]);
  return `installed exo into Claude Code at ${scope} scope${folder === undefined ? '' : ` for ${folder}`}`;
}

// Runs `claude plugin <verb>` for each recorded install the selector matches; a
// failure leaves that record in place, and the rest still run before it throws.
function eachMatch(record, { action, verb, past, keep }) {
  const file = recordFileOf(record.env);
  const installs = readInstalls(file);
  const wanted = installs.filter((entry) => matches(entry, record));
  if (wanted.length === 0) return `nothing to ${action}: ${file} lists no matching install`;
  const done = [];
  const errors = [];
  for (const entry of wanted) {
    try {
      claude(['plugin', verb, PLUGIN, '-s', entry.scope], entry.project, record.env);
      done.push(entry);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (!keep) writeInstalls(file, installs.filter((entry) => !done.includes(entry)));
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return `${past} ${done.length} Claude Code install${done.length === 1 ? '' : 's'}`;
}

export function update(record) {
  return eachMatch(record, { action: 'update', verb: 'update', past: 'updated', keep: true });
}

export function remove(record) {
  return eachMatch(record, { action: 'remove', verb: 'uninstall', past: 'removed', keep: false });
}
