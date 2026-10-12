import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { basename, extname } from 'node:path';
import { onPath } from '#on-path';
import { isTestPath } from '#red-green';
import { readKindTable } from '#model-kinds';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { inRun, recordDecision } from '#run-decision';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { parsePlan, planIdOf, planRoute, taskCommits } from '#plan-tasks';
import { changedPaths, measureSizeFacts, parseNumstat } from '#size-facts';

export const FILE_LIMIT = 5;
export const LINE_LIMIT = 200;

const USAGE = `Usage: node pick-reviewer.mjs [--effort | --codex | --task <n> --plan <file> --root <dir>]
Prints the review effort for an uncommitted fix (default), whether to offer the Codex review (--codex),
or the reviewer of one landed task (--task). Only risk facts and numbers move a pick.`;

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

export const MANIFESTS = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  'requirements.txt', 'pyproject.toml', 'poetry.lock', 'uv.lock', 'Pipfile', 'Pipfile.lock',
  'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile', 'Gemfile.lock',
  'composer.json', 'composer.lock', 'pom.xml', 'build.gradle', 'build.gradle.kts'
];

export function pickReviewer({ riskTasks, manifestChanged, signatureChanged }) {
  return riskTasks || manifestChanged || signatureChanged ? REVIEWER_AGENTS.deep : REVIEWER_AGENTS.light;
}

const INSTRUCTION_FOLDERS = ['skills', 'agents', 'rules', 'hooks'];
const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md'];

function isInstructionPath(name) {
  if (SCRIPT_EXTENSIONS.has(extname(name))) return false;
  const segments = name.split('/');
  return segments.some((segment) => INSTRUCTION_FOLDERS.includes(segment)) || INSTRUCTION_FILES.includes(segments.at(-1));
}

export function taskReviewer(task, changedPaths, route, taskDiff = '') {
  if (task.risk !== null && /security boundary/i.test(task.risk)) return REVIEWER_AGENTS.deep;
  if (task.risk !== null) return REVIEWER_AGENTS.light;
  if (route === 'inline') return 'none (inline route)';
  if (changedPaths.some(isInstructionPath)) return REVIEWER_AGENTS.light;
  if (!changedPaths.some((name) => SCRIPT_EXTENSIONS.has(extname(name)))) return 'none (text only)';
  if (changedPaths.some(isTestPath) && outputOnly(taskDiff)) return 'none (output only, test covered)';
  return REVIEWER_AGENTS.light;
}

const OUTPUT_LINE = /^\s*$|^\s*(?:\/\/|\/\*(?:(?!\*\/).)*\*\/\s*$|\/\*\*?\s*$|\*\/\s*$)|^\s*(?:console\.(?:log|error|warn|info)|process\.(?:stdout|stderr)\.write)\([^()]*\)\s*;?\s*$/;

function isReviewedScript(file) {
  return file !== null && SCRIPT_EXTENSIONS.has(extname(file)) && !isTestPath(file);
}

function outputOnly(taskDiff) {
  let file = null;
  let header = false;
  let counted = false;
  let otherCode = false;
  for (const line of taskDiff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = line.slice(line.lastIndexOf(' b/') + 3);
      header = true;
    } else if (line.startsWith('@@')) {
      header = false;
    } else if (header && /^(\+\+\+|---) /.test(line)) {
      continue;
    } else if ((line.startsWith('+') || line.startsWith('-')) && isReviewedScript(file)) {
      otherCode = otherCode || !OUTPUT_LINE.test(line.slice(1));
      counted = true;
    }
  }
  return counted && !otherCode;
}

export function taskDiffOf(task, root, planId) {
  return taskCommits(task, root, planId)
    .map((sha) => execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', 'show', '--format=', '--no-renames', '-U0', sha], { encoding: 'utf8', maxBuffer: Infinity }))
    .join('\n');
}

export function taskPaths(task, root, planId) {
  const shas = taskCommits(task, root, planId);
  return shas.flatMap((sha) => execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', 'show', '--format=', '--no-renames', '--name-only', '-z', sha], { encoding: 'utf8', maxBuffer: Infinity }).split('\0').filter((name) => name !== ''));
}

export function codexOffer(env = process.env) {
  return onPath('codex', env);
}

export function touchesManifest(paths) {
  return paths.some((relativePath) => MANIFESTS.includes(basename(relativePath)));
}

export function pickEffort({ files, changedLines, manifestChanged }) {
  if (files <= EFFORT_SKIP_FILE_LIMIT && !manifestChanged) return 'skip';
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'low' : 'medium';
}

function measureEffort() {
  const { files, changedLines } = measureSizeFacts();
  const manifestChanged = touchesManifest(changedPaths());
  return pickEffort({ files, changedLines, manifestChanged });
}

function main(argv) {
  const flags = parseFlags(argv, { effort: 'boolean', codex: 'boolean', task: 'value', plan: 'value', root: 'value' }, { usage: USAGE });
  if (flags.task !== undefined) {
    for (const name of ['plan', 'root']) if (flags[name] === undefined) throw new UsageError(`flag '--${name}' needs a value`);
    const { tasks } = parsePlan(fs.readFileSync(path.resolve(flags.plan), 'utf8'));
    const task = tasks.find((candidate) => String(candidate.number) === flags.task);
    if (task === undefined) throw new UsageError(`no task ${flags.task} in the plan`);
    process.stdout.write(`${taskReviewer(task, taskPaths(task, flags.root, planIdOf(flags.plan)), planRoute(tasks).route, taskDiffOf(task, flags.root, planIdOf(flags.plan)))}\n`);
    return;
  }
  if (flags.codex) {
    const offerable = codexOffer();
    if (offerable && inRun()) recordDecision('codex', 'none', 'a run never offers the second review');
    process.stdout.write(`${offerable && !inRun() ? 'offer' : 'none'}\n`);
    return;
  }
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
