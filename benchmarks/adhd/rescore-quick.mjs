import { summaryOf } from './paired.mjs';

const judged = ({ answer }) => !answer.failed.includes('literals');

const sidesOf = (log) => (log.baseStyle ? [['candidate', log], ['base', log.base]] : [['candidate', log]]);

const jobsOf = (log, cases) => sidesOf(log).flatMap(([side, record]) => record.perCase.flatMap((p) => p.answers.map((answer) => ({ c: cases.find((c) => c.id === p.id), p, answer, side }))));

function storedJobs(log, cases) {
  return jobsOf(log, cases).filter((job) => job.c);
}

function projectedJudgeUsd(log, jobs) {
  const total = jobsOf(log, []).filter(judged).length;
  return (log.judge_cost_usd / Math.max(1, total)) * jobs.filter(judged).length;
}

export const rowOfJob = ({ c, p, answer, side }, missing) => ({ testCase: c, reply: answer.text, tokens: answer.billed, baselineTokens: p.baselineTokens, visible: answer.visible, baselineVisible: p.baselineVisible, billedRatio: answer.billed / p.baselineTokens, ratio: answer.visible / p.baselineVisible, missing, side });

function assertJudgeBudget(log, jobs, maxUsd) {
  const projected = projectedJudgeUsd(log, jobs);
  process.stderr.write(`projected_judge_usd=${projected.toFixed(4)} answers=${jobs.filter(judged).length}\n`);
  if (projected > maxUsd) throw new Error(`projected_judge_usd=${projected.toFixed(4)} over --max-usd ${maxUsd}`);
}

export async function rescoreQuick({ log, cases, file, maxUsd, judgeOne }) {
  const jobs = storedJobs(log, cases.filter((c) => log.cases.includes(c.id)));
  assertJudgeBudget(log, jobs, maxUsd);
  const rows = await Promise.all(jobs.map(async (job) => rowOfJob(job, judged(job) ? await judgeOne(job.c, job.answer.text) : [])));
  const chosen = [...new Set(jobs.map((job) => job.c))];
  return { mode: 'quick', arm: log.arm, answers: log.answers, ablate: log.ablate, model: log.model, cases: chosen.map((c) => c.id), ...summaryOf({ opts: { baseStyle: log.baseStyle }, cases: chosen, rows }), rescoredFrom: file };
}
