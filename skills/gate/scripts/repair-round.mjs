import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { environmentMs } from '#script-flags';
import { outcome, outcomeLine } from '../../../lib/run-outcomes.mjs';
import { GATE_TIMEOUT_MS } from './gate-constants.mjs';
import { gitOutput } from './gate-command.mjs';

const COMMIT_SEPARATOR = '\u001e';

const FIELD_SEPARATOR = '\u001f';

const GUARD_WITHOUT_REASON = /^none(?!\s*\(\s*[^\s)])/i;

function bodyField(body, name) {
  return body.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1].trim().replace(/^`|`$/g, '') ?? null;
}

export function repairCommits(root, preFixSha) {
  const log = gitOutput(root, ['log', `--format=%h${FIELD_SEPARATOR}%B${COMMIT_SEPARATOR}`, `${preFixSha}..HEAD`]);
  return log.split(COMMIT_SEPARATOR).map((entry) => entry.trim()).filter((entry) => entry !== '').map((entry) => {
    const [sha, body] = entry.split(FIELD_SEPARATOR);
    return { sha, sweep: bodyField(body, 'Sweep'), guard: bodyField(body, 'Guard') };
  });
}

function missingFields({ sweep, guard }) {
  return [sweep === null ? 'Sweep:' : null, guard === null || GUARD_WITHOUT_REASON.test(guard) ? 'Guard:' : null].filter((field) => field !== null);
}

export function namedGuards(commits) {
  return commits.map(({ guard }) => guard).filter((guard) => guard !== null && !/^none\b/i.test(guard));
}

export function guardLines(commits, diffFiles) {
  const incomplete = commits.filter((commit) => missingFields(commit).length > 0);
  return [
    ...incomplete.map((commit) => `FAIL fixer-no-guard (commit ${commit.sha} lacks ${missingFields(commit).join(' and ')})`),
    ...namedGuards(commits).filter((guard) => !diffFiles.includes(guard)).map((guard) => `FAIL fixer-guard-not-in-diff (${guard} is not in the repair diff)`)
  ];
}

const ROUNDS_FILE = 'review-rounds.tsv';

const ROUNDS_HEADER = 'round\tcommit\tchecks\tfix_before\tfix_after\tdecision\n';

export function budgetSpent(startedAt, now = Date.now()) {
  if (startedAt === undefined) return false;
  return now - startedAt >= environmentMs('EXO_GATE_TIMEOUT_MS', GATE_TIMEOUT_MS);
}

export function budgetLine() {
  return `STOP ${outcome('review budget').kind.replace(' ', '-')}: ${outcomeLine('review budget')}`;
}

export function keepFix({ checksGreen, newFixInDiff }) {
  return checksGreen && newFixInDiff === 0;
}

export function appendRound(root, { round, commits, checksGreen, fixBefore, fixAfter, kept }) {
  const file = path.join(root, '.exo', ROUNDS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, ROUNDS_HEADER);
  const fields = [round, commits.join(','), checksGreen ? 'pass' : 'fail', fixBefore, fixAfter, kept ? 'kept' : 'discarded'];
  fs.appendFileSync(file, `${fields.join('\t')}\n`);
}

export function settleRound({ root, round, commits, checksGreen, newFixInDiff = 0, fixBefore, fixAfter }) {
  const kept = keepFix({ checksGreen, newFixInDiff });
  if (!kept) execFileSync('git', ['-C', root, 'revert', '--no-edit', ...commits], { stdio: 'ignore' });
  appendRound(root, { round, commits, checksGreen, fixBefore, fixAfter: kept ? fixAfter : fixBefore, kept });
  if (kept) return [];
  return [`DISCARDED round ${round} (${commits.join(',')}) ${outcome('fix discarded').action}: ${outcomeLine('fix discarded')}`];
}

const PENDING_FILE = 'review-round-pending.json';

export function writePending(root, pending) {
  fs.mkdirSync(path.join(root, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.exo', PENDING_FILE), JSON.stringify(pending));
}

export function takePending(root) {
  const file = path.join(root, '.exo', PENDING_FILE);
  if (!fs.existsSync(file)) return null;
  const pending = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.rmSync(file);
  return pending;
}
