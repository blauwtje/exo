// Raise the plugin version in every manifest that carries it.
//
//   node bump.mjs [patch|minor|major]
//
// Rewrites the version field in place rather than reserialising the JSON, so
// key order and formatting survive the bump.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MANIFESTS = ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'];
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';
const RELEASES = ['patch', 'minor', 'major'];

function raise(version, release) {
  const [major, minor, patch] = version.split('.').map(Number);
  if ([major, minor, patch].some((field) => !Number.isInteger(field))) {
    throw new Error(`${version} is not a three-field version`);
  }
  if (release === 'major') return `${major + 1}.0.0`;
  if (release === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const release = process.argv[2] ?? 'patch';
if (!RELEASES.includes(release)) {
  console.error(`unknown release ${release}; expected one of ${RELEASES.join(', ')}`);
  process.exit(1);
}

const root = import.meta.dirname;
const current = JSON.parse(fs.readFileSync(path.join(root, PLUGIN_MANIFEST), 'utf8')).version;
const next = raise(current, release);
const versionField = new RegExp(`("version":\\s*")${current.replace(/\./g, '\\.')}(")`, 'g');

// Every manifest is rewritten or none is: a partial bump leaves the three
// further apart than the state it was meant to repair.
const rewritten = [];
for (const manifest of MANIFESTS) {
  const before = fs.readFileSync(path.join(root, manifest), 'utf8');
  const after = before.replace(versionField, `$1${next}$2`);
  if (after === before) {
    console.error(`${manifest} carries no version ${current}; align the manifests by hand and rerun`);
    process.exit(1);
  }
  rewritten.push({ manifest, after });
}

for (const { manifest, after } of rewritten) {
  fs.writeFileSync(path.join(root, manifest), after);
}

console.log(`${current} -> ${next} in ${MANIFESTS.join(', ')}`);
