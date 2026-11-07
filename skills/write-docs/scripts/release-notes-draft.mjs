import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gitText } from '#git';

const SECTIONS = ['Added', 'Changed', 'Fixed', 'Removed'];
const SECTION_OF_TYPE = new Map([['feat', 'Added'], ['fix', 'Fixed'], ['perf', 'Changed'], ['revert', 'Removed']]);
const SUBJECT = /^([a-z]+)(?:\(([^()]+)\))?(!)?: (.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: ([\s\S]+?)(?=\n\n|\n[A-Za-z-]+: |$)/m;
const REMOVAL = /^(remove|drop|delete)\b/i;
const PULL_NUMBER = /\(#(\d+)\)/g;
const HASH_CORE = '(?=[0-9a-f]*\\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}';
const HASH = new RegExp(`\\s*\\(${HASH_CORE}\\)|\\b${HASH_CORE}\\b`, 'g');
const RECORD = '\x1e';
const FIELD = '\x1f';

export function lastReleaseTag(repo, to) {
  try {
    return gitText(repo, ['describe', '--tags', '--abbrev=0', '--match', 'v*', to]);
  } catch {
    return null;
  }
}

export function resolveRange(repo, { from, to = 'HEAD' }) {
  const start = from ?? lastReleaseTag(repo, to);
  return { from: start, to, spec: start === null ? to : `${start}..${to}` };
}

export function stripReferences(text) {
  return text.replace(PULL_NUMBER, '').replace(HASH, '').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

function sentence(text) {
  const clean = stripReferences(text);
  const capitalised = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

function sectionOf(type, description) {
  if (type === 'feat' && REMOVAL.test(description)) return 'Removed';
  return SECTION_OF_TYPE.get(type) ?? null;
}

export function parseEntry({ subject, body = '', files = [] }) {
  const match = SUBJECT.exec(subject);
  if (match === null) return null;
  const [, type, , bang, description] = match;
  const footer = BREAKING_FOOTER.exec(body);
  const breaking = bang === '!' || footer !== null;
  const section = sectionOf(type, description);
  if (section === null && !breaking) return null;
  return {
    text: sentence(description),
    section: section ?? 'Changed',
    breaking,
    upgrade: footer === null ? null : sentence(footer[1]),
    pulls: [...subject.matchAll(PULL_NUMBER)].map((pull) => Number(pull[1])),
    files
  };
}

export function readCommits(repo, spec) {
  const log = gitText(repo, ['log', '--no-merges', '--name-only', `--format=${RECORD}%s${FIELD}%b${FIELD}`, spec]);
  return log
    .split(RECORD)
    .filter((record) => record !== '')
    .map((record) => {
      const [subject, body, files] = record.split(FIELD);
      return { subject, body, files: files.split('\n').filter((file) => file !== '') };
    });
}

function commitDate(repo, ref) {
  return ref === null ? null : gitText(repo, ['log', '-1', '--format=%cI', ref]);
}

function loadPulls(repo, file) {
  if (file !== undefined) return JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const raw = execFileSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,title,mergedAt'], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function inWindow(pull, window) {
  if (pull.mergedAt === undefined) return true;
  return (window.since === null || pull.mergedAt > window.since) && pull.mergedAt <= window.until;
}

export function pullEntries(pulls, entries, window) {
  const seenNumbers = new Set(entries.flatMap((entry) => entry.pulls));
  const seenTexts = new Set(entries.map((entry) => entry.text.toLowerCase()));
  return pulls
    .filter((pull) => inWindow(pull, window) && !seenNumbers.has(pull.number))
    .map((pull) => parseEntry({ subject: pull.title }))
    .filter((entry) => entry !== null && !seenTexts.has(entry.text.toLowerCase()));
}

function bullets(entries) {
  return entries.map((entry) => `- ${entry.text}`);
}

function breakingBullets(entries) {
  return entries.flatMap((entry) => [`- ${entry.text}`, `  Upgrade: ${entry.upgrade ?? 'not stated in the commit.'}`]);
}

export function renderNotes(entries) {
  const breaking = entries.filter((entry) => entry.breaking);
  const blocks = [];
  if (breaking.length > 0) blocks.push(['### Breaking changes', '', ...breakingBullets(breaking)]);
  for (const section of SECTIONS) {
    const inSection = entries.filter((entry) => !entry.breaking && entry.section === section);
    if (inSection.length > 0) blocks.push([`### ${section}`, '', ...bullets(inSection)]);
  }
  return blocks.map((block) => block.join('\n')).join('\n\n');
}

export function draftNotes(repo, options = {}) {
  const range = resolveRange(repo, options);
  const commits = readCommits(repo, range.spec);
  const picked = options.uncovered ? commits.filter((commit) => !commit.files.includes('CHANGELOG.md')) : commits;
  const entries = picked.map(parseEntry).filter((entry) => entry !== null);
  if (!options.uncovered) {
    const window = { since: commitDate(repo, range.from), until: commitDate(repo, range.to) };
    entries.push(...pullEntries(loadPulls(repo, options.prs), entries, window));
  }
  const rendered = renderNotes(entries);
  return rendered === '' ? `No user-facing commits in ${range.spec}.` : rendered;
}

function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: process.cwd() },
      from: { type: 'string' },
      to: { type: 'string' },
      prs: { type: 'string' },
      uncovered: { type: 'boolean', default: false }
    }
  });
  try {
    console.log(draftNotes(values.repo, values));
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message);
    process.exit(1);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
