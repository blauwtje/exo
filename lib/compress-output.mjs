// Tool-output compression for the Bash dispatcher. `wrapCommand` is a
// PreToolUse step: for a known noisy command (test, build, install, log) it
// returns `updatedInput` that runs the command through this file's runner.
// The runner keeps failure lines, the summary tail and the exit code, and
// writes the full output to a `.exo/output/` file it names, so nothing is lost.
// Run as `node lib/compress-output.mjs <command> [<arg>...]` it is that runner.
//
// Trust boundary: the command string comes from the model. Only a command made
// of plain words is wrapped, so the runner receives it as an argument list and
// starts it without a shell; any quote, expansion, pipe, redirect, separator or
// newline leaves the command untouched. A `cd <path> &&` prefix is kept.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { scratchPath } from '#scratch-path';
import { isMain } from './script-flags.mjs';
import { settingValue } from '#settings-store';

const RUNNER = fileURLToPath(import.meta.url);
const WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const PACKAGE_VERBS = new Set(['test', 't', 'install', 'i', 'ci', 'add', 'build']);
const PACKAGE_SCRIPTS = /^(test|build|lint|check|typecheck)(:[\w-]+)?$/;
const INTERACTIVE = /^(--watch|--watchAll|-w|watch|--interactive|-i)$/;
const FULL_LINES = 40;
const FAILURE_LINES = 60;
const TAIL_LINES = 15;
const FAILURE = /\b(fail(ed|ures?)?|error|errors|panic|exception|traceback|assertion)\b|✖|not ok|\bERR!|\bFAIL\b/i;

// True when `words` (the command split on blanks) is a known noisy command.
export function isNoisy(words) {
  const [head, second, third] = words;
  if (words.some((word) => INTERACTIVE.test(word))) return false;
  if (head === undefined || head.includes('=')) return false;
  if (PACKAGE_MANAGERS.has(head)) {
    if (second === 'run') return PACKAGE_SCRIPTS.test(third ?? '');
    return PACKAGE_VERBS.has(second);
  }
  if (head === 'node') return words.includes('--test');
  if (head === 'python' || head === 'python3') return second === '-m' && third === 'pytest';
  if (head === 'pip' || head === 'pip3') return second === 'install';
  if (head === 'cargo') return ['test', 'build', 'check', 'clippy'].includes(second);
  if (head === 'go') return ['test', 'build', 'vet'].includes(second);
  if (head === 'docker' || head === 'kubectl') return second === 'logs';
  if (head === 'git') return second === 'log';
  return ['pytest', 'jest', 'vitest', 'tsc', 'journalctl'].includes(head);
}

function shellQuote(text) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

// `{ prefix, words }` for a command of plain words, or null for anything else.
function plainCommand(command) {
  let rest = command.trim();
  let prefix = '';
  const cd = /^cd\s+(\S+)\s+&&\s+/.exec(rest);
  if (cd && WORD.test(cd[1])) {
    prefix = `cd ${cd[1]} && `;
    rest = rest.slice(cd[0].length);
  }
  const words = rest.split(/[ \t]+/);
  if (!words.every((word) => WORD.test(word))) return null;
  return { prefix, words };
}

function compressionLevel() {
  try {
    return settingValue('compression');
  } catch {
    return 'off';
  }
}

/**
 * A PreToolUse output with `updatedInput` running a noisy Bash command through
 * the runner, or null: compression off, a background or compound command, or a
 * command that is not a known test, build, install or log command.
 */
export function wrapCommand(hookInput, level = compressionLevel()) {
  if (level !== 'low' && level !== 'high') return null;
  if (hookInput?.tool_name !== 'Bash') return null;
  const input = hookInput.tool_input;
  if (typeof input?.command !== 'string' || input.run_in_background === true) return null;
  const plain = plainCommand(input.command);
  if (plain === null || !isNoisy(plain.words)) return null;
  const wrapped = `${plain.prefix}node ${shellQuote(RUNNER)} ${plain.words.join(' ')}`;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...input, command: wrapped }
    }
  };
}

/**
 * The text the model sees for `output`: all of it when short, else the failure
 * lines, the summary tail, the exit code and the file holding everything.
 */
export function condense(output, code, file) {
  const lines = output.replace(/\n$/, '').split('\n');
  const footer = `exit ${code}; full output: ${file}`;
  if (lines.length <= FULL_LINES) return `${lines.join('\n')}\n${footer}\n`;
  const tailStart = lines.length - TAIL_LINES;
  const failures = lines.slice(0, tailStart).filter((line) => FAILURE.test(line)).slice(0, FAILURE_LINES);
  const kept = [`[${lines.length} lines, compressed]`, ...failures];
  if (failures.length > 0) kept.push('...');
  return `${[...kept, ...lines.slice(tailStart)].join('\n')}\n${footer}\n`;
}

function outputFile(cwd) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return scratchPath(cwd, path.join('output', `${stamp}-${process.pid}.log`));
}

// Starts `argv` without a shell, captures stdout and stderr in arrival order,
// writes it all to the output file and prints the condensed text. Resolves to
// the command's exit code.
export function runCompressed(argv, cwd = process.cwd()) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['inherit', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => {
      process.stderr.write(`compress-output: ${error.message}\n`);
      resolve(127);
    });
    child.on('close', (status, signal) => {
      const code = status ?? (signal ? 128 : 1);
      const output = Buffer.concat(chunks).toString('utf8');
      let file;
      try {
        file = outputFile(cwd);
        fs.writeFileSync(file, output);
      } catch {
        process.stdout.write(output);
        resolve(code);
        return;
      }
      process.stdout.write(condense(output, code, file));
      resolve(code);
    });
  });
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  process.exitCode = argv.length === 0 ? 2 : await runCompressed(argv);
}
