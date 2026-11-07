import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitText } from './lib/git.mjs';

const ROOTS = ['skills/', 'agents/', 'hooks/', 'lib/'];
const IMPORT_PATTERN = /(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g;

export const encodeDir = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-');

export function parseArgs(argv) {
  const options = { projects: null, sessions: 30, json: false, allProjects: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') options.json = true;
    else if (argv[i] === '--projects') options.projects = argv[++i];
    else if (argv[i] === '--all-projects') options.allProjects = true;
    else if (argv[i] === '--sessions') options.sessions = argv[++i] === 'all' ? 0 : Number(argv[i]);
  }
  return options;
}


export function trackedFiles(root) {
  return gitText(root, ['ls-files']).split('\n').filter((file) => ROOTS.some((prefix) => file.startsWith(prefix)));
}

export function mainRoot(root) {
  const common = path.resolve(root, gitText(root, ['rev-parse', '--git-common-dir']));
  return path.basename(common) === '.git' ? path.dirname(common) : root;
}

const subdirs = (base) => fs.readdirSync(base)
  .map((name) => path.join(base, name))
  .filter((dir) => fs.statSync(dir).isDirectory());

export function transcriptDirs(root, projectsOverride, allProjects = false) {
  const base = projectsOverride && allProjects ? projectsOverride : path.join(os.homedir(), '.claude', 'projects');
  if (allProjects) return fs.existsSync(base) ? subdirs(base) : [];
  if (projectsOverride) return [projectsOverride];
  if (!fs.existsSync(base)) return [];
  const prefix = encodeDir(mainRoot(root));
  return fs.readdirSync(base)
    .filter((name) => name === prefix || name.startsWith(`${prefix}--worktrees-`))
    .map((name) => path.join(base, name));
}

export function newestSessions(dirs, limit) {
  const files = dirs.flatMap((dir) => fs.readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(dir, name)));
  return files
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit > 0 ? limit : undefined)
    .map((entry) => entry.file);
}

const blocks = (entry) => {
  const content = entry.message?.content;
  return Array.isArray(content) ? content : [];
};

const addTo = (counts, file) => counts.set(file, (counts.get(file) ?? 0) + 1);

const mentioned = (text, files) => files.filter((file) => text.includes(file));

function countToolUse(block, files, counts) {
  const input = block.input ?? {};
  if (block.name === 'Skill' && input.skill) {
    const name = String(input.skill).replace(/^exo:/, '');
    return addTo(counts, `skills/${name}/SKILL.md`);
  }
  if (block.name === 'Agent' && typeof input.subagent_type === 'string' && input.subagent_type.startsWith('exo:')) {
    return addTo(counts, `agents/${input.subagent_type.slice(4)}.md`);
  }
  const text = block.name === 'Bash' ? String(input.command ?? '') : String(input.file_path ?? '');
  for (const file of mentioned(text, files)) addTo(counts, file);
}

export function countTranscript(text, files, counts) {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    for (const block of blocks(entry)) {
      if (block.type === 'tool_use') countToolUse(block, files, counts);
    }
    if (entry.type === 'attachment' || entry.type === 'system') {
      for (const file of mentioned(line.replace(/\\\//g, '/'), files)) addTo(counts, file);
    }
  }
}

export function importAliases(root) {
  const manifest = path.join(root, 'package.json');
  if (!fs.existsSync(manifest)) return {};
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).imports ?? {};
}

export function importsOf(root, file, aliases) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const found = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const spec = match[1];
    if (spec.startsWith('.')) found.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
    else if (aliases[spec]) found.push(path.posix.normalize(aliases[spec]));
  }
  return found;
}

export function hookRegistrations(root, files) {
  const file = 'hooks/hooks.json';
  if (!files.includes(file)) return [];
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const registered = files.filter((tracked) => tracked !== file && tracked.startsWith('hooks/') && text.includes(tracked));
  const modules = JSON.parse(text).modules ?? [];
  const resolved = modules.map((spec) => path.posix.normalize(path.posix.join('hooks', spec)));
  return [file, ...registered, ...resolved.filter((entry) => files.includes(entry))];
}

export function propagate(root, files, seeds) {
  const aliases = importAliases(root);
  const via = new Map();
  const queue = [...seeds];
  const seen = new Set(seeds);
  while (queue.length) {
    const current = queue.shift();
    if (!current.endsWith('.mjs') || !files.includes(current)) continue;
    for (const dep of importsOf(root, current, aliases)) {
      if (seen.has(dep) || !files.includes(dep)) continue;
      seen.add(dep);
      via.set(dep, current);
      queue.push(dep);
    }
  }
  return via;
}

export function buildUsage(root, options) {
  const files = trackedFiles(root);
  const counts = new Map();
  const sessions = newestSessions(transcriptDirs(root, options.projects, options.allProjects), options.sessions);
  for (const session of sessions) countTranscript(fs.readFileSync(session, 'utf8'), files, counts);
  const registered = hookRegistrations(root, files);
  const direct = new Set([...counts.keys(), ...registered]);
  const via = propagate(root, files, [...direct]);
  const rows = files.map((file) => ({
    file,
    count: counts.get(file) ?? 0,
    via: registered.includes(file) ? 'hooks.json' : via.get(file) ?? '',
  }));
  rows.sort((a, b) => a.count - b.count || a.file.localeCompare(b.file));
  return { sessions: sessions.length, rows, unused: rows.filter((row) => row.count === 0 && !row.via).length };
}

export function formatTable(usage) {
  const lines = ['| count | file | used via |', '|---|---|---|'];
  for (const row of usage.rows) lines.push(`| ${row.count} | ${row.file} | ${row.via} |`);
  lines.push('', `sessions: ${usage.sessions}, files at zero: ${usage.unused}`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const options = parseArgs(process.argv.slice(2));
  const usage = buildUsage(root, options);
  console.log(options.json ? JSON.stringify(usage, null, 2) : formatTable(usage));
}
