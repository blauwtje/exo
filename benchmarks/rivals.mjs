// benchmarks/rivals.mjs
// Fetches each rival plugin at a pinned tag into
// benchmarks/fixtures/rivals/<name>@<version>/ (gitignored) so a cell can
// point --plugin-dir at it. Nothing is installed into ~/.claude.
// `node benchmarks/rivals.mjs` fetches every rival and prints name, version,
// commit and plugin directory; a second run reuses the fetched copies.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RIVALS_ROOT = path.join(HERE, 'fixtures', 'rivals');

// The git-ignored file that names the local-only rivals, keyed by arm name.
export const LOCAL_FILE = path.join(HERE, 'fixtures', 'rivals.local.json');
const LOCAL_FILE_SHOWN = 'benchmarks/fixtures/rivals.local.json';
const LOCAL_KEYS = ['repository', 'ref', 'commit', 'root', 'promptSuffix'];

// root: the plugin root inside the repository ('.' when the repository is the
// plugin). needs: files that must exist there for the plugin to load; the
// cc-safety-net tag commits its built dist/, which its hook command runs.
const PINNED = {
  'cc-safety-net': {
    repository: 'https://github.com/kenryu42/cc-safety-net',
    ref: 'v2.5.2',
    root: '.',
    needs: ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'dist/bin/cc-safety-net.js'],
  },
};

// skills-rival is a skills-only rival plugin, forced by naming its skill. Its
// name stays out of tracked files, so LOCAL_FILE holds its repository, ref,
// commit, root and the promptSuffix that names the skill; only needs is here.
const LOCAL = {
  'skills-rival': { needs: ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/run-hook.cmd'] },
};

function readLocalFile() {
  if (!fs.existsSync(LOCAL_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`${LOCAL_FILE_SHOWN} is not valid JSON: ${error.message}`);
  }
}

// RIVALS holds every rival ready to fetch; MISSING_RIVALS maps a local-only
// rival whose entry is absent or incomplete to the message saying what to add.
export const RIVALS = { ...PINNED };
export const MISSING_RIVALS = {};
const localEntries = readLocalFile();
for (const [name, rival] of Object.entries(LOCAL)) {
  const entry = localEntries[name] ?? {};
  const absent = LOCAL_KEYS.filter((key) => typeof entry[key] !== 'string' || entry[key] === '');
  if (absent.length === 0) {
    RIVALS[name] = { ...rival, ...Object.fromEntries(LOCAL_KEYS.map((key) => [key, entry[key]])) };
  } else {
    MISSING_RIVALS[name] = `${LOCAL_FILE_SHOWN} needs "${name}": { ${LOCAL_KEYS.map((key) => `"${key}"`).join(', ')} } as strings; absent: ${absent.join(', ')}`;
  }
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function missingFiles(pluginDirectory, rival) {
  return rival.needs.filter((file) => !fs.existsSync(path.join(pluginDirectory, file)));
}

// Returns { name, version, commit, directory } where directory is the plugin
// root to pass to --plugin-dir.
export function fetchRival(name) {
  if (MISSING_RIVALS[name]) throw new Error(`rival ${name}: ${MISSING_RIVALS[name]}`);
  const rival = RIVALS[name];
  if (!rival) throw new Error(`unknown rival ${name}; known: ${[...Object.keys(RIVALS), ...Object.keys(MISSING_RIVALS)].join(', ')}`);
  const version = rival.ref.replace(/^v/, '');
  const checkout = path.join(RIVALS_ROOT, `${name}@${version}`);
  const directory = path.join(checkout, rival.root);
  if (!fs.existsSync(checkout)) {
    fs.mkdirSync(RIVALS_ROOT, { recursive: true });
    // Clone beside the target and rename, so an interrupted fetch leaves no half checkout.
    const partial = `${checkout}.partial`;
    fs.rmSync(partial, { recursive: true, force: true });
    git('clone', '--quiet', '--depth', '1', '--branch', rival.ref, rival.repository, partial);
    fs.renameSync(partial, checkout);
  }
  const missing = missingFiles(directory, rival);
  if (missing.length > 0) throw new Error(`${name}@${rival.ref} lacks ${missing.join(', ')} under ${directory}`);
  const commit = git('-C', checkout, 'rev-parse', 'HEAD');
  // A local entry pins the commit too, so a moved tag fails instead of drifting.
  if (rival.commit && commit !== rival.commit) throw new Error(`${name}@${rival.ref} is at ${commit}, but ${LOCAL_FILE_SHOWN} pins ${rival.commit}`);
  return { name, version: rival.ref, commit, directory };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of Object.keys(RIVALS)) {
    const fetched = fetchRival(name);
    console.log(`${fetched.name}@${fetched.version} ${fetched.commit} ${fetched.directory}`);
  }
  for (const [name, message] of Object.entries(MISSING_RIVALS)) console.error(`rival ${name}: ${message}`);
  if (Object.keys(MISSING_RIVALS).length > 0) process.exit(1);
}
