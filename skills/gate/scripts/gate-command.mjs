import { execFileSync, spawn } from 'node:child_process';
import process from 'node:process';
import { killTree } from '#process-tree';

const PLAIN_SHELL_WORD = /^[\w@%+=:,./-]+$/;

const FAIL_TAIL_LINES = 20;

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

export function runCommand(command, timeoutMs, env = process.env) {
  return new Promise((resolve) => {
    const started = Date.now();
    // why: a detached child leads its own process group, which Windows does not support.
    const child = spawn(command, { shell: true, env, detached: process.platform !== 'win32' });
    let output = '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      killTree(child.pid);
      finish({ ok: false, code: null, signal: null, timedOutMs: timeoutMs, output, ms: Date.now() - started });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => finish({ ok: false, code: error.code ?? error.message, signal: null, output }));
    child.on('close', (code, signal) => finish({ ok: code === 0, code, signal, output, ms: Date.now() - started }));
  });
}

export function failReason({ code, signal, timedOutMs }) {
  if (timedOutMs !== undefined) return `timed out after ${timedOutMs / 1000}s`;
  if (signal !== null) return `signal ${signal}`;
  return typeof code === 'number' ? `exit ${code}` : `spawn error ${code}`;
}

export function outputTail(output) {
  return output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-FAIL_TAIL_LINES).map((line) => `  ${line.slice(0, FAIL_TAIL_LINE_LENGTH)}`);
}

export function failLines(check, reason, output) {
  return [`FAIL ${check} (${reason})`, ...outputTail(output)];
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
