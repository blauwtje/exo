import process from 'node:process';
import { workerSize } from '#worker-size';

export const INLINE_LINE = 'Run your single unit yourself and spawn no worker: this provider bills each spawn a cold prefix.';

export function inlineSingleWorker(input) {
  if (process.env.EXO_PROVIDER !== 'deepseek' || input.subagent_type !== 'exo:orchestrator') return input;
  const prompt = input.prompt ?? '';
  if (prompt.includes(INLINE_LINE) || workerSize({ prompt }).workers !== 1) return input;
  return { ...input, prompt: `${prompt.trimEnd()}\n${INLINE_LINE}` };
}
