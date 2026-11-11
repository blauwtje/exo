import { environmentMs } from '#script-flags';
import { runCheckAsync } from '../../../lib/run-check.mjs';
import { appendTimeline } from '../../../lib/timeline.mjs';

export async function checkRun(root, command, { variable, defaultMs }, record = true) {
  const timeoutMs = environmentMs(variable, defaultMs);
  appendTimeline(root, 'gate-step-start');
  const run = await runCheckAsync(root, command, { timeoutMs, record });
  appendTimeline(root, 'gate-step-end');
  return { ...run, timedOutMs: run.timedOut ? timeoutMs : undefined };
}
