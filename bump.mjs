// Raise the plugin version in every manifest that carries it, and turn the
// changelog's Unreleased heading into the new version's heading.
//
//   node bump.mjs [auto|patch|minor|major]
//
// `auto`, the default, reads the level off the Unreleased sections, so a
// release follows the changelog policy. Rewrites the version field in place
// rather than reserialising the JSON, so key order and formatting survive.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { releaseLevel, sectionBody, UNRELEASED_HEADING } from './verify/changelog.mjs';

const MANIFESTS = ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'];
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';
const CHANGELOG = 'CHANGELOG.md';
const ARCHIVE = 'CHANGELOG-archive.md';
const KEPT_VERSIONS = 10;
const VERSION_HEADING = /^## (\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}$/gm;
const UNRELEASED_LINE = new RegExp(`^${UNRELEASED_HEADING}$`, 'm');
const RELEASES = ['auto', 'patch', 'minor', 'major'];

function raise(version, release) {
  const [major, minor, patch] = version.split('.').map(Number);
  if ([major, minor, patch].some((field) => !Number.isInteger(field))) {
    throw new Error(`${version} is not a three-field version`);
  }
  if (release === 'major') return `${major + 1}.0.0`;
  if (release === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const requested = process.argv[2] ?? 'auto';
if (!RELEASES.includes(requested)) {
  console.error(`unknown release ${requested}; expected one of ${RELEASES.join(', ')}`);
  process.exit(1);
}

const root = import.meta.dirname;
const current = JSON.parse(fs.readFileSync(path.join(root, PLUGIN_MANIFEST), 'utf8')).version;

const changelog = fs.readFileSync(path.join(root, CHANGELOG), 'utf8');
const unreleased = sectionBody(changelog, UNRELEASED_HEADING);
if (unreleased === null) {
  console.error(`${CHANGELOG} has no "${UNRELEASED_HEADING}" heading; add it above the latest release and rerun`);
  process.exit(1);
}
if (unreleased === '') {
  console.error(`${CHANGELOG} holds no entry under "${UNRELEASED_HEADING}": nothing to release`);
  process.exit(1);
}

const release = requested === 'auto' ? releaseLevel(unreleased, current) : requested;
const next = raise(current, release);
const versionField = new RegExp(`("version":\\s*")${current.replace(/\./g, '\\.')}(")`, 'g');

// Every file is rewritten or none is: a partial bump leaves the manifests and
// the changelog further apart than the state it was meant to repair.
const rewritten = [];
for (const manifest of MANIFESTS) {
  const before = fs.readFileSync(path.join(root, manifest), 'utf8');
  const after = before.replace(versionField, `$1${next}$2`);
  if (after === before) {
    console.error(`${manifest} carries no version ${current}; align the manifests by hand and rerun`);
    process.exit(1);
  }
  rewritten.push({ file: manifest, after });
}

function archiveOlder(text) {
  const headings = [...text.matchAll(VERSION_HEADING)];
  if (headings.length <= KEPT_VERSIONS) return { changelog: text, archive: null };
  const cut = headings[KEPT_VERSIONS].index;
  const oldestKept = headings[KEPT_VERSIONS - 1][1];
  const moved = text.slice(cut).trimEnd();
  const archivePath = path.join(root, ARCHIVE);
  const base = fs.existsSync(archivePath)
    ? fs.readFileSync(archivePath, 'utf8')
    : `# Changelog archive\n\nReleases before ${oldestKept}; newer ones are in [CHANGELOG.md](${CHANGELOG}).\n`;
  const relabelled = base.replace(/^(Releases before )\S+?(;)/m, `$1${oldestKept}$2`);
  const first = relabelled.search(new RegExp(VERSION_HEADING.source, 'm'));
  const archive = first === -1
    ? `${relabelled.trimEnd()}\n\n${moved}\n`
    : `${relabelled.slice(0, first)}${moved}\n\n${relabelled.slice(first)}`;
  return {
    changelog: `${text.slice(0, cut).trimEnd()}\n`.replace(/^(Versions before )\S+( are in)/m, `$1${oldestKept}$2`),
    archive,
  };
}

// UTC, so the heading does not depend on the machine's time zone.
const today = new Date().toISOString().slice(0, 10);
const dated = changelog.replace(UNRELEASED_LINE, `${UNRELEASED_HEADING}\n\n## ${next} - ${today}`);
const archived = archiveOlder(dated);
rewritten.push({ file: CHANGELOG, after: archived.changelog });
if (archived.archive !== null) rewritten.push({ file: ARCHIVE, after: archived.archive });

for (const { file, after } of rewritten) {
  fs.writeFileSync(path.join(root, file), after);
}

const files = rewritten.map(({ file }) => file);
console.log(`${current} -> ${next} (${release}) in ${files.join(', ')}`);
