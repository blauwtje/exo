import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandHome } from '#basics';
import { parseFlags, isMain, environmentMs } from '#script-flags';
import { resolvePlanPath } from '#checkout';
import { landedTasks, planIdOf, taskCommits } from '#plan-landed';
import { repoState } from '#repo-state';
import { git, gitText, shortSha } from '#git';
import { parsePlan } from '#plan-tasks';
import { frameOf } from '#plan-frame';
import { taskScratchPath } from '#scratch-path';
import { SELF_BUILD_TASKS, CHAIN_TASKS, PLAN_TASK_TRAILER, STATUS_BLOCKED, STATUS_PLAN_DRIFT } from '#shared-values';
import { implementerReportPath } from './land-stopped.mjs';

const USAGE = 'usage: next-task.mjs --plan <plan> [--root <checkout>]';

const STANDING = [['Decisions', 'decisions'], ['Non-goals', 'nonGoals'], ['Facts', 'facts']];

function standingText(frame) {
  const found = frameOf(frame);
  return STANDING.filter(([, key]) => found[key].length > 0)
    .map(([title, key]) => `${title}:\n${found[key].map((item) => (/^\d+\. /.test(item) ? item : `- ${item}`)).join('\n')}\n`)
    .join('\n');
}

export function reviewEffort(changedLines, base) {
  if (changedLines < 4 * base) return 'medium';
  return 'high';
}

