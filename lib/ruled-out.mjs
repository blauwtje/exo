import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { SCRATCH_FOLDER } from './scratch-path.mjs';
import { isMain } from './script-flags.mjs';

const FOLDER = 'ruled-out';
const LINE_CAP = 200;

export const ruledOutFile = (root, task) => path.join(root, SCRATCH_FOLDER, FOLDER, `task-${task}.md`);

const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, LINE_CAP);

export function readRuledOut(root, task) {
  const file = ruledOutFile(root, task);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
}

export function appendRuledOut(root, task, tried, because) {
  const line = `- tried ${oneLine(tried)}; failed because ${oneLine(because)}`;
  if (readRuledOut(root, task).includes(line)) return false;
  const file = ruledOutFile(root, task);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${line}\n`);
  return true;
}

export function ruledOutText(root, task) {
  const lines = readRuledOut(root, task);
  if (lines.length === 0) return '';
  return `Ruled out for task ${task} (take none of these again):\n${lines.join('\n')}\n`;
}

const USAGE = 'usage: ruled-out.mjs add <task> <tried> <because> [--root <dir>] | show <task> [--root <dir>]';

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const root = rootAt === -1 ? process.cwd() : path.resolve(argv[rootAt + 1]);
  const args = rootAt === -1 ? argv : argv.filter((_, index) => index !== rootAt && index !== rootAt + 1);
  const [command, task, tried, because] = args;
  if (command === 'show' && task) return process.stdout.write(ruledOutText(root, task));
  if (command === 'add' && task && tried && because) return void appendRuledOut(root, task, tried, because);
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 2;
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
