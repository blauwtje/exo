// Picks the review agent by risk (--base/--reviewer), or the review effort
// for an uncommitted fix (--effort), so a remark about budget, a deadline or
// how the diff reads never moves either pick: only a reviewer the caller names
// with --reviewer, or the risk facts and numbers themselves, do.

import { execFileSync } from 'node:child_process';
import { basename, extname } from 'node:path';
import { readKindTable } from '#model-kinds';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { changedPaths, measureSizeFacts, parseNumstat } from '#size-facts';

export const FILE_LIMIT = 5;
export const LINE_LIMIT = 200;

// The light reviewer is the agent of kind `review`; the deep one is the agent
// of kind `review-deep` generated from it, which sets it apart from other
// `review-deep` agents. Each agent's name is its file's basename.
function reviewerAgents() {
  const { agents } = readKindTable();
  const agentName = (file) => basename(file, '.md');
  const [lightFile] = Object.entries(agents).find(([, entry]) => entry.kind === 'review');
  const [deepFile] = Object.entries(agents)
    .find(([, entry]) => entry.kind === 'review-deep' && entry.generatedFrom === lightFile);
  return { light: agentName(lightFile), deep: agentName(deepFile) };
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

/** The deep reviewer when a landed task carries a `Risk:`, a manifest changed or a signature changed; diff size no longer picks it. */
export function pickReviewer({ riskTasks, manifestChanged, signatureChanged }) {
  return riskTasks || manifestChanged || signatureChanged ? REVIEWER_AGENTS.deep : REVIEWER_AGENTS.light;
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

export function resolveReviewer({ reviewer, facts }) {
  if (reviewer !== undefined) {
    if (!Object.values(REVIEWER_AGENTS).includes(reviewer)) throw new UsageError(`unknown reviewer '${reviewer}'`);
    return reviewer;
  }
  return pickReviewer(facts);
}

function main(argv) {
  const flags = parseFlags(argv, { base: 'value', reviewer: 'value', effort: 'boolean' });
  if (flags.effort) {
    if (flags.reviewer !== undefined || flags.base !== undefined) {
      throw new UsageError("flag '--effort' does not take '--reviewer' or '--base'");
    }
    process.stdout.write(`${measureEffort()}\n`);
    return;
  }
  const base = flags.base ?? '';
  // An empty base makes git read `...HEAD` as HEAD...HEAD, an empty diff that
  // would pick the light reviewer for a branch of any size.
  if (flags.reviewer === undefined && base === '') throw new UsageError("flag '--base' needs a revision");
  // The plan's `Risk:` fields live in verify.mjs, so this command reads the
  // manifest and signature facts only; verify.mjs prints the full pick.
  const facts = flags.reviewer === undefined
    ? { riskTasks: false, manifestChanged: touchesManifest(changedPaths({ base })), signatureChanged: signatureChangedSince(base) }
    : null;
  process.stdout.write(`${resolveReviewer({ reviewer: flags.reviewer, facts })}\n`);
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