const newPath = (file) => file.includes('{')
  ? file.replace(/\{([^{}]*) => ([^{}]*)\}/, '$2').replace(/\/\//g, '/').replace(/^\//, '')
  : file.replace(/^.* => /, '');

const sumNumstat = (text, keep = () => true) => text.split('\n')
  .filter((line) => line !== '')
  .map((line) => line.split('\t'))
  .map(([added, removed, file]) => [added, removed, newPath(file)])
  .filter(([, , file]) => keep(file))
  .reduce((sum, cells) => sum + (Number(cells[0]) || 0) + (Number(cells[1]) || 0), 0);

function movedCounts(root, numstat, moves) {
  let changed = sumNumstat(numstat);
  let moved = 0;
  const missing = [];
  for (const { source: written, dest } of moves) {
    const source = expandHome(written);
    const diff = fs.existsSync(source) ? git(root, ['diff', '--no-index', '--numstat', '-M', source, path.join(root, dest)]) : null;
    if (!diff || (diff.status !== 0 && diff.status !== 1) || diff.stderr) {
      missing.push(written);
      continue;
    }
    const prefix = `${dest.replace(/\/$/, '')}/`;
    const added = sumNumstat(numstat, (file) => file === dest || file.startsWith(prefix));
    const real = sumNumstat(diff.stdout);
    changed += real - added;
    moved += added - real;
  }
  return { changed, moved, missing };
}

export function reviewEffortLine(root, planText, state = repoState(root)) {
  const base = state.defaultBase();
  if (base === null) return 'Review effort: medium (base unknown)\n';
  const numstat = gitText(root, ['diff', '--numstat', '-M', `${base}...HEAD`]);
  const moves = frameOf(parsePlan(planText).frame).moves;
  const { changed, moved, missing } = movedCounts(root, numstat, moves);
  const movedText = moves.length === 0 ? '' : `, ${moved} moved${missing.map((source) => `, moved source missing: ${source}`).join('')}`;
  return `Review effort: ${reviewEffort(changed, environmentMs('EXO_REVIEW_LINES', 150))} (${changed} changed lines${movedText})\n`;
}

function reviewFocusLines(planText) {
  const bullets = frameOf(parsePlan(planText).frame).reviewFocus?.split('\n').filter((line) => line.startsWith('- ')) ?? [];
  return bullets.length === 0 ? '' : `Review focus:\n${bullets.join('\n')}\n`;
}

function routeLine(tasks, landed) {
  const chained = tasks.every((task, index) => index === 0 || (task.dependsOn.length === 1 && task.dependsOn[0] === tasks[index - 1].number));
  if (!chained) return 'Route: builder\n';
  if (tasks.length <= environmentMs('EXO_SELF_BUILD_TASKS', SELF_BUILD_TASKS)) return 'Route: this session\n';
  const length = Math.min(environmentMs('EXO_CHAIN_TASKS', CHAIN_TASKS), tasks.length - landed.length);
  return length < 2 ? 'Route: builder\n' : `Route: builder chain ${length}\n`;
}

export function nextTaskReport({ planText, planPath, root, state = repoState(root) }) {
  const { tasks, frame } = parsePlan(planText);
  const landed = landedTasks(tasks, state.planCommits(), planIdOf(planPath));
  const next = tasks.find((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
  const landedLine = `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}\n`;
  if (next === undefined) return `${landedLine}Next: none\n`;
  const standing = standingText(frame);
  const task = `${landedLine}Next: ${next.number} ${next.title}\n${routeLine(tasks, landed)}\n${next.section.trim()}\n`;
  return standing === '' ? task : `${task}\n${standing}`;
}

function noticedLines({ tasks, commits, state, planId }) {
  return tasks.filter((task) => taskCommits(task, commits, planId).length > 0).flatMap(({ number }) => {
    const report = implementerReportPath(state, planId, number);
    if (!fs.existsSync(report)) return [];
    return fs.readFileSync(report, 'utf8').split('\n')
      .filter((line) => line.startsWith('Noticed:') && line.trim() !== 'Noticed: none')
      .map((line) => `Task ${number}: ${line}`);
  });
}

export function endReportLines({ root, planText, planPath, state = repoState(root) }) {
  const { tasks } = parsePlan(planText);
  const planId = planIdOf(planPath);
  const base = state.defaultBase();
  const stat = base === null ? 'Diff stat: base unknown' : `Diff stat:\n${gitText(root, ['diff', '--stat', `${base}...HEAD`], { trim: false }).trimEnd()}`;
  const shas = new Set(tasks.flatMap((task) => taskCommits(task, state.planCommits(), planId)));
  const commits = state.planCommits().filter((commit) => shas.has(commit.sha));
  const commitLines = commits.map((commit) => `${shortSha(commit.sha)} ${commit.subject}`).reverse();
  const noticed = noticedLines({ tasks, commits, state, planId });
  return `${stat}\n${PLAN_TASK_TRAILER} commits:\n${commitLines.join('\n')}\n${noticed.length === 0 ? 'Noticed: none' : `Noticed:\n${noticed.join('\n')}`}\n`;
}

const PROMPT_PATH = fileURLToPath(new URL('../references/run-task-prompt.md', import.meta.url));

const FAILED_REPORT = new RegExp(`^Task \\d+: (?:${STATUS_BLOCKED}|${STATUS_PLAN_DRIFT})|^Unresolved: (?!none)`, 'm');

const failedReport = (file) => fs.existsSync(file) && FAILED_REPORT.test(fs.readFileSync(file, 'utf8'));

function dispatchLines({ planPath, root, number, brief, report, failed }) {
  const plan = path.resolve(planPath);
  const checkout = path.resolve(root);
  return [
    `Report: ${report}`,
    ...(failed ? [`Failed report: ${failed}`] : []),
    'Dispatch:',
    `  Plan: ${plan}`,
    `  Checkout: ${checkout}`,
    `  Task: ${number}`,
    `  Read first: ${brief}`,
    `  Report path: ${report}`,
    `  Prompt: ${PROMPT_PATH}`,
    `  Land with: --plan ${plan} --task ${number} --root ${checkout}`
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value' }, { usage: USAGE });
  const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
  const root = flags.root ?? process.cwd();
  const planText = fs.readFileSync(planPath, 'utf8');
  const state = repoState(root);
  const report = nextTaskReport({ planText, planPath, root, state });
  const [landedLine, nextLine, routeText] = report.split('\n');
  if (nextLine === 'Next: none') {
    process.stdout.write(`${report}${reviewEffortLine(root, planText, state)}${reviewFocusLines(planText)}${endReportLines({ root, planText, planPath, state })}`);
  } else {
    const number = Number(nextLine.split(' ')[1]);
    const planId = planIdOf(planPath);
    const brief = taskScratchPath(state, { planId, number }, 'brief.md');
    const reportFile = implementerReportPath(state, planId, number);
    const failedFile = taskScratchPath(state, { planId, number }, 'failed-report.md');
    const moved = fs.existsSync(brief) && failedReport(reportFile);
    if (moved) fs.renameSync(reportFile, failedFile);
    if (!fs.existsSync(brief)) fs.rmSync(reportFile, { force: true });
    fs.writeFileSync(brief, report);
    const dispatch = dispatchLines({ planPath, root, number, brief, report: reportFile, failed: moved ? failedFile : null });
    process.stdout.write(`${landedLine}\n${nextLine}\n${routeText}\nBrief: ${brief}\n${dispatch}\n`);
  }
}
