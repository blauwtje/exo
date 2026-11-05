import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { phaseForExit } from './run-state.mjs';
import { appendLog } from './run-session.mjs';
import { averageLines, cacheLines, deniedLines, detailLines, summaryLines } from './run-report.mjs';
import { noteStop } from './run-plan-notes.mjs';

function noteRunEnd(exitCode, stop) {
  if (exitCode === 0) return noteStop({ reason: stop.line });
  noteStop({ phase: phaseForExit(exitCode), reason: stop.line });
}

export function finishRun(ctx, { stop, exitCode: planned, progressFile }) {
  const { say, run } = ctx;
  const exitCode = stop?.parked ? 3 : planned;
  noteRunEnd(exitCode, stop);
  for (const line of averageLines(ctx.landedStats)) say(line);
  say(exitCode === 0 ? 'run done' : `run stopped: ${stop.why ?? 'final check failed'}`);
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
