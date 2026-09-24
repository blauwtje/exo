// benchmarks/sweep-cells.mjs
// The cells of the model and effort sweep: which model and effort run each
// review, build, plan and whole-flow cell, and the `claude -p` arguments every
// cell starts with. Nothing here starts a process; sweep.mjs does.

import fs from 'node:fs';
import path from 'node:path';
import { FLOW_BRANCH, FLOW_PLAN, FLOW_REQUEST } from './sweep-fixtures.mjs';
import { NO_RUN, ROOT, SAFE_TASKS } from './tasks.mjs';

export const SWEEP_MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5',
  fable: 'claude-fable-5-1'
};

export const REVIEW_EFFORTS = ['low', 'medium', 'high'];

export const CELL_SETS = ['review', 'build', 'fixer', 'plan', 'flow'];

// A seeded branch carries the fixture's defect; a control branch carries its
// reference solution, so a defect or hazard reported there is a false alarm.
const REVIEW_SOURCES = { seeded: 'seed', control: 'solution' };

const PLAN_RUNS = [
  { model: 'opus', effort: 'high' },
  { model: 'fable', effort: 'high' },
  { model: 'fable', effort: 'xhigh' }
];

const NO_ANSWER = 'Nobody can answer a question during this run.';
const MINUTE_MS = 60 * 1000;

// The reviewer runs as the cell's own session, not as a dispatched agent,
// because the agent's frontmatter effort would override the effort under test.
function reviewerPrompt() {
  const text = fs.readFileSync(path.join(ROOT, 'agents', 'branch-reviewer.md'), 'utf8');
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

function reviewDispatch(task) {
  return [
    `Review the branch feat/${task.id} of the repository in the current directory.`,
    `Plan: docs/plans/${task.id}.md`,
    'Base: main, for git diff main...HEAD',
    'Code standard: the checks below',
    `Final verification: \`node --check ${task.file}\` exits 0.`,
    NO_ANSWER
  ].join('\n');
}

function reviewCells(reviewer) {
  const cells = [];
  for (const task of SAFE_TASKS) {
    for (const [variant, source] of Object.entries(REVIEW_SOURCES)) {
      for (const effort of REVIEW_EFFORTS) {
        cells.push({
          id: `review-${task.id}-${variant}-${effort}`,
          kind: 'review',
          task,
          variant,
          source,
          model: SWEEP_MODELS.opus,
          effort,
          prompt: reviewDispatch(task),
          appendSystemPrompt: reviewer,
          disallowedTools: [],
          budgetUsd: '3',
          timeoutMs: 20 * MINUTE_MS
        });
      }
    }
  }
  return cells;
}

// A build cell repeats the safe tier of run.mjs on Sonnet 5 at high: the same
// prompt, the same no-run instruction and no Bash, so its check verdict compares.
function buildCells() {
  return SAFE_TASKS.map((task) => ({
    id: `build-${task.id}`,
    kind: 'build',
    task,
    variant: null,
    source: null,
    model: SWEEP_MODELS.sonnet,
    effort: 'high',
    prompt: task.prompt,
    appendSystemPrompt: NO_RUN,
    disallowedTools: ['Bash'],
    budgetUsd: '3',
    timeoutMs: 20 * MINUTE_MS
  }));
}

// review-fixer-prompt.md's fenced block is the whole dispatch a sonnet
// general-purpose delegate gets, placeholders filled the way implementing
// fills them, because that role carries no agent frontmatter of its own.
function fixerTemplate() {
  const text = fs.readFileSync(path.join(ROOT, 'skills', 'implementing', 'review-fixer-prompt.md'), 'utf8');
  return text.match(/```text\r?\n([\s\S]*?)\r?\n```/)[1];
}

function fixerDispatch(template, task) {
  const planPath = `docs/plans/${task.id}.md`;
  return template.replace(/<plan path>|<report path>|<root>|<base>|<plan>/g, (token) => ({
    '<plan path>': planPath,
    '<plan>': planPath,
    '<root>': 'the repository in the current directory',
    '<base>': 'main',
    '<report path>': '.git/branch-review.md'
  })[token]);
}

// A fixer cell pairs with each safe task the way a build cell does, on the
// sonnet the review-fixer role is pinned to; implementing names no effort for
// it, so it runs at the same high effort the build and flow cells run at.
function fixerCells() {
  const template = fixerTemplate();
  return SAFE_TASKS.map((task) => ({
    id: `fixer-${task.id}`,
    kind: 'fixer',
    task,
    variant: null,
    source: null,
    model: SWEEP_MODELS.sonnet,
    effort: 'high',
    prompt: fixerDispatch(template, task),
    appendSystemPrompt: null,
    disallowedTools: [],
    budgetUsd: '3',
    timeoutMs: 20 * MINUTE_MS
  }));
}

function planCells() {
  return PLAN_RUNS.map((run) => ({
    id: `plan-${run.model}-${run.effort}`,
    kind: 'plan',
    task: null,
    variant: null,
    source: null,
    model: SWEEP_MODELS[run.model],
    effort: run.effort,
    prompt: `Load the exo:planning skill and plan this request: ${FLOW_REQUEST}\n${NO_ANSWER}`,
    appendSystemPrompt: null,
    disallowedTools: [],
    budgetUsd: '10',
    timeoutMs: 45 * MINUTE_MS
  }));
}

function flowCell() {
  return {
    id: 'flow-c7',
    kind: 'flow',
    task: null,
    variant: null,
    source: null,
    model: SWEEP_MODELS.sonnet,
    effort: 'high',
    prompt: `Load the exo:implementing skill and run the plan ${FLOW_PLAN}. Commit on a new branch ${FLOW_BRANCH}; push nothing and open no pull request.\n${NO_ANSWER}`,
    appendSystemPrompt: null,
    disallowedTools: [],
    budgetUsd: '25',
    timeoutMs: 120 * MINUTE_MS
  };
}

export function sweepCells() {
  return [...reviewCells(reviewerPrompt()), ...buildCells(), ...fixerCells(), ...planCells(), flowCell()];
}

export function selectCells(cells, setNames) {
  for (const name of setNames) {
    if (name !== 'all' && !CELL_SETS.includes(name)) throw new Error(`unknown cell set ${name}; one of all, ${CELL_SETS.join(', ')}`);
  }
  if (setNames.includes('all')) return cells;
  return cells.filter((cell) => setNames.includes(cell.kind));
}

// Every call names this clone as its plugin and the cell's own model and
// effort, so no cell falls back to an effort a settings file or session holds.
export function claudeArguments(cell) {
  const args = [
    '-p', cell.prompt,
    '--plugin-dir', ROOT,
    '--model', cell.model,
    '--effort', cell.effort,
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--max-budget-usd', cell.budgetUsd
  ];
  if (cell.appendSystemPrompt !== null) args.push('--append-system-prompt', cell.appendSystemPrompt);
  if (cell.disallowedTools.length > 0) args.push('--disallowedTools', ...cell.disallowedTools);
  return args;
}
