// Print the GitHub Release body for one version from its CHANGELOG.md section:
// the highlights first, the change sections in a fixed order under release
// headings, the pull requests merged since the previous tag, the commands that
// upgrade an installed copy, then a compare link to the previous tag.
//
//   node release-notes.mjs [version]     defaults to the version in plugin.json

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { releaseHeading, sectionBody } from './verify/changelog.mjs';

const ORDER = ['Highlights', 'Added', 'Changed', 'Fixed', 'Removed'];
const TITLES = new Map([
  ['Highlights', 'Highlights'],
  ['Added', 'New'],
  ['Changed', 'Improved'],
  ['Fixed', 'Fixed'],
  ['Removed', 'Removed']
]);
const PULL_REQUEST_SUFFIX = /^(?:[a-z]+(?:\([^)]*\))?!?: )?(.*) \(#(\d+)\)$/;
const root = import.meta.dirname;
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'));
const version = process.argv[2] ?? plugin.version;

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const heading = releaseHeading(changelog, version);
if (heading === undefined) {
  console.error(`CHANGELOG.md has no "## ${version} - <date>" section; run npm run bump first`);
  process.exit(1);
}

const body = sectionBody(changelog, heading);
const subsections = new Map();
for (const block of body.split(/^(?=### )/m)) {
  const match = block.match(/^### (.+)\n([\s\S]*)$/);
  if (match) subsections.set(match[1].trim(), match[2].trim());
}

const known = ORDER.filter((name) => subsections.has(name));
const unknown = [...subsections.keys()].filter((name) => !ORDER.includes(name));
const parts = [...known, ...unknown].map((name) => {
  const title = TITLES.get(name) ?? name;
  return `## ${title}\n\n${subsections.get(name)}`;
});
if (subsections.size === 0) parts.push(body);

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tagExists(tag) {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function previousTag(reference) {
  try {
    return git(['describe', '--tags', '--abbrev=0', '--match', 'v*', `${reference}^`]);
  } catch {
    return undefined;
  }
}

// Before the release is tagged, the notes cover the commits up to HEAD.
const tag = `v${version}`;
const reference = tagExists(tag) ? tag : 'HEAD';
const previous = previousTag(reference);
const range = previous === undefined ? reference : `${previous}..${reference}`;
const repositoryUrl = String(packageJson.repository).replace(/\.git$/, '');

const pullRequests = [];
for (const subject of git(['log', '--format=%s', range]).split('\n')) {
  const match = subject.match(PULL_REQUEST_SUFFIX);
  if (match) pullRequests.push(`- #${match[2]} ${match[1]}`);
}
const pullRequestLines = pullRequests.length > 0
  ? pullRequests.join('\n')
  : 'No pull requests: every change went straight to `main`.';
parts.push(`## Pull requests\n\n${pullRequestLines}`);

const pluginId = `${plugin.name}@${marketplace.name}`;
parts.push([
  '## Upgrade',
  '',
  '```text',
  `claude plugin marketplace update ${marketplace.name}`,
  `claude plugin update ${pluginId}`,
  '```',
  '',
  'Restart the session to load the new version.'
].join('\n'));

if (previous !== undefined) {
  parts.push(`Every commit since ${previous}: ${repositoryUrl}/compare/${previous}...${tag}`);
}

console.log(parts.join('\n\n'));
