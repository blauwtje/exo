// Print the GitHub Release body for one version from its CHANGELOG.md section:
// the highlights first, then the change sections in a fixed order under release
// headings. Each bullet ends with its source: the pull request that brought the
// line in, else the branch merged with it, else its commit linked on GitHub.
// A link to the full diff against the previous tag closes the body.
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
const SQUASH_SUBJECT = /\(#(\d+)\)$/;
const PULL_REQUEST_MERGE = /^Merge pull request #(\d+) from /;
const BRANCH_MERGE = /^Merge branch '([^']+)'/;
const root = import.meta.dirname;
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] ?? plugin.version;

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const heading = releaseHeading(changelog, version);
if (heading === undefined) {
  console.error(`CHANGELOG.md has no "## ${version} - <date>" section; run npm run bump first`);
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function succeeds(args) {
  try {
    git(args);
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
const reference = succeeds(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]) ? tag : 'HEAD';
const previous = previousTag(reference);
const range = previous === undefined ? reference : `${previous}..${reference}`;
const repositoryUrl = String(packageJson.repository).replace(/\.git$/, '');

function firstParentLine() {
  try {
    return new Set(git(['rev-list', '--first-parent', range]).split('\n'));
  } catch {
    return new Set();
  }
}
const mainLine = firstParentLine();

/** The merges in the range that brought `sha` in through a side parent, those on the first-parent line of the reference first. */
function mergesBringing(sha) {
  const merges = [];
  for (const line of git(['log', '--merges', '--ancestry-path', '--format=%H%x09%P%x09%s', `${sha}..${reference}`]).split('\n')) {
    if (line === '') continue;
    const [hash, parents, subject] = line.split('\t');
    const firstParent = parents.split(' ')[0];
    if (!succeeds(['merge-base', '--is-ancestor', sha, firstParent])) merges.push({ hash, subject });
  }
  return merges.filter((merge) => mainLine.has(merge.hash)).concat(merges.filter((merge) => !mainLine.has(merge.hash)));
}

/** Where a changelog line came from: a pull request, a merged branch or its commit, or undefined without history. */
function source(line) {
  let added;
  try {
    added = git(['log', '--reverse', '--format=%H%x09%h%x09%s', `-S${line}`, range, '--', 'CHANGELOG.md']).split('\n')[0];
  } catch {
    return undefined;
  }
  if (!added) return undefined;
  const [sha, short, subject] = added.split('\t');
  const squash = subject.match(SQUASH_SUBJECT);
  if (squash) return `#${squash[1]}`;
  const merges = mergesBringing(sha);
  for (const merge of merges) {
    const match = merge.subject.match(PULL_REQUEST_MERGE);
    if (match) return `#${match[1]}`;
  }
  for (const merge of merges) {
    const match = merge.subject.match(BRANCH_MERGE);
    if (match) return `branch \`${match[1]}\``;
  }
  return `[\`${short}\`](${repositoryUrl}/commit/${sha})`;
}

function attributed(text) {
  return text.split('\n').map((line) => {
    if (!line.startsWith('- ')) return line;
    const origin = source(line.trimEnd());
    return origin === undefined ? line : `${line.trimEnd()} (${origin})`;
  }).join('\n');
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
  return `## ${title}\n\n${attributed(subsections.get(name))}`;
});
if (subsections.size === 0) parts.push(attributed(body));

if (previous !== undefined) {
  parts.push(`Full diff: [${previous}...${tag}](${repositoryUrl}/compare/${previous}...${tag})`);
}

console.log(parts.join('\n\n'));
