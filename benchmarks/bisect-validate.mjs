import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCase, commitCount, commitsWithSubject, git, holdsAt, reproHolds, reproPasses } from './bisect-repo.mjs';

export const MIN_COMMITS = 30;
export const MAX_COMMITS = 300;
export const FLAKY_SAMPLES = 20;
export const SAMPLED_COMMITS = 10;

function firstLine(error) {
  const text = String(error.stderr ?? error.message ?? error).trim();
  return text.split('\n')[0];
}

function structureProblems(first, second) {
  const problems = [];
  const branch = git(first, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== 'main') problems.push(`branch ${branch} is checked out, not main`);
  if (git(first, ['status', '--porcelain']).trim() !== '') problems.push('the working tree is not clean');
  const count = commitCount(first);
  if (count < MIN_COMMITS || count > MAX_COMMITS) problems.push(`${count} commits, not ${MIN_COMMITS}-${MAX_COMMITS}`);
  if (git(first, ['rev-parse', 'HEAD']).trim() !== git(second, ['rev-parse', 'HEAD']).trim()) problems.push('two builds give different HEAD commits');
  return problems;
}

function regressionProblems(repo, spec) {
  const matches = commitsWithSubject(repo, spec.culprit);
  if (matches.length !== 1) return [`culprit subject ${JSON.stringify(spec.culprit)} names ${matches.length} commits, not one`];
  const [culprit] = matches;
  const problems = [];
  if (reproHolds(repo, spec)) problems.push('repro is green at HEAD');
  if (holdsAt(repo, culprit, spec)) problems.push('repro is green at the culprit');
  const parentKnown = git(repo, ['rev-list', '--parents', '-n', '1', culprit]).trim().split(' ').length > 1;
  if (!parentKnown) return [...problems, 'the culprit has no parent'];
  if (!holdsAt(repo, `${culprit}^`, spec)) problems.push('repro is red at the culprit parent');
  return problems;
}

function sampledRevisions(repo) {
  const all = git(repo, ['rev-list', '--reverse', 'HEAD']).split('\n').filter(Boolean);
  const step = Math.max(1, Math.floor(all.length / SAMPLED_COMMITS));
  const sampled = all.filter((revision, index) => index % step === 0);
  return [...new Set([...sampled, all[all.length - 1]])];
}

function neverWorkedProblems(repo, spec) {
  const green = sampledRevisions(repo).filter((revision) => holdsAt(repo, revision, spec));
  return green.map((revision) => `repro is green at ${revision.slice(0, 7)}`);
}

function flakyProblems(repo, spec) {
  const outcomes = new Set(Array.from({ length: FLAKY_SAMPLES }, () => reproPasses(repo, spec.repro)));
  return outcomes.size === 2 ? [] : [`repro gave one outcome in ${FLAKY_SAMPLES} runs at HEAD`];
}

function plainProblems(repo, spec) {
  return reproHolds(repo, spec) ? ['repro is green at HEAD'] : [];
}

const KIND_CHECKS = {
  regression: regressionProblems,
  'never-worked': neverWorkedProblems,
  flaky: flakyProblems,
  plain: plainProblems
};

function buildTwice(spec, folder) {
  try {
    return { first: buildCase(spec, path.join(folder, 'first')), second: buildCase(spec, path.join(folder, 'second')) };
  } catch (error) {
    return { problem: `build.mjs failed: ${firstLine(error)}` };
  }
}

export function validateCase(spec, scratch = os.tmpdir()) {
  const folder = fs.mkdtempSync(path.join(scratch, 'exo-bisect-validate-'));
  try {
    const built = buildTwice(spec, folder);
    if (built.problem !== undefined) return [built.problem];
    const problems = structureProblems(built.first, built.second);
    return problems.length > 0 ? problems : KIND_CHECKS[spec.kind](built.first, spec);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
