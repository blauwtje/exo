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

function transcriptEntries(file) {
  const entries = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
    if (text === '') return;
    let entry;
    try {
      entry = JSON.parse(text);
    } catch {
      return;
    }
    if (entry.isSidechain !== true) entries.push({ entry, line: index + 1 });
  });
  return entries;
}

export function promptMessages(file) {
  return transcriptEntries(file).filter(({ entry }) => entry.type === 'user').flatMap(({ entry, line }) => {
    const text = rawParts(entry).join('\n');
    const timestamp = entry.timestamp ?? '';
    const name = COMMAND_NAME.exec(text)?.[1].trim();
    if (name !== undefined) return [{ text: `/${name.replace(/^\//, '')} ${COMMAND_ARGS.exec(text)?.[1].trim() ?? ''}`, timestamp, kind: 'rebuilt', line }];
    if (text.trim() === '') return [];
    if (!typedPrompt(text)) return [{ text, timestamp, kind: 'skipped', line }];
    return [{ text, timestamp, kind: 'stored', line }];
  });
}

function blocks(entry) {
  return Array.isArray(entry.message?.content) ? entry.message.content : [];
}

export function toolCalls(file) {
  const entries = transcriptEntries(file);
  const failedIds = new Set(entries.filter(({ entry }) => entry.type === 'user').flatMap(({ entry }) => blocks(entry)).filter((block) => block?.type === 'tool_result' && block.is_error === true).map((block) => block.tool_use_id));
  const session = path.basename(file, '.jsonl');
  return entries.filter(({ entry }) => entry.type === 'assistant').flatMap(({ entry, line }) => blocks(entry).filter((block) => block?.type === 'tool_use').map((block) => {
    const detail = block.input?.command ?? block.input?.file_path ?? block.input?.skill;
    return { session, date: (entry.timestamp ?? '').slice(0, 10), line, name: block.name, text: typeof detail === 'string' ? `${block.name} ${detail}` : block.name, failed: failedIds.has(block.id) };
  }));
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
