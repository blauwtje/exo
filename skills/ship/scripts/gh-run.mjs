import { execFileSync } from 'node:child_process';

export class GhError extends Error {}

function ghCall(args, parse) {
  try {
    return parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    const errorText = `${error.stderr ?? ''}`.trim() || error.message;
    throw new GhError((errorText.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim());
  }
}

export const ghText = (args) => ghCall(args, (text) => text);

export const ghJson = (args) => ghCall(args, JSON.parse);
