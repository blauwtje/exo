import { TIMEOUT_MS } from './pressure-run.mjs';

export const ANSWER_FILE = /^(.+)-([^-]+)-([^-]+)-(\d+)\.md$/;

export function answerText(outcome) {
  const stderr = outcome.stderr.trim() || 'empty';
  if (outcome.setupExit !== undefined) return `(setup failed: exit ${outcome.setupExit})\n\nstderr:\n${stderr}\n`;
  if (outcome.timedOut) return `(timed out after ${TIMEOUT_MS / 1000}s)\n\nstderr:\n${stderr}\n`;
  if (outcome.finalText === undefined) return `(no result)\n\nstderr:\n${stderr}\n`;
  return outcome.finalText;
}

export function fileSafe(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}
