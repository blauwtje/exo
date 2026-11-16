import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { parseArgs } from 'node:util';

const SECTIONS = ['Added', 'Changed', 'Fixed', 'Removed'];
const SECTION_OF_TYPE = { feat: 'Added', fix: 'Fixed', perf: 'Changed', revert: 'Removed' };
const SUBJECT = /^([a-z]+)(?:\([^()]+\))?(!)?: (.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: ([\s\S]+?)(?=\n\n|\n[A-Za-z-]+: |$)/m;
const RECORD = '\x1e';
const FIELD = '\x1f';

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

function sentence(text) {
  const clean = text.replace(/\s*\((?:#\d+|[0-9a-f]{7,40})\)/g, '').replace(/\s+/g, ' ').trim();
  const capital = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

function entryOf({ subject, body }) {
  const match = SUBJECT.exec(subject);
  if (match === null) return null;
  const [, type, bang, description] = match;
  const footer = BREAKING_FOOTER.exec(body);
  const breaking = bang === '!' || footer !== null;
  const section = SECTION_OF_TYPE[type];
  if (!section && !breaking) return null;
  return { text: sentence(description), section: section ?? 'Changed', breaking, upgrade: footer ? sentence(footer[1]) : 'not stated in the commit.' };
}

function draft(repo, { from, to = 'HEAD' }) {
  const start = from ?? spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*', to], { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const range = start ? `${start}..${to}` : to;
  const log = git(repo, ['log', '--no-merges', `--format=${RECORD}%s${FIELD}%b`, range]);
  const entries = log.split(RECORD).filter(Boolean).map((record) => {
    const [subject, body] = record.split(FIELD);
    return entryOf({ subject, body });
  }).filter(Boolean);
  const breaking = entries.filter((entry) => entry.breaking);
  const blocks = breaking.length > 0 ? [['### Breaking changes', '', ...breaking.flatMap((entry) => [`- ${entry.text}`, `  Upgrade: ${entry.upgrade}`])]] : [];
  for (const section of SECTIONS) {
    const inSection = entries.filter((entry) => !entry.breaking && entry.section === section);
    if (inSection.length > 0) blocks.push([`### ${section}`, '', ...inSection.map((entry) => `- ${entry.text}`)]);
  }
  return blocks.length === 0 ? `No user-facing commits in ${range}.` : blocks.map((block) => block.join('\n')).join('\n\n');
}

const { values } = parseArgs({ options: { repo: { type: 'string', default: process.cwd() }, from: { type: 'string' }, to: { type: 'string' } } });
try {
  console.log(draft(values.repo, values));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
