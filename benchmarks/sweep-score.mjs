// benchmarks/sweep-score.mjs
// Reads what a sweep cell left behind and writes the results file: the
// reviewer's verdict and counts, the plan-spec rules a written plan breaks,
// the whole-flow cell's drift reports, the false-alarm rate and the winning
// plan cell. sweep.mjs runs the cells; nothing here starts a process.

import { meanCi, pairedDiff } from '../lib/eval-stats.mjs';
import { REVIEW_EFFORTS, SWEEP_MODELS } from './sweep-cells.mjs';

const PLAN_SECTIONS = ['## Goal', '## Plan basis', '## Non-goals', '## Context', '## Tasks', '## Final verification'];
const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b|similar to Task \d/i;
const FINDING_LINE = /^\W*([\w./-]+):(\d+)(?:-(\d+))?\b.*\b(fixed|fix|report)\W*$/;
const COUNT_ENTRY = /(\d+)\s*(defect|concern|question)s?|(defect|concern|question)s?\s*[:=]?\s*(\d+)/g;

// The reviewer's report opens with its verdict and holds one `Count:` line,
// read in either order: `1 defect` or `defect: 1`.
export function parseReview(text) {
  const verdict = /\b(CLEAN|FIXED|FINDINGS|BLOCKED)\b/.exec(text)?.[1] ?? null;
  const findings = text.split('\n').flatMap((line) => {
    const match = FINDING_LINE.exec(line);
    if (match === null) return [];
    const start = Number(match[2]);
    return [{ file: match[1], start, end: match[3] === undefined ? start : Number(match[3]), action: match[4] === 'fixed' ? 'fix' : match[4] }];
  });
  const countLine = text.split('\n').find((line) => /^\W*Count:/.test(line));
  if (countLine === undefined) return { verdict, counts: null, findings };
  const counts = { defect: 0, concern: 0, question: 0 };
  for (const match of countLine.matchAll(COUNT_ENTRY)) {
    const weight = match[2] ?? match[3];
    counts[weight] = Number(match[1] ?? match[4]);
  }
  return { verdict, counts, findings };
}

export function overlaps(finding, range) {
  return finding.file === range.file && finding.start <= range.end && range.start <= finding.end;
}

