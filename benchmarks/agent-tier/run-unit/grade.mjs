import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TEST_MS = 30_000;
const TRAILER = /^Plan-task: (.+)\/(\d+)$/m;
const SEP = '\u001f';
const END = '\u001e';

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

function readHead(repo, name) {
  const file = path.join(repo, '.exo', name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

function commitsSince(repo, base) {
  const log = execFileSync('git', ['-C', repo, 'log', '--reverse', `--format=%H${SEP}%s${SEP}%B${END}`, `${base}..HEAD`], { encoding: 'utf8' });
  return log.split(END).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [sha, subject, body] = entry.split(SEP);
    const trailer = body.match(TRAILER);
    return { sha: sha.slice(0, 7), subject, plan: trailer?.[1] ?? null, number: trailer ? Number(trailer[2]) : null };
  });
}

export function landedFindings(commits, planId, setupCount) {
  const findings = [];
  const seen = new Set();
  commits.forEach((commit, index) => {
    if (commit.number === null || commit.plan !== planId) return findings.push(`hand commit ${commit.sha} ${commit.subject}`);
    if (seen.has(commit.number)) findings.push(`task ${commit.number} landed twice`);
    if (index >= setupCount && [...seen].some((number) => number > commit.number)) findings.push(`task ${commit.number} landed after a later task`);
    seen.add(commit.number);
  });
  return findings;
}

export function outcomeFindings(landed, allowed) {
  const match = allowed.some((outcome) => outcome.length === landed.length && outcome.every((number, index) => number === landed[index]));
  return match ? [] : [`landed tasks [${landed.join(', ')}], expected one of ${allowed.map((outcome) => `[${outcome.join(', ')}]`).join(' or ')}`];
}

function testEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST')));
}

function testFindings(repo) {
  const run = spawnSync('npm', ['test', '--silent'], { cwd: repo, env: testEnvironment(), encoding: 'utf8', timeout: TEST_MS });
  return run.status === 0 ? [] : [`npm test exited ${run.status}`];
}

export async function gradeRun({ planId, allowed }) {
  const repo = path.resolve(process.argv[2] ?? '.');
  const root = git(repo, ['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0];
  const setup = readHead(repo, 'setup-head') ?? root;
  const commits = commitsSince(repo, root);
  const setupCount = commits.length - commitsSince(repo, setup).length;
  const landed = commits.filter((commit) => commit.number !== null).map((commit) => commit.number);
  const checks = [landedFindings(commits, planId, setupCount), outcomeFindings(landed, allowed), testFindings(repo)];
  const detail = checks.flat();
  const defects = checks.filter((findings) => findings.length > 0).length;
  process.stdout.write(`${JSON.stringify({ pass: detail.length === 0, defects, total: checks.length, detail })}\n`);
}
