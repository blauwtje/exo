import { execFileSync } from 'node:child_process';

export const GH_ERROR_EXIT = 3;
export const PR_NUMBER = /^[1-9][0-9]*$/;

export class GhError extends Error {}

export function firstLine(text) {
  return (text.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim();
}

function ghCall(args, parse) {
  try {
    return parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    const errorText = `${error.stderr ?? ''}`.trim() || error.message;
    throw new GhError(`gh ${args.join(' ')}: ${firstLine(errorText)}`);
  }
}

export const ghText = (args) => ghCall(args, (text) => text);

export const ghJson = (args) => ghCall(args, JSON.parse);
