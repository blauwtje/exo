import fs from 'node:fs';
import path from 'node:path';
import { attributionProblem } from './commit-text.mjs';
import { denyReason } from './guard-rules.mjs';
import { isGit, subcommandIndex, tokenize } from './git-deny.mjs';

const MESSAGE_FLAGS = /^(?:--message|-[a-zA-Z]*m)$/;
const FILE_FLAGS = /^(?:--file|-F)$/;
const ATTACHED_SHORT_FILE = /^-F(.+)$/;
const ATTACHED = /^--(message|file)=([\s\S]*)$/;

function flagValues(argv, from) {
  const messages = [];
  const files = [];
  for (let index = from; index < argv.length; index += 1) {
    const token = argv[index];
    const attached = ATTACHED.exec(token);
    if (attached) (attached[1] === 'message' ? messages : files).push(attached[2]);
    else if (ATTACHED_SHORT_FILE.test(token)) files.push(ATTACHED_SHORT_FILE.exec(token)[1]);
    else if (MESSAGE_FLAGS.test(token) && index + 1 < argv.length) messages.push(argv[(index += 1)]);
    else if (FILE_FLAGS.test(token) && index + 1 < argv.length) files.push(argv[(index += 1)]);
  }
  return { messages, files };
}

function readable(file, cwd, command) {
  if (file === '-' || file === '/dev/stdin') return [command];
  try {
    return [fs.readFileSync(path.resolve(cwd, file), 'utf8')];
  } catch {
    return [command];
  }
}

function segmentTexts(argv, cwd, command) {
  const texts = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (!isGit(argv[index])) continue;
    const subcommand = subcommandIndex(argv, index);
    if (argv[subcommand] !== 'commit') continue;
    const { messages, files } = flagValues(argv, subcommand + 1);
    texts.push(...messages, ...files.flatMap((file) => readable(file, cwd, command)));
  }
  return texts;
}

export function commitTexts(command, cwd = process.cwd()) {
  if (!/\bcommit\b/.test(command)) return [];
  return tokenize(command).flatMap((argv) => segmentTexts(argv, cwd, command));
}

export function commitAttributionReason(command, cwd) {
  if (!commitTexts(command, cwd).some(attributionProblem)) return null;
  return denyReason('commit-attribution');
}
