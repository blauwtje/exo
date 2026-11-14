
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { writeAtomic } from '../../lib/basics.mjs';
import { isPlain, readRecord, sameInstall, tryRmdir } from '../install-files.mjs';
import { onPath } from '../on-path.mjs';

export const name = 'claude';
export const label = 'Claude Code';

const SCOPES = ['user', 'project', 'local'];
const MARKETPLACE_SOURCE = 'blauwtje/exo';
const PLUGIN = 'exo@blauwtje';

function configDirectory(env) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  return path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'));
}

const recordFileOf = (env) => path.join(configDirectory(env), 'exo', 'installed.json');

const validInstall = (entry) => isPlain(entry)
  && SCOPES.includes(entry.scope)
  && (entry.scope === 'user' ? entry.project === undefined : typeof entry.project === 'string' && path.isAbsolute(entry.project));

function readInstalls(file) {
  const record = readRecord(file, 'run');
  if (record === undefined) return [];
  const notRecord = new Error(`${file} is not an exo install record; fix or move it, nothing was run`);
  if (!isPlain(record) || !Array.isArray(record.installs) || !record.installs.every(validInstall)) throw notRecord;
  return record.installs;
}

function writeInstalls(file, installs) {
  if (installs.length === 0) {
    fs.rmSync(file, { force: true });
    tryRmdir(path.dirname(file));
    return;
  }
  writeAtomic(file, `${JSON.stringify({ version: 2, installs }, null, 2)}\n`);
}

const matches = (install, selector) => (selector.scope === undefined || install.scope === selector.scope)
  && (selector.project === undefined || install.project === selector.project);

function claude(args, cwd, env) {
  const result = spawnSync('claude', args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' });
  const command = `claude ${args.join(' ')}`;
  if (result.error) throw new Error(`${command} did not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} exited ${result.status}${detail === '' ? '' : `: ${detail}`}`);
  }
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

export function recorded(env) {
  return readInstalls(recordFileOf(env)).length;
}

export function update(record) {
  return eachMatch(record, { action: 'update', verb: 'update', past: 'updated', keep: true });
}

export function remove(record) {
  return eachMatch(record, { action: 'remove', verb: 'uninstall', past: 'removed', keep: false });
}
