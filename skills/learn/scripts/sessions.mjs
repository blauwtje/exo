import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, POSITIVE_INTEGER, UsageError, USAGE_EXIT } from '#script-flags';

const WORKTREES_MARK = '--claude-worktrees-';
const DEFAULT_LIMIT = 20;
const DEFAULT_CHARS = 4000;
const USAGE = 'usage: node sessions.mjs [--cwd <dir>] [--limit <n>] [--chars <n>]\nPrints the user-typed text of this project\'s past sessions, newest first, one "=== <session file> ===" block each.';

export function projectFolder(cwd) {
  const resolved = path.resolve(cwd);
  const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  return path.join(configDirectory(), 'projects', real.replace(/[^A-Za-z0-9]/g, '-').split(WORKTREES_MARK)[0]);
}

const PASTED_BLOCK = /<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/g;
const NOT_TYPED_PREFIXES = ['<command-', '<local-command-', '<bash-'];

const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;

function rawParts(entry) {
  if (entry.origin?.kind === 'task-notification' || entry.isMeta === true || entry.isCompactSummary === true) return [];
  const content = entry.message?.content;
  const parts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((part) => part?.type === 'text').map((part) => part.text) : [];
  return parts.filter((part) => typeof part === 'string');
}

function typedParts(entry) {
  return rawParts(entry)
    .filter((part) => !NOT_TYPED_PREFIXES.some((prefix) => part.startsWith(prefix)))
    .map((part) => part.replace(PASTED_BLOCK, '').trim())
    .filter((part) => part !== '');
}

function userEntries(file) {
  const entries = [];
  for (const text of fs.readFileSync(file, 'utf8').split('\n')) {
    if (text === '') continue;
    let entry;
    try {
      entry = JSON.parse(text);
    } catch {
      continue;
    }
    if (entry.type === 'user' && entry.isSidechain !== true) entries.push(entry);
  }
  return entries;
}

export function typedMessages(file) {
  return userEntries(file).flatMap((entry) => typedParts(entry).map((text) => ({ text, timestamp: entry.timestamp ?? '' })));
}

export function promptMessages(file) {
  return userEntries(file).flatMap((entry) => {
    const text = rawParts(entry).join('\n');
    const timestamp = entry.timestamp ?? '';
    const name = COMMAND_NAME.exec(text)?.[1].trim();
    if (name !== undefined) return [{ text: `/${name.replace(/^\//, '')} ${COMMAND_ARGS.exec(text)?.[1].trim() ?? ''}`, timestamp, kind: 'rebuilt' }];
    if (text.trim() === '') return [];
    if (NOT_TYPED_PREFIXES.some((prefix) => text.startsWith(prefix))) return [{ text, timestamp, kind: 'skipped' }];
    return [{ text, timestamp, kind: 'stored' }];
  });
}

export function typedText(file) {
  return typedMessages(file).map(({ text }) => text);
}

export function sessionFiles(folder, runningSession) {
  const parent = path.dirname(folder);
  const siblings = fs.existsSync(parent) ? fs.readdirSync(parent).filter((name) => name.startsWith(`${path.basename(folder)}${WORKTREES_MARK}`)) : [];
  return [folder, ...siblings.map((name) => path.join(parent, name))]
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory).filter((name) => name.endsWith('.jsonl') && name !== `${runningSession}.jsonl`).map((name) => path.join(directory, name)))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ file }) => file);
}

function main() {
  const values = parseFlags(process.argv.slice(2), { cwd: 'string', limit: 'string', chars: 'string', help: 'boolean' }, { usage: USAGE });
  const limit = values.limit ?? String(DEFAULT_LIMIT);
  if (!POSITIVE_INTEGER.test(limit)) throw new UsageError(`--limit needs a positive integer, got '${limit}'`);
  const chars = values.chars ?? String(DEFAULT_CHARS);
  if (!POSITIVE_INTEGER.test(chars)) throw new UsageError(`--chars needs a positive integer, got '${chars}'`);
  const files = sessionFiles(projectFolder(values.cwd ?? process.cwd()), process.env.CLAUDE_CODE_SESSION_ID).slice(0, Number(limit));
  const blocks = files
    .map((file) => ({ file, text: typedText(file).join('\n').slice(-Number(chars)) }))
    .filter(({ text }) => text !== '')
    .map(({ file, text }) => `=== ${file} ===\n${text}\n`);
  process.stdout.write(blocks.join('\n'));
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exitCode = USAGE_EXIT;
  }
}
