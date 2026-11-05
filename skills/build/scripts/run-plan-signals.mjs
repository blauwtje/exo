import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { failureLine } from '#attempt-fingerprint';
import { appendLog } from './run-session.mjs';
import { detailLines } from './run-report.mjs';
import { phaseForExit } from './run-state.mjs';
import { noteStop } from './run-plan-notes.mjs';

const STOP_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];

function stopRecorder(ctx) {
  const { run, say } = ctx;
  return (signal) => {
    const landLine = ctx.currentTask !== null && ctx.lastLandTask === ctx.currentTask ? failureLine(ctx.lastLandOutput) : '';
    const stop = { line: `stopped by ${signal}${landLine === '' ? '' : `; land-task: ${landLine.replace(/^land-task: /, '')}`}`, why: `stopped by ${signal}` };
    noteStop({ phase: phaseForExit(1), reason: stop.line });
    say(`run stopped: ${stop.why}`);
    appendLog(path.join(run.logDir, 'summary.txt'), `${detailLines(run, stop).join('\n')}\n`, fs.writeFileSync);
    process.stdout.write(`run-plan: stop: ${stop.line}\n`);
    if (ctx.liveSessions === 0) process.exit(1);
  };
}

export function watchStopSignals(ctx) {
  const onStopSignal = stopRecorder(ctx);
  for (const signal of STOP_SIGNALS) process.once(signal, onStopSignal);
  return () => {
    for (const signal of STOP_SIGNALS) process.off(signal, onStopSignal);
  };
}
