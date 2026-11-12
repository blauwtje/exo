import fs from 'node:fs';
import { median, pairedDiff } from '../../lib/eval-stats.mjs';
import { caseRowOf } from './quick-report.mjs';
import { repoMetrics } from './metrics.mjs';

const percentLabel = (value) => (value === null ? 'n/a' : `${value.toFixed(1)}%`);

function summarizeSide(cases, rows) {
  const caseRows = cases.map((c) => caseRowOf(rows.filter((row) => row.testCase === c)));
  const metrics = { ...repoMetrics(rows), medianRatio: median(caseRows.map((row) => row.ratio)), billedMedianRatio: median(caseRows.map((row) => row.billedRatio)) };
  const perCase = caseRows.map((row) => ({ id: row.testCase.id, reply: row.reply, tokens: row.tokens, baselineTokens: row.baselineTokens, visible: row.visible, baselineVisible: row.baselineVisible, ratio: row.ratio, ratios: row.ratios, failed: row.failed, missing: row.missing, answers: row.answers }));
  return { ...metrics, perCase };
}

const strictShare = (p) => p.answers.filter((a) => !a.failed.includes('literals') && a.missing.length === 0).length / p.answers.length;

function pairedOf(basePerCase, candidatePerCase) {
  const pairs = (value) => basePerCase.map((b, at) => [value(b), value(candidatePerCase[at])]);
  return { factsKept: pairedDiff(pairs(strictShare)), ratio: pairedDiff(pairs((p) => p.ratio)) };
}

export const summaryLine = ({ medianRatio, answerFirst, cleanDeliverable, questionLast, factsKept, factsShare }) => `median_ratio=${medianRatio.toFixed(3)} answer_first=${percentLabel(answerFirst)} clean_deliverable=${percentLabel(cleanDeliverable)} question_last=${percentLabel(questionLast)} facts_kept=${percentLabel(factsKept)} facts_share=${percentLabel(factsShare)}\n`;

export const quickCaseLine = (p, prefix = '') => `${prefix}${p.id} ratio=${p.ratio.toFixed(3)} visible=${Math.round(p.visible)}/${Math.round(p.baselineVisible)} billed=${p.tokens}/${Math.round(p.baselineTokens)} failed=${p.failed.join(',') || 'none'} missing=${p.missing.map((k) => k + 1).join(',') || 'none'}\n`;

const pairedLine = (name, interval) => `paired ${name} candidate-base mean=${interval.mean.toFixed(3)} ci95 ${interval.lo?.toFixed(3)}..${interval.hi?.toFixed(3)} n=${interval.n}\n`;

export function summaryOf({ opts, cases, rows }) {
  const candidate = summarizeSide(cases, rows.filter((row) => row.side === 'candidate'));
  if (!opts.baseStyle) return candidate;
  const base = summarizeSide(cases, rows.filter((row) => row.side === 'base'));
  return { ...candidate, baseStyle: opts.baseStyle, base, paired: pairedOf(base.perCase, candidate.perCase) };
}

export function baseLines({ base, paired }) {
  if (!base) return '';
  return `base ${summaryLine(base)}${base.perCase.map((p) => quickCaseLine(p, 'base ')).join('')}${pairedLine('facts_kept', paired.factsKept)}${pairedLine('ratio', paired.ratio)}`;
}

export function assertBaseStyle(argv, opts) {
  if (opts.mode !== 'quick') throw new Error('--base-style cannot combine with a full-run flag');
  if (opts.ablate !== null) throw new Error('--base-style cannot combine with --ablate');
  if (opts.arm === 'caveman') throw new Error('--base-style cannot combine with --arm caveman');
  if (!fs.existsSync(opts.baseStyle)) throw new Error(`--base-style file is missing: ${opts.baseStyle}`);
}
