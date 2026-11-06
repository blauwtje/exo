import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { defaultRef, gitLine } from '#git';
import { commitsOf, landedTasks, planIdOf } from '#plan-landed';
import { parsePlan } from '#plan-tasks';
import { isMain } from '#script-flags';
import { listRuns } from '../../build/scripts/run-state.mjs';
import { handoffFile } from '../../save-session/scripts/handoff.mjs';

const USAGE = 'usage: node board.mjs [--cwd <dir>]\nPrints what is open in this repository (plans, runs, branches, a saved session, briefs with open points) and the one next action, or "Nothing open."';
const PLAN_FOLDERS = ['specs', 'plans'];
const BRANCH_CAP = 5;
const ATTENTION = ['parked', 'stopped', 'crashed', 'refused'];

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function planFiles(root) {
  return PLAN_FOLDERS.flatMap((folder) => {
    const dir = path.join(root, 'docs', folder);
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    return names.filter((name) => name.endsWith('.md') && !name.endsWith('-decisions.md')).map((name) => path.join('docs', folder, name));
  });
}

function openPointCount(text) {
  const section = text.match(/^## Open points[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return section === null ? 0 : section[1].split('\n').filter((line) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(line)).length;
}

function readPlan(root, relative, commits) {
  const text = readText(path.join(root, relative));
  if (text === null) return null;
  try {
    const { tasks } = parsePlan(text);
    const landed = landedTasks(tasks, commits, planIdOf(relative)).length;
    return { file: relative, total: tasks.length, landed, openPoints: openPointCount(text) };
  } catch {
    return null;
  }
}

function planEntries(root) {
  const commits = commitsOf(root);
  return planFiles(root).map((file) => readPlan(root, file, commits)).filter((plan) => plan !== null && plan.total > 0);
}

function runEntries(root, plans) {
  const latest = new Map(listRuns(root).map((run) => [path.basename(run.plan), run]));
  const unfinished = new Set(plans.filter((plan) => plan.landed < plan.total).map((plan) => path.basename(plan.file)));
  return [...latest.values()]
    .filter((run) => ATTENTION.includes(run.phase) && unfinished.has(path.basename(run.plan)))
    .map((run) => ({ id: run.id, phase: run.phase, plan: path.basename(run.plan), landed: run.landed, total: run.total }));
}

function worktreePaths(root) {
  const listing = gitLine(root, ['worktree', 'list', '--porcelain']) ?? '';
  const paths = new Map();
  let current = null;
  for (const line of listing.split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice(9);
    if (line.startsWith('branch refs/heads/') && current !== root) paths.set(line.slice(18), path.relative(root, current));
  }
  return paths;
}

function branchEntries(root) {
  const base = defaultRef(root);
  if (base === null) return [];
  const listing = gitLine(root, ['branch', '--no-merged', base.name, '--format=%(refname:short)']) ?? '';
  const current = gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  const worktrees = worktreePaths(root);
  return listing.split('\n').filter((name) => name !== '' && name !== current).map((name) => ({ name, worktree: worktrees.get(name) ?? null }));
}

function sessionEntry(root) {
  const file = handoffFile(root);
  const text = readText(file);
  if (text === null) return null;
  const summary = text.split('\n').find((line) => line.trim() !== '' && !line.startsWith('#'));
  return { file, summary: summary?.trim() ?? '' };
}

export function readBoard(root) {
  const plans = planEntries(root);
  return {
    plans: plans.filter((plan) => plan.landed > 0 && plan.landed < plan.total),
    briefs: plans.filter((plan) => plan.openPoints > 0),
    runs: runEntries(root, plans),
    branches: branchEntries(root),
    session: sessionEntry(root)
  };
}

function recommendation(board) {
  const run = board.runs[0];
  if (run !== undefined) return run.phase === 'parked' ? `exo approve ${run.id}` : `exo status ${run.id}`;
  if (board.session !== null) return `read ${board.session.file} and continue that work`;
  if (board.briefs[0] !== undefined) return `/exo:spec ${board.briefs[0].file} to answer its open points`;
  if (board.plans[0] !== undefined) return `/exo:build ${board.plans[0].file}`;
  if (board.branches[0] !== undefined) return `/exo:ship for branch ${board.branches[0].name}`;
  return null;
}

function branchLine({ name, worktree }) {
  return worktree === null ? `- branch ${name} is not merged` : `- branch ${name} is not merged, worktree ${worktree}`;
}

export function renderBoard(board) {
  const next = recommendation(board);
  if (next === null) return 'Nothing open.';
  const shown = board.branches.slice(0, BRANCH_CAP).map(branchLine);
  const hidden = board.branches.length - shown.length;
  return [
    'Open in this repository:',
    ...board.runs.map((run) => `- run ${run.id} is ${run.phase} on ${run.plan}, ${run.landed ?? 0} of ${run.total ?? '?'} tasks landed`),
    ...(board.session === null ? [] : [`- saved session at ${board.session.file}: ${board.session.summary}`]),
    ...board.briefs.map((plan) => `- brief ${plan.file} has ${plan.openPoints} open ${plan.openPoints === 1 ? 'point' : 'points'}`),
    ...board.plans.map((plan) => `- plan ${plan.file}: ${plan.landed} of ${plan.total} tasks landed`),
    ...shown,
    ...(hidden > 0 ? [`- ${hidden} more unmerged branches`] : []),
    '',
    `Next: ${next}`
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(USAGE);
  } else {
    const at = args.indexOf('--cwd');
    const cwd = at === -1 ? process.cwd() : args[at + 1];
    const root = gitLine(cwd, ['rev-parse', '--show-toplevel']);
    console.log(root === null ? 'Nothing open.' : renderBoard(readBoard(root)));
  }
}
