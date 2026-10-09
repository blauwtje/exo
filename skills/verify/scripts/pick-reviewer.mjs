// Holds the risk pick of the review agent that verify.mjs prints, and prints
// the review effort for an uncommitted fix (--effort), so a remark about budget,
// a deadline or how the diff reads never moves either pick: only the risk facts
// and numbers themselves do.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { basename, extname } from 'node:path';
import { onPath } from '#on-path';
import { readKindTable } from '#model-kinds';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { parsePlan, planIdOf, planRoute, taskCommits } from '#plan-tasks';
import { changedPaths, measureSizeFacts, parseNumstat } from '#size-facts';

export const FILE_LIMIT = 5;
export const LINE_LIMIT = 200;

// The light reviewer is the agent of kind `review`; the deep one is that same
// agent with the model and effort of kind `review-deep`, which the dispatch
// passes as the Agent call's parameters. The agent's name is its file's basename.
function reviewerAgents() {
  const { agents, kinds } = readKindTable();
  const [lightFile] = Object.entries(agents).find(([, entry]) => entry.kind === 'review');
  const light = basename(lightFile, '.md');
  const { model, effort } = kinds['review-deep'];
  return { light, deep: `${light} model=${model} effort=${effort}` };
}

export const REVIEWER_AGENTS = reviewerAgents();
const EFFORT_SKIP_FILE_LIMIT = 2;
export { parseNumstat };

// Any touch to one of these -- a lockfile bump included -- moves the effort
// pick off `skip`, because it can shift what a repository resolves even with
// no dependency *added*; `lib/size-facts.mjs` reserves "dependency-added" for
// the narrower question its own callers ask.
export const MANIFESTS = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  'requirements.txt', 'pyproject.toml', 'poetry.lock', 'uv.lock', 'Pipfile', 'Pipfile.lock',
  'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile', 'Gemfile.lock',
  'composer.json', 'composer.lock', 'pom.xml', 'build.gradle', 'build.gradle.kts'
];

/** The deep reviewer pick (the light agent plus call model and effort) when a landed task carries a `Risk:`, a manifest changed or a signature changed; diff size no longer picks it. */
export function pickReviewer({ riskTasks, manifestChanged, signatureChanged }) {
  return riskTasks || manifestChanged || signatureChanged ? REVIEWER_AGENTS.deep : REVIEWER_AGENTS.light;
}

/**
 * One landed task's reviewer: the deep pick only for `Risk: security boundary`;
 * the light pick for another `Risk:` or a changed script file; `none (text only)`
 * for a task changing no script file; `none (inline route)` for an inline-route
 * task without `Risk:`.
 */
export function taskReviewer(task, changedPaths, route) {
  if (task.risk !== null && /security boundary/i.test(task.risk)) return REVIEWER_AGENTS.deep;
  if (task.risk !== null) return REVIEWER_AGENTS.light;
  if (route === 'inline') return 'none (inline route)';
  return changedPaths.some((name) => SCRIPT_EXTENSIONS.has(extname(name))) ? REVIEWER_AGENTS.light : 'none (text only)';
}

/** The paths the commits carrying task `number` of the plan changed. */
function taskPaths(task, root, planId) {
  const shas = taskCommits(task, root, planId);
  return shas.flatMap((sha) => execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', 'show', '--format=', '--no-renames', '--name-only', '-z', sha], { encoding: 'utf8', maxBuffer: Infinity }).split('\0').filter((name) => name !== ''));
}

/** Whether verify may offer the opt-in second review through Codex: only when `codex` is on `PATH`. */
export function codexOffer(env = process.env) {
  return onPath('codex', env);
}

/** Whether the diff touches a manifest or lockfile. */
export function touchesManifest(paths) {
  return paths.some((relativePath) => MANIFESTS.includes(basename(relativePath)));
}

/**
 * Whether a non-merge commit between `base` and HEAD carries a `Signature:`
 * trailer (land-task adds it), or carries no `Plan-task:` trailer, such as a
 * `--fix` commit, and touches a script file. A commit without `Plan-task:`
 * that touches only prose or data, such as `CHANGELOG.md`, cannot change a
 * signature. Merge commits are never read.
 */
export function signatureChangedSince(base, root = process.cwd()) {
  const format = '%x1e%(trailers:key=Signature,valueonly)%x1f%(trailers:key=Plan-task,valueonly)%x1f';
  const log = execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', 'log', '--no-merges', '--name-only', `--format=${format}`, `${base}..HEAD`], { encoding: 'utf8' });
  const commits = log.split('\x1e').slice(1);
  return commits.some((commit) => {
    const [signature, planTask, names] = commit.split('\x1f');
    if (signature.trim() !== '') return true;
    if (planTask.trim() !== '') return false;
    return names.split('\n').some((name) => SCRIPT_EXTENSIONS.has(extname(name.trim())));
  });
}

/** Effort for the uncommitted fix against HEAD: tracked changes plus untracked new files. */
export function pickEffort({ files, changedLines, manifestChanged }) {
  if (files <= EFFORT_SKIP_FILE_LIMIT && !manifestChanged) return 'skip';
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'low' : 'medium';
}

/**
 * `lib/size-facts.mjs` holds the one count of files and lines; this pick
 * still asks its own broader manifest question, because a lockfile bump or a
 * version-only change moves the review effort even without adding a
 * dependency by that module's narrower meaning.
 */
function measureEffort() {
  const { files, changedLines } = measureSizeFacts();
  const manifestChanged = touchesManifest(changedPaths());
  return pickEffort({ files, changedLines, manifestChanged });
}

function main(argv) {
  const flags = parseFlags(argv, { effort: 'boolean', codex: 'boolean', task: 'value', plan: 'value', root: 'value' });
  if (flags.task !== undefined) {
    for (const name of ['plan', 'root']) if (flags[name] === undefined) throw new UsageError(`flag '--${name}' needs a value`);
    const { tasks } = parsePlan(fs.readFileSync(path.resolve(flags.plan), 'utf8'));
    const task = tasks.find((candidate) => String(candidate.number) === flags.task);
    if (task === undefined) throw new UsageError(`no task ${flags.task} in the plan`);
    process.stdout.write(`${taskReviewer(task, taskPaths(task, flags.root, planIdOf(flags.plan)), planRoute(tasks).route)}\n`);
    return;
  }
  if (flags.codex) {
    process.stdout.write(`${codexOffer() ? 'offer' : 'none'}\n`);
    return;
  }
  // The reviewer pick lives in verify.mjs, which reads the plan's `Risk:` fields
  // this command cannot see, so only one pick of the reviewer exists.
  process.stdout.write(`${measureEffort()}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`pick-reviewer: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
