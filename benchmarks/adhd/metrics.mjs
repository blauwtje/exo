import { gateReply } from "./gates.mjs";

const percent = (rows, passes) =>
  rows.length === 0 ? null : (100 * rows.filter(passes).length) / rows.length;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function factsShare(gated) {
  const total = gated.reduce((sum, row) => sum + row.testCase.facts.length, 0);
  if (total === 0) return null;
  const kept = gated.reduce((sum, row) => sum + (row.failed.includes("literals") ? 0 : row.testCase.facts.length - row.missing.length), 0);
  return (100 * kept) / total;
}

export function repoMetrics(rows) {
  const gated = rows.map((row) => ({ ...row, failed: gateReply(row.reply, row.testCase).failed }));
  const passes = (...names) => (row) => names.every((name) => !row.failed.includes(name));
  return {
    medianRatio: median(rows.map((row) => row.ratio)),
    billedMedianRatio: median(rows.map((row) => row.billedRatio)),
    answerFirst: percent(gated, passes("lead", "opener")),
    cleanDeliverable: percent(gated.filter((row) => row.testCase.deliverable !== undefined), passes("deliverable")),
    questionLast: percent(gated.filter((row) => row.testCase.ask === true), passes("question")),
    factsKept: percent(gated, (row) => passes("literals")(row) && row.missing.length === 0),
    factsShare: factsShare(gated),
  };
}

export const QUICK_USD_PER_CASE = 0.04;
export const quickMaxUsd = (caseIds) => Number((caseIds.length * QUICK_USD_PER_CASE).toFixed(4));
