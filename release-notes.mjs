// Print the GitHub Release body for one version from its CHANGELOG.md section:
// the highlights first, the change sections in a fixed order, then the
// commands that upgrade an installed copy.
//
//   node release-notes.mjs [version]     defaults to the version in plugin.json

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sectionBody } from './verify/changelog.mjs';

const ORDER = ['Highlights', 'Added', 'Changed', 'Fixed', 'Removed'];
const root = import.meta.dirname;
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'));
const version = process.argv[2] ?? plugin.version;

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## ${version} - `));
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
  const level = name === 'Highlights' ? '##' : '###';
  return `${level} ${name}\n\n${subsections.get(name)}`;
});
if (subsections.size === 0) parts.push(body);

const pluginId = `${plugin.name}@${marketplace.name}`;
parts.push([
  '### Upgrade',
  '',
  '```text',
  `claude plugin marketplace update ${marketplace.name}`,
  `claude plugin update ${pluginId}`,
  '```',
  '',
  'Restart the session to load the new version.'
].join('\n'));

console.log(parts.join('\n\n'));
