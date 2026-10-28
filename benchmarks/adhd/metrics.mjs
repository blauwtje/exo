import { gateReply } from "./gates.mjs";

const percent = (rows, passes) =>
  rows.length === 0 ? null : (100 * rows.filter(passes).length) / rows.length;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function repoMetrics(rows) {
  const gated = rows.map((row) => ({ ...row, failed: gateReply(row.reply, row.testCase).failed }));
  const passes = (...names) => (row) => names.every((name) => !row.failed.includes(name));
  return {
    medianRatio: median(rows.map((row) => row.ratio)),
    answerFirst: percent(gated, passes("lead", "opener")),
    cleanDeliverable: percent(gated.filter((row) => row.testCase.deliverable !== undefined), passes("deliverable")),
    questionLast: percent(gated.filter((row) => row.testCase.ask === true), passes("question")),
    factsKept: percent(gated, (row) => passes("literals")(row) && row.missing.length === 0),
  };
}
