// benchmarks/sweep-score.mjs
// Reads what a sweep cell left behind and writes the results file: the
// reviewer's verdict and counts, the plan-spec rules a written plan breaks,
// the whole-flow cell's drift reports, the false-alarm rate and the winning
// plan cell. sweep.mjs runs the cells; nothing here starts a process.

import { REVIEW_EFFORTS, SWEEP_MODELS } from './sweep-cells.mjs';

const PLAN_SECTIONS = ['## Goal', '## Plan basis', '## Non-goals', '## Context', '## Tasks', '## Final verification'];
const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b|similar to Task \d/i;
const COUNT_ENTRY = /(\d+)\s*(defect|hazard|question)s?|(defect|hazard|question)s?\s*[:=]?\s*(\d+)/g;

// The reviewer's report opens with its verdict and holds one `Count:` line,
// read in either order: `1 defect` or `defect: 1`.
export function parseReview(text) {
  const verdict = /\b(CLEAN|FIXED|BLOCKED)\b/.exec(text)?.[1] ?? null;
  const countLine = text.split('\n').find((line) => /^\W*Count:/.test(line));
  if (countLine === undefined) return { verdict, counts: null };
  const counts = { defect: 0, hazard: 0, question: 0 };
  for (const match of countLine.matchAll(COUNT_ENTRY)) {
    const weight = match[2] ?? match[3];
    counts[weight] = Number(match[1] ?? match[4]);
  }
  return { verdict, counts };
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

function falseAlarmLines(records) {
  const controls = records.filter((record) => record.kind === 'review' && record.variant === 'control');
  const measured = controls.filter((record) => record.falseAlarms !== null);
  if (measured.length === 0) return ['No control review cell left a report, so the false-alarm rate is unmeasured and plan 5 (C2) has no gate yet.'];
  const alarmed = measured.filter((record) => record.falseAlarms > 0).length;
  const perEffort = REVIEW_EFFORTS.map((effort) => {
    const cells = measured.filter((record) => record.effort === effort);
    const hits = cells.filter((record) => record.falseAlarms > 0).length;
    return `${effort} ${hits}/${cells.length}`;
  });
  const percent = Math.round((100 * alarmed) / measured.length);
  return [
    `Reviewer false-alarm rate: ${alarmed}/${measured.length} control branches (${percent}%) drew at least one defect or hazard finding (${perEffort.join(', ')}). Plan 5 (C2) is gated on this rate.`,
    '',
    `Unmeasured: ${controls.length - measured.length} control cells left no report.`
  ];
}

function comparePlans(left, right) {
  if (left.defectsFound !== right.defectsFound) return left.defectsFound - right.defectsFound;
  return (left.tokens ?? Number.MAX_SAFE_INTEGER) - (right.tokens ?? Number.MAX_SAFE_INTEGER);
}

// A plan cell that wrote no plan carries null breaches and takes no part in
// the ranking, so an empty cell never outranks a written plan.
function planLine(records) {
  const plans = records.filter((record) => record.kind === 'plan' && record.defectsFound !== null);
  if (plans.length === 0) return 'No plan cell wrote a plan, so Fable 5.1 routing stays unsettled.';
  const winner = [...plans].sort(comparePlans)[0];
  const winnerText = `Winning plan cell: ${winner.id} (${winner.defectsFound} rule breaches, ${shown(winner.tokens)} tokens).`;
  const opus = plans.find((record) => record.model === SWEEP_MODELS.opus && record.effort === 'high');
  if (opus === undefined) return `${winnerText} The Opus 5.5 high cell wrote no plan, so Fable 5.1 routing stays unsettled.`;
  const fableEfforts = plans
    .filter((record) => record.model === SWEEP_MODELS.fable && comparePlans(record, opus) < 0)
    .map((record) => record.effort);
  const fable = fableEfforts.length === 0 ? 'no effort' : fableEfforts.join(' and ');
  return `${winnerText} Fable 5.1 beats Opus 5.5 at high at ${fable}.`;
}

function flowLine(records) {
  const flow = records.find((record) => record.kind === 'flow');
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
    '- Defects found means, per kind: review seeded, the seeded defect fixed; build, the fixture check failing on the built code; plan, rule breaches; flow, defects the branch review reported.',
    '- A seeded review cell counts its defect as found only when the fixture check passes after the reviewer fixed the branch; a control branch carries the reference solution, so every defect or hazard it draws counts as a false alarm.',
    '- A plan cell counts the plan-spec rules a script can check; whether its code runs is not measured.',
    '- Tokens weigh input as the savings record does, summed over the main thread and every delegate; cost is the client-side list-price estimate.',
    ''
  ].join('\n');
}
