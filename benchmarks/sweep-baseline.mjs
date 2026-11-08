import { execFileSync } from 'node:child_process';
import { meanCi } from '../lib/eval-stats.mjs';
import { REVIEW_EFFORTS } from './sweep-cells.mjs';
import { comparisonSection, compareToBaseline, parseResultRuns } from '../lib/benchmark-compare.mjs';

export function gitShowBaseline(label) {
  const [file, commit] = label.split('@');
  return execFileSync('git', ['show', `${commit}:${file}`], { encoding: 'utf8' });
}

export function appendComparison({ body, label, table, readBaseline }) {
  const result = compareToBaseline({ baseline: parseResultRuns(readBaseline(label)), candidate: parseResultRuns(table) });
  const lines = ['', ...comparisonSection({ baselineLabel: label, result })];
  return `${body.trimEnd()}\n${lines.join('\n')}\n`;
}

const points = (fraction) => `${Math.round(100 * fraction)}%`;

export function rateText(values) {
  const { mean, se, lo, hi } = meanCi(values);
  if (se === null) return `${points(mean)}, no SE (n=${values.length})`;
  return `${points(mean)} (95% CI ${points(Math.max(0, lo))} to ${points(Math.min(1, hi))}, n=${values.length})`;
}

export function falseAlarmLines(records) {
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

const PLAN_TASK_TRAILER = /^Plan-task: (?:[^/\s]+\/)?(\d+)$/gm;

export function landedTasks(repository) {
  const messages = execFileSync('git', ['-C', repository, 'log', '--all', '--format=%B'], { encoding: 'utf8' });
  const numbers = [...messages.matchAll(PLAN_TASK_TRAILER)].map((match) => match[1]);
  return new Set(numbers).size;
}
