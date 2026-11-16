import fs from 'node:fs';
import path from 'node:path';
import { configDirectory } from '#config-directory';

const WORKTREES_MARK = '--claude-worktrees-';

export function projectFolder(cwd) {
  const resolved = path.resolve(cwd);
  const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  return path.join(configDirectory(), 'projects', real.replace(/[^A-Za-z0-9]/g, '-').split(WORKTREES_MARK)[0]);
}

const NOT_TYPED_PREFIXES = ['<command-', '<local-command-', '<bash-', '<task-notification>'];

export function typedPrompt(text) {
  const trimmed = text.trim();
  return !NOT_TYPED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;

function rawParts(entry) {
  if (entry.origin?.kind === 'task-notification' || entry.isMeta === true || entry.isCompactSummary === true) return [];
  const content = entry.message?.content;
  const parts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((part) => part?.type === 'text').map((part) => part.text) : [];
  return parts.filter((part) => typeof part === 'string');
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

export function promptMessages(file) {
  return userEntries(file).flatMap((entry) => {
    const text = rawParts(entry).join('\n');
    const timestamp = entry.timestamp ?? '';
    const name = COMMAND_NAME.exec(text)?.[1].trim();
    if (name !== undefined) return [{ text: `/${name.replace(/^\//, '')} ${COMMAND_ARGS.exec(text)?.[1].trim() ?? ''}`, timestamp, kind: 'rebuilt' }];
    if (text.trim() === '') return [];
    if (!typedPrompt(text)) return [{ text, timestamp, kind: 'skipped' }];
    return [{ text, timestamp, kind: 'stored' }];
  });
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