// The plan-spec rules a script can see: the header sections, the Walkthrough
// line, Depends on, a Commit block and the Plan-task trailer per task, Run and
// Expected per step, and no placeholder.
export function lintPlan(text) {
  const defects = [];
  const lines = text.split('\n');
  for (const section of PLAN_SECTIONS) {
    if (!lines.includes(section)) defects.push(`missing ${section}`);
  }
  if (!lines.some((line) => /^-?\s*Walkthrough:/.test(line))) defects.push('missing Walkthrough line');
  const tasks = text.split(/^### Task (?=\d+:)/m).slice(1);
  if (tasks.length === 0) defects.push('no tasks');
  for (const task of tasks) {
    const number = task.split(':')[0];
    if (!/^Depends on:/m.test(task)) defects.push(`Task ${number}: no Depends on line`);
    if (!/^Commit:/m.test(task)) defects.push(`Task ${number}: no Commit block`);
    if (!new RegExp(`Plan-task: ${number}\\b`).test(task)) defects.push(`Task ${number}: no Plan-task trailer`);
    const steps = task.split(/^Step (?=\d+:)/m).slice(1);
    if (steps.length === 0) defects.push(`Task ${number}: no steps`);
    for (const step of steps) {
      const stepNumber = step.split(':')[0];
      if (!/^Run:/m.test(step)) defects.push(`Task ${number} Step ${stepNumber}: no Run line`);
      if (!/^Expected:/m.test(step)) defects.push(`Task ${number} Step ${stepNumber}: no Expected line`);
    }
  }
  for (const line of lines) {
    if (PLACEHOLDER.test(line)) defects.push(`placeholder: ${line.trim()}`);
  }
  return defects;
}

export function countDriftReports(text) {
  return new Set(text.match(/PLAN DRIFT: Task \d+/g) ?? []).size;
}

// The review stages a flow run dispatched and the first merged verdict's fix
// and concern counts, so an A/B can pair runs by stage mix: verify runs
// fix-review and the fix-diff review only when that verdict holds a fix or concern.
export function reviewStages(subagents, text) {
  const types = (subagents ?? []).map((name) => String(name).replace(/^.*:/, ''));
  const verdict = text.match(/verdict=FINDINGS[^"\\]*/)?.[0] ?? '';
  const count = (key) => {
    const found = verdict.match(new RegExp(`\\b${key}=(\\d+)`));
    return found ? Number(found[1]) : null;
  };
  return {
    reviewBranch: types.filter((type) => type === 'review-branch').length,
    fixReview: types.filter((type) => type === 'fix-review').length,
    fix: count('fix'),
    concern: count('concern')
  };
}

function shown(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function money(value) {
  return value === null ? '-' : `$${value.toFixed(3)}`;
}

function seconds(record) {
  const text = `${Math.round(record.wallMs / 1000)}s`;
  return record.timedOut ? `${text} (timed out)` : text;
}

function tableRow(record) {
  const cells = [
    record.id, record.model, record.effort, shown(record.defectsFound), shown(record.falseAlarms),
    shown(record.tokens), seconds(record), money(record.costUsd), record.detail.replaceAll('|', '/')
  ];
  return `| ${cells.join(' | ')} |`;
}

const points = (fraction) => `${Math.round(100 * fraction)}%`;

function rateText(values) {
  const { mean, se, lo, hi } = meanCi(values);
  if (se === null) return `${points(mean)}, no SE (n=${values.length})`;
  return `${points(mean)} (95% CI ${points(Math.max(0, lo))} to ${points(Math.min(1, hi))}, n=${values.length})`;
}

function falseAlarmLines(records) {
  const controls = records.filter((record) => record.kind === 'review' && record.variant === 'control');
  const measured = controls.filter((record) => record.falseAlarms !== null && !record.timedOut);
  if (measured.length === 0) return ['No control review cell left a report, so the false-alarm rate is unmeasured and plan 5 (C2) has no gate yet.'];
  const alarmed = measured.filter((record) => record.falseAlarms > 0).length;
  const perEffort = REVIEW_EFFORTS.map((effort) => {
    const cells = measured.filter((record) => record.effort === effort);
    const hits = cells.filter((record) => record.falseAlarms > 0).length;
    return `${effort} ${hits}/${cells.length}`;
  });
  const rate = rateText(measured.map((record) => Number(record.falseAlarms > 0)));
  return [
    `Reviewer false-alarm rate: ${alarmed}/${measured.length} control branches, ${rate}, drew at least one defect or concern finding (${perEffort.join(', ')}). Plan 5 (C2) is gated on this rate.`,
    '',
    `Unmeasured: ${controls.length - measured.length} control cells left no report or timed out, left out of the rate.`
  ];
}

const replayFailed = (record) => record.timedOut || record.hits === null;

function replayRow(model, replays) {
  const cells = replays.filter((record) => record.model === model && record.truth > 0);
  const failed = cells.filter(replayFailed).length;
  const hits = cells.reduce((sum, record) => sum + (replayFailed(record) ? 0 : record.hits), 0);
  const truth = cells.reduce((sum, record) => sum + record.truth, 0);
  const reported = cells.filter((record) => !replayFailed(record));
  const extra = reported.reduce((sum, record) => sum + record.extra, 0);
  const rate = cells.length === 0 ? '-' : rateText(cells.map((record) => (replayFailed(record) ? 0 : record.hits / record.truth)));
  return `| ${model} | ${cells.length} | ${hits}/${truth} | ${rate} | ${failed} | ${extra} (excl. ${failed} cells) |`;
}

function replayLines(records) {
  const replays = records.filter((record) => record.kind === 'replay');
  if (replays.length === 0) return ['No replay cell ran.'];
  const models = [...new Set(replays.map((record) => record.model))];
  return ['| Model | Cells | Known defects hit | Hit rate per cell | Failed cells | Other fix findings |', '|---|---|---|---|---|---|', ...models.map((model) => replayRow(model, replays))];
}

function comparePlans(left, right) {
  if (left.defectsFound !== right.defectsFound) return left.defectsFound - right.defectsFound;
  return (left.tokens ?? Number.MAX_SAFE_INTEGER) - (right.tokens ?? Number.MAX_SAFE_INTEGER);
}

function planTasks(plans) {
  return [...new Set(plans.map((record) => record.task ?? 'flow-request'))];
}

function meanBreaches(plans, task, match) {
  const found = plans.filter((record) => (record.task ?? 'flow-request') === task && match(record));
  return found.length === 0 ? null : found.reduce((sum, record) => sum + record.defectsFound, 0) / found.length;
}

function fableVersusOpus(plans, effort) {
  const tasks = planTasks(plans);
  const pairs = tasks
    .map((task) => [meanBreaches(plans, task, (record) => record.model === SWEEP_MODELS.opus && record.effort === 'high'), meanBreaches(plans, task, (record) => record.model === SWEEP_MODELS.fable && record.effort === effort)])
    .filter((pair) => !pair.includes(null));
  if (pairs.length < 2) return `Fable 5.1 at ${effort} against Opus 5.5 at high: no SE (${pairs.length} plan task, one run per cell; the cells are not enough for a verdict).`;
  const { mean, lo, hi } = pairedDiff(pairs);
  const verdict = hi < 0 ? 'fewer breaches' : lo > 0 ? 'more breaches' : 'crosses zero';
  return `Fable 5.1 at ${effort} against Opus 5.5 at high: ${mean.toFixed(2)} breaches (95% CI ${lo.toFixed(2)} to ${hi.toFixed(2)}, paired over ${pairs.length} tasks), ${verdict}.`;
}

function planLine(records) {
  const all = records.filter((record) => record.kind === 'plan');
  const plans = all.filter((record) => record.defectsFound !== null);
  if (plans.length === 0) return 'No plan cell wrote a plan, so Fable 5.1 routing stays unsettled.';
  const winner = [...plans].sort(comparePlans)[0];
  const winnerText = `Winning plan cell: ${winner.id} (${winner.defectsFound} rule breaches, ${shown(winner.tokens)} tokens; ${all.length - plans.length} cells wrote no plan and are left out).`;
  const opus = plans.find((record) => record.model === SWEEP_MODELS.opus && record.effort === 'high');
  if (opus === undefined) return `${winnerText} The Opus 5.5 high cell wrote no plan, so Fable 5.1 routing stays unsettled.`;
  const efforts = [...new Set(plans.filter((record) => record.model === SWEEP_MODELS.fable).map((record) => record.effort))];
  if (efforts.length === 0) return `${winnerText} No Fable 5.1 cell wrote a plan, so the routing stays unsettled.`;
  return [winnerText, ...efforts.map((effort) => fableVersusOpus(plans, effort))].join(' ');
}

function flowLine(records) {
  const flow = records.find((record) => record.id === 'flow-c7');
  if (flow === undefined) return 'The whole-flow cell did not run.';
  return `Whole flow (C7) on ${flow.model} at ${flow.effort}: ${flow.detail}; ${shown(flow.defectsFound)} review defects, ${money(flow.costUsd)}, ${seconds(flow)}.`;
}

export function resultsMarkdown(meta, records) {
  return [
    `# Model and effort sweep, ${meta.date}`,
    '',
    `${records.length} cells, one \`claude -p\` process each with the model and effort its row names, n=1. Claude Code ${meta.claudeVersion}, Node ${meta.node}. The raw cells sit under \`benchmarks/runs/\`, which is git-ignored.`,
    '',
    '| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |',
    '|---|---|---|---|---|---|---|---|---|',
    ...records.map(tableRow),
    '',
    '## Reviewer false alarms',
    '',
    ...falseAlarmLines(records),
    '',
    '## Replayed reviews',
    '',
    ...replayLines(records),
    '',
    '## Planning',
    '',
    planLine(records),
    '',
    '## Whole flow',
    '',
    flowLine(records),
    '',
    '## Limitations',
    '',
    '- Each cell ran once, so a difference of one finding between two cells is within noise.',
    '- Defects found means, per kind: review seeded, a `fix` finding overlapping the seeded defect; build, the fixture check failing on the built code; plan, rule breaches; flow, defects the branch review reported.',
    '- A seeded review cell counts its defect as found only when a `fix` finding overlaps the lines of the defect; a control branch carries the reference solution, so every `fix` finding it draws counts as a false alarm.',
    '- A plan cell counts the plan-spec rules a script can check; whether its code runs is not measured.',
    '- Tokens weigh input as token-weights.mjs does, summed over the main thread and every delegate; cost is the client-side list-price estimate.',
    ''
  ].join('\n');
}
