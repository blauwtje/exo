import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const RESULT_FILE = path.join('.exo', 'orchestrate', 'result.md');
const HEADER = /^\s*(?:#+|\*\*)?\s*phase\s*(\d+)/i;
const PHASE = /\bphase\s*(\d+)/i;
const VERDICT = /\b(DONE|BLOCKED)\b/g;
const CASE_MS = 10_000;
const TEST_MS = 30_000;

export const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const idPattern = (id) => new RegExp(`(?<![\\w-])${escaped(id)}(?![\\w-])`, 'i');

export function firstNamed(line, ids) {
  const hits = ids.map((id) => ({ id, at: line.search(idPattern(id)) })).filter((hit) => hit.at >= 0);
  hits.sort((left, right) => left.at - right.at);
  return hits[0]?.id ?? null;
}

export function ownedLines(text, ids) {
  const owned = Object.fromEntries(ids.map((id) => [id, []]));
  let header = null;
  for (const line of text.split('\n')) {
    const heading = line.match(HEADER);
    if (heading) {
      header = Number(heading[1]);
      for (const id of ids.filter((each) => idPattern(each).test(line))) owned[id].push({ line, phase: header });
      continue;
    }
    const id = firstNamed(line, ids);
    if (id === null) continue;
    const own = line.match(PHASE);
    owned[id].push({ line, phase: own ? Number(own[1]) : header });
  }
  return owned;
}

export function partPhase(lines) {
  const phases = lines.map((entry) => entry.phase).filter(Number.isInteger);
  return phases.length === 0 ? null : Math.min(...phases);
}

export function partVerdict(lines) {
  const verdicts = lines.flatMap((entry) => [...entry.line.matchAll(VERDICT)].map((match) => match[1]));
  return verdicts.at(-1) ?? null;
}

export function resultFindings(text, { parts, together = [], after = [] }) {
  if (text === null) return [`no result file at ${RESULT_FILE}`];
  const ids = Object.keys(parts);
  const owned = ownedLines(text, ids);
  const findings = [];
  for (const [id, expected] of Object.entries(parts)) {
    const verdict = partVerdict(owned[id]);
    if (verdict !== expected) findings.push(`result file: ${id} verdict ${verdict ?? 'missing'}, expected ${expected}`);
  }
  const phase = (id) => partPhase(owned[id]);
  for (const group of together) {
    const phases = group.map(phase);
    if (phases.some((each) => each === null) || new Set(phases).size > 1) findings.push(`result file: ${group.join(' and ')} not in one phase (${phases.join(', ')})`);
  }
  for (const [later, earlier] of after) {
    if (!(phase(later) > phase(earlier))) findings.push(`result file: ${later} phase ${phase(later)} not after ${earlier} phase ${phase(earlier)}`);
  }
  return findings;
}

function readResult(repo) {
  const file = path.join(repo, RESULT_FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function testEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST')));
}

function npmTest(repo) {
  const run = spawnSync('npm', ['test', '--silent'], { cwd: repo, env: testEnvironment(), encoding: 'utf8', timeout: TEST_MS });
  if (run.status !== 0) throw new Error(`npm test exited ${run.status}`);
}

function withDeadline(work) {
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no result in ${CASE_MS} ms`)), CASE_MS); });
  return Promise.race([Promise.resolve().then(work), expired]).finally(() => clearTimeout(timer));
}

export async function grade({ cases, result }) {
  const repo = path.resolve(process.argv[2] ?? '.');
  const load = (file) => import(`${pathToFileURL(path.join(repo, file)).href}?t=${Date.now()}`);
  const all = [...cases, { name: 'npm test passes', run: () => npmTest(repo) }];
  const detail = [];
  for (const { name, run } of all) {
    try {
      await withDeadline(() => run({ repo, load }));
    } catch (error) {
      detail.push(`${name}: ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }
  const findings = resultFindings(readResult(repo), result);
  detail.push(...findings);
  const total = all.length + 1;
  const defects = detail.length - findings.length + (findings.length > 0 ? 1 : 0);
  process.stdout.write(`${JSON.stringify({ pass: detail.length === 0, defects, total, detail })}\n`);
}
