import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { environmentMs } from '../../lib/script-flags.mjs';
import { BYTES_PER_TOKEN, PRINCIPLE_PAGE_TOKENS, PRINCIPLE_INDEX_TOKENS } from '../budgets.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function datedFindings(file, text, { now, staleMs }) {
  const match = text.match(/^Checked: (\d{4}-\d{2}-\d{2})$/m);
  const checked = match ? Date.parse(`${match[1]}T00:00:00Z`) : NaN;
  if (Number.isNaN(checked) || new Date(checked).toISOString().slice(0, 10) !== match[1]) return [['FAIL', `${file}: no valid \`Checked: YYYY-MM-DD\` line`]];
  if (checked > now) return [['FAIL', `${file}: Checked date ${match[1]} is in the future`]];
  if (now - checked > staleMs) return [['WARN', `${file}: Checked ${match[1]} is older than ${Math.round(staleMs / DAY_MS)} days; refresh the sources`]];
  return [];
}

const ANCHOR_MIN = 2;

// A backticked span is a path cite when its leading name run is a repository root entry.
function isPathCite(span, repository) {
  const lead = /^[\w.-]+/.exec(span);
  return lead !== null && fs.readdirSync(repository.join('.')).includes(lead[0]);
}

// Each segment must equal an entry of its parent directory, so a case-insensitive
// filesystem accepts nothing a case-sensitive one would refuse; "", "." and ".." fail.
function pathExists(span, repository) {
  const segments = (span.endsWith('/') ? span.slice(0, -1) : span).split('/');
  let current = '.';
  for (const [index, segment] of segments.entries()) {
    if (segment === '' || segment === '.' || segment === '..') return false;
    if (!fs.readdirSync(repository.join(current)).includes(segment)) return false;
    current = current === '.' ? segment : `${current}/${segment}`;
    if (index < segments.length - 1 && !fs.statSync(repository.join(current)).isDirectory()) return false;
  }
  return !span.endsWith('/') || fs.statSync(repository.join(current)).isDirectory();
}

function citeProblem(span, anchor, repository) {
  if (!pathExists(span, repository)) return `cites \`${span}\`, the span is not an existing path; cite the file alone and put the anchor in its own backticked span`;
  if (anchor === undefined || span.endsWith('/')) return null;
  if (fs.statSync(repository.join(span)).isDirectory()) return `cites ${span} with anchor ${anchor} but it is a folder; end it with / and drop the anchor`;
  if ((anchor.match(/\w/g) ?? []).length < ANCHOR_MIN) return `cites ${span} with anchor ${anchor} under ${ANCHOR_MIN} identifier characters`;
  return fs.readFileSync(repository.join(span), 'utf8').includes(anchor) ? null : `cites ${span} but anchor ${anchor} is gone`;
}

function lineCiteProblems(name, line, repository) {
  if (!line.includes('exo:')) return [];
  const text = line.slice(line.indexOf('exo:'));
  const problems = [];
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    if (!isPathCite(match[1], repository)) continue;
    const next = /^ `([^`]+)`/.exec(text.slice(match.index + match[0].length));
    const anchor = next && !isPathCite(next[1], repository) ? next[1] : undefined;
    const problem = citeProblem(match[1], anchor, repository);
    if (problem) problems.push(`${name} ${problem}`);
  }
  return problems;
}

function pageProblems({ name, text, isIndex, pages, repository }) {
  const problems = [];
  const tokens = Math.round(Buffer.byteLength(text, 'utf8') / BYTES_PER_TOKEN);
  const cap = isIndex ? PRINCIPLE_INDEX_TOKENS : PRINCIPLE_PAGE_TOKENS;
  if (tokens > cap) problems.push(`${name} is ${tokens} tokens, over ${cap}`);
  if (isIndex) {
    for (const page of pages) if (!text.includes(`(./${page})`)) problems.push(`${name} has no link to ${page}`);
    return problems;
  }
  const [body, sources] = text.split(/^## Sources$/m);
  if (sources === undefined || !/https?:\/\/\S+/.test(sources)) problems.push(`${name} has no URL under ## Sources`);
  for (const line of body.split('\n')) {
    if (line.startsWith('- ') && !line.includes('exo:')) problems.push(`${name} has a bullet without exo: ${line.slice(2, 50)}`);
    if (line.startsWith('- ')) problems.push(...lineCiteProblems(name, line, repository));
  }
  return problems;
}

export function checkPrinciples(report, repository) {
  const directory = repository.join('docs', 'principles');
  if (!fs.existsSync(directory)) return;
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.md')).sort();
  const pages = files.filter((file) => file !== 'README.md');
  const staleMs = environmentMs('EXO_PRINCIPLES_STALE_MS', 90 * DAY_MS);
  const now = Date.now();
  let clean = true;
  for (const file of files) {
    const text = fs.readFileSync(repository.join('docs', 'principles', file), 'utf8');
    const isIndex = file === 'README.md';
    const found = pageProblems({ name: file, text, isIndex, pages, repository }).map((detail) => ['FAIL', detail]);
    if (!isIndex) found.push(...datedFindings(file, text, { now, staleMs }));
    for (const [status, detail] of found) report.result(status, 'principles', detail);
    if (found.length) clean = false;
  }
  if (clean) report.result('PASS', 'principles', `${pages.length} pages are dated, sourced, mapped and within budget`);
}
