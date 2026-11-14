
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gitText } from './lib/git.mjs';
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

function succeeds(args) {
  try {
    gitText(root, args);
    return true;
  } catch {
    return false;
  }
}

function previousTag(reference) {
  try {
    return gitText(root, ['describe', '--tags', '--abbrev=0', '--match', 'v*', `${reference}^`]);
  } catch {
    return undefined;
  }
}

const tag = `v${version}`;
const reference = succeeds(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]) ? tag : 'HEAD';
const previous = previousTag(reference);
const range = previous === undefined ? reference : `${previous}..${reference}`;
const repositoryUrl = String(packageJson.repository).replace(/\.git$/, '');

function firstParentLine() {
  try {
    return new Set(gitText(root, ['rev-list', '--first-parent', range]).split('\n'));
  } catch {
    return new Set();
  }
}
const mainLine = firstParentLine();

function mergesBringing(sha) {
  const merges = [];
  for (const line of gitText(root, ['log', '--merges', '--ancestry-path', '--format=%H%x09%P%x09%s', `${sha}..${reference}`]).split('\n')) {
    if (line === '') continue;
    const [hash, parents, subject] = line.split('\t');
    const firstParent = parents.split(' ')[0];
    if (!succeeds(['merge-base', '--is-ancestor', sha, firstParent])) merges.push({ hash, subject });
  }
  return merges.filter((merge) => mainLine.has(merge.hash)).concat(merges.filter((merge) => !mainLine.has(merge.hash)));
}

function addingCommit(line) {
  try {
    return gitText(root, ['log', '--reverse', '--format=%H%x09%h%x09%s', `-S${line}`, range, '--', 'CHANGELOG.md']).split('\n')[0];
  } catch {
    return undefined;
  }
}

function mergeSource(sha) {
  const merges = mergesBringing(sha);
  const pull = merges.map((merge) => merge.subject.match(PULL_REQUEST_MERGE)).find(Boolean);
  if (pull) return `#${pull[1]}`;
  const branch = merges.map((merge) => merge.subject.match(BRANCH_MERGE)).find(Boolean);
  return branch ? `branch \`${branch[1]}\`` : undefined;
}

function source(line) {
  const added = addingCommit(line);
  if (!added) return undefined;
  const [sha, short, subject] = added.split('\t');
  const squash = subject.match(SQUASH_SUBJECT);
  if (squash) return `#${squash[1]}`;
  return mergeSource(sha) ?? `[\`${short}\`](${repositoryUrl}/commit/${sha})`;
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
