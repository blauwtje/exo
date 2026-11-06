import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { appendLog } from './run-session.mjs';
import { averageLines, receiptLines, cacheLines, deniedLines, detailLines, summaryLines } from './run-report.mjs';
import { stopRun } from './run-plan-stops.mjs';

export function finishRun(ctx, { stop, exitCode: planned, progressFile }) {
  const { say, run } = ctx;
  const exitCode = stopRun(ctx, stop, planned);
  for (const line of averageLines(ctx.landedStats)) say(line);
  for (const line of receiptLines(ctx.spendLog ?? [])) say(line);
  if (exitCode === 0) appendLog(progressFile, 'RUN COMPLETE\n');

  const detail = detailLines(run, stop);
  const stopLine = detail.pop();
  const cacheReport = run.records.flatMap((record) => cacheLines(record, run.cacheWriteBar).map((line) => `${record.task === null ? `Iteration ${record.iteration} ${record.kind}` : `Task ${record.task}`}: ${line}`));
  appendLog(path.join(run.logDir, 'summary.txt'), `${[...detail, ...cacheReport, stopLine].join('\n')}\n`, fs.writeFileSync);
  const refused = deniedLines(run.records);
  if (process.env.EXO_RUN_DIR && refused.length > 0) appendLog(path.join(process.env.EXO_RUN_DIR, 'denied.txt'), `${refused.join('\n')}\n`);
  process.stdout.write(`${summaryLines(run, stop).join('\n')}\n`);
  return exitCode;
}
