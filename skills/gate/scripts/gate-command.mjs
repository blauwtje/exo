import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { runBounded } from '../../../lib/bounded-command.mjs';

const PLAIN_SHELL_WORD = /^[\w@%+=:,./-]+$/;

const FAIL_TAIL_LINES = 20;
export const CHECK_LINE = /^\s*\[(?:FAIL|WARN|UNRUN)\]/;

const FAIL_TAIL_LINE_LENGTH = 300;

const SNAKE_CASE_WORD = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

// why: a POSIX shell returns 127 for a command it cannot find.
const COMMAND_NOT_FOUND = 127;

export function unmarkedMcpTool(command, { code, output }) {
  if (code !== COMMAND_NOT_FOUND) return null;
  const word = command.split(/\s/, 1)[0];
  if (!SNAKE_CASE_WORD.test(word)) return null;
  return new RegExp(`\\b${word}: (?:command )?not found`).test(output) ? word : null;
}

export function gitOutput(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

export function commandLine(argv) {
  const quoted = (word) => `"${word.replace(/["\\$`]/g, '\\$&')}"`;
  const args = argv.slice(2).map((word) => (PLAIN_SHELL_WORD.test(word) ? word : quoted(word)));
  return ['node', quoted(argv[1]), ...args].join(' ');
}

export const runCommand = runBounded;

export function failReason({ code, signal, timedOutMs }) {
  if (timedOutMs !== undefined) return `timed out after ${timedOutMs / 1000}s`;
  if (signal !== null) return `signal ${signal}`;
  return typeof code === 'number' ? `exit ${code}` : `spawn error ${code}`;
}

export function outputTail(output) {
  return output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-FAIL_TAIL_LINES).map((line) => `  ${line.slice(0, FAIL_TAIL_LINE_LENGTH)}`);
}

export function failLines(check, reason, output) {
  const tail = outputTail(output);
  const named = output.split(/\r?\n/).filter((line) => CHECK_LINE.test(line)).map((line) => `  ${line.trim().slice(0, FAIL_TAIL_LINE_LENGTH)}`);
  return [`FAIL ${check} (${reason})`, ...named.filter((line) => !tail.includes(line)), ...tail];
}

export async function mapLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
