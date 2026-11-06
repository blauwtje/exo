import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { shellQuote } from '#basics';
import { greenCommit } from '#check-cache';
import { memoryDirectory } from '#memory-store';

const TEST_LIKE = /test|e2e|\bcheck(?!out)|lint|verify/;
const LAUNCHERS = new Set(['npx', 'pnpm', 'yarn', 'npm', 'bun', 'bunx', 'make', 'uv', 'poetry', 'python', 'python3', 'run', 'exec', '-m']);
const REMOTE_PROGRAMS = new Set(['gh', 'curl', 'wget', 'http', 'https', 'ssh', 'scp', 'kubectl', 'helm', 'aws', 'gcloud', 'az', 'docker', 'nc', 'ping', 'git']);
const KEY_FILLER = new Set(['run', 'exec', '-m']);
const REDIRECTION = /&?\d*>>?&?\s*\S+/g;
const ENV_ASSIGNMENT = /^\w+=/;
const BARE_NAME = /^[\w:.-]+$/;
const NOT_A_SUITE = /--watch|--ui|--headed| dev| serve| start|install|deploy|\bbuild|\b(until|while|sleep)\b/;

function leadingWords(segment) {
  const words = segment.trim().split(/\s+/);
  let index = 0;
  while (index < words.length && ENV_ASSIGNMENT.test(words[index])) index += 1;
  while (index < words.length - 1 && LAUNCHERS.has(words[index])) index += 1;
  return words.slice(index, index + 2);
}

export function isTestLike(command) {
  if (NOT_A_SUITE.test(command)) return false;
  const segments = command.split(/\|\|?|&&|;/).map(leadingWords);
  if (segments.some(([program]) => REMOTE_PROGRAMS.has(program))) return false;
  return segments.some((words) => words.some((word) => BARE_NAME.test(word) && TEST_LIKE.test(word)));
}

function wholeSuiteKey(segment) {
  const text = segment.replace(REDIRECTION, ' ');
  if (!isTestLike(text)) return null;
  const words = text.trim().split(/\s+/).filter((word) => !ENV_ASSIGNMENT.test(word));
  let start = 0;
  while (start < words.length - 1 && LAUNCHERS.has(words[start])) start += 1;
  const testIndex = words.findIndex((word, index) => index >= start && index < start + 2 && BARE_NAME.test(word) && TEST_LIKE.test(word));
  if (testIndex === -1) return null;
  const narrowing = words.slice(testIndex + 1).some((word) => !word.startsWith('-') && !LAUNCHERS.has(word));
  if (narrowing) return null;
  return words.filter((word) => !word.startsWith('-') && !KEY_FILLER.has(word)).join(' ');
}

export function wholeSuiteKeys(command) {
  return command.split(/\|\|?|&&|;/).map(wholeSuiteKey).filter((key) => key !== null);
}

const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.\w+$/;
const SHADOW_FILE = 'suite-shadow.jsonl';
const FILE_RUNNERS = new Set(['vitest', 'jest', 'mocha', 'pytest']);
const SHELL_SYNTAX = /[|&;<>`$()]/;

function takesFiles(command) {
  const [program] = leadingWords(command);
  if (program === 'node') return command.trim().split(/\s+/).includes('--test');
  return FILE_RUNNERS.has(program);
}

export function narrowedCommand(command, files) {
  if (SHELL_SYNTAX.test(command) || wholeSuiteKeys(command).length !== 1 || !takesFiles(command)) return null;
  return [command.trim(), ...files.map(shellQuote)].join(' ');
}

export function shadowSelection(root, command) {
  if (narrowedCommand(command, []) === null) return null;
  const files = changedTestFiles(root, command);
  return files === null ? null : { files, command: narrowedCommand(command, files) };
}

function gitLines(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).split('\n').filter((line) => line !== '');
}

export function changedTestFiles(root, command) {
  const commit = greenCommit(root, command);
  if (commit === null) return null;
  const tracked = gitLines(root, ['diff', '--name-only', commit]);
  const untracked = gitLines(root, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...tracked, ...untracked])].filter((file) => TEST_FILE.test(file));
}

export function recordShadow(root, { command, files, narrowed, full }) {
  const file = path.join(memoryDirectory(root), SHADOW_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const missed = narrowed === 'pass' && full === 'fail';
  fs.appendFileSync(file, `${JSON.stringify({ command, files, narrowed, full, missed })}\n`);
}

export function readShadow(root) {
  const file = path.join(memoryDirectory(root), SHADOW_FILE);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
}
