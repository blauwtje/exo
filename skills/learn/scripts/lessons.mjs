import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { projectFolder } from './sessions.mjs';

const MAX_NOTES = 15;
const MAX_LINES = 12;
const STORE_INDEX = 'index.md';
const INDEX = 'lessons.md';
const DATE = /\d{4}-\d{2}-\d{2}/;
const TYPES = ['feedback', 'project'];
const LINK = /\]\(([^)]*)\)/g;
const OLD_INDEX_LINE = /Lessons, open a note when its description fits the task:.*@(\S+)/;
const IMPORT_LINE = /^@(\S+)$/;
const USAGE = 'usage: node lessons.mjs check [--dir <dir>]\n       node lessons.mjs paths [--cwd <dir>]\n       node lessons.mjs migrate [--cwd <dir>]\ncheck tests the lesson store (default the project store) and its index in the rules folder beside it against the cap and note shape; paths prints where each lesson file lives; migrate moves an old CLAUDE.md lessons index to the rules folder.';

function parseNote(lines) {
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close === -1) return { fields: null, body: lines };
  const fields = Object.fromEntries(
    lines
      .slice(1, close)
      .filter((line) => !line.startsWith('- ') && !line.startsWith(' '))
      .map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()])
  );
  const frontmatter = lines.slice(1, close);
  const start = frontmatter.findIndex((line) => line.startsWith('paths:'));
  const items = start === -1 ? [] : frontmatter.slice(start + 1);
  const end = items.findIndex((line) => !/^\s*- /.test(line));
  fields.pathItems = end === -1 ? items.length : end;
  return { fields, body: lines.slice(close + 1) };
}

function noteProblems(name, text, { pathNote }) {
  const lines = text.split('\n').filter((line, index, all) => index < all.length - 1 || line !== '');
  const problems = [];
  if (lines.length > MAX_LINES) problems.push(`${name}: ${lines.length} lines, at most ${MAX_LINES}`);
  const { fields, body } = parseNote(lines);
  if (fields === null) problems.push(`${name}: no frontmatter`);
  else {
    for (const key of ['name', 'description']) {
      if (!fields[key]) problems.push(`${name}: no ${key} in frontmatter`);
    }
    if (!TYPES.includes(fields.type)) problems.push(`${name}: type must be ${TYPES.join(' or ')}`);
    if (!DATE.test(fields.seen ?? '')) problems.push(`${name}: seen has no YYYY-MM-DD date`);
    if (pathNote && fields.pathItems === 0) problems.push(`${name}: no paths list in frontmatter`);
  }
  const isLabel = (line) => line.startsWith('Why:') || line.startsWith('How to apply:');
  if (!body.some((line) => line.trim() !== '' && !isLabel(line))) problems.push(`${name}: no rule line`);
  for (const label of ['Why:', 'How to apply:']) {
    if (!body.some((line) => line.startsWith(label))) problems.push(`${name}: no ${label} line`);
  }
  return problems;
}

function listNotes(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => path.join(dir, name));
}

function realOrResolved(file) {
  return fs.existsSync(file) ? fs.realpathSync(file) : file;
}

function indexProblems(rulesDir, root, notes) {
  const indexFile = path.join(rulesDir, INDEX);
  const index = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : '';
  const links = [...index.matchAll(LINK)].map((match) => ({
    text: match[1],
    target: realOrResolved(path.resolve(root, match[1]))
  }));
  const targets = new Set(notes.map(({ file }) => realOrResolved(file)));
  return [
    ...notes
      .filter(({ file }) => links.filter((link) => link.target === realOrResolved(file)).length !== 1)
      .map(({ name }) => `${INDEX}: needs exactly one link to ${name}`),
    ...links.filter((link) => !targets.has(link.target)).map((link) => `${INDEX}: links to ${link.text}, which is not a note`)
  ];
}

export function checkStore(dir, { required = false } = {}) {
  const rulesDir = path.join(dir, '..', 'rules');
  if (!fs.existsSync(dir) && listNotes(path.join(rulesDir, 'lessons')).length === 0) {
    return { count: 0, problems: required ? [`${dir}: no such directory`] : [] };
  }
  const notes = [
    ...listNotes(dir)
      .filter((file) => path.basename(file) !== STORE_INDEX)
      .map((file) => ({ file, name: path.basename(file), pathNote: false })),
    ...listNotes(path.join(rulesDir, 'lessons')).map((file) => ({ file, name: path.basename(file), pathNote: true }))
  ];
  const problems = [
    ...(notes.length > MAX_NOTES ? [`${dir}: ${notes.length} notes, at most ${MAX_NOTES}`] : []),
    ...notes.flatMap(({ file, name, pathNote }) => noteProblems(name, fs.readFileSync(file, 'utf8'), { pathNote })),
    ...indexProblems(rulesDir, path.join(dir, '..', '..'), notes)
  ];
  return { count: notes.length, problems };
}

function readSettings(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch {
    return {};
  }
}

function repoRoot(root) {
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? path.dirname(result.stdout.trim()) : root;
}

function topFolder(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return result.status === 0 ? path.resolve(result.stdout.trim()) : cwd;
}

function autoMemoryPath(root) {
  const settings = [path.join(root, '.claude', 'settings.local.json'), path.join(root, '.claude', 'settings.json'), path.join(configDirectory(), 'settings.json')].map(readSettings);
  const setting = (key) => settings.find((file) => file[key] !== undefined)?.[key];
  if (process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY === '1' || setting('autoMemoryEnabled') === false) return 'none';
  const directory = setting('autoMemoryDirectory');
  if (typeof directory === 'string') return path.join(directory.startsWith('~/') ? path.join(os.homedir(), directory.slice(2)) : directory, 'MEMORY.md');
  const folder = projectFolder(repoRoot(root));
  const named = process.env.CLAUDE_CODE_PROJECT_DIR_NAME ? path.join(path.dirname(folder), process.env.CLAUDE_CODE_PROJECT_DIR_NAME) : folder;
  return path.join(named, 'memory', 'MEMORY.md');
}

function projectRoot(cwd, { explicit }) {
  if (!explicit && process.env.CLAUDE_PROJECT_DIR) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  return topFolder(path.resolve(cwd));
}

export function lessonPaths(root) {
  const rules = path.join(configDirectory(), 'rules');
  const personalRules = fs.existsSync(rules) ? fs.realpathSync(rules) : rules;
  return [
    ['project store', path.join(root, '.claude', 'lessons')],
    ['project index', path.join(root, '.claude', 'rules', INDEX)],
    ['personal store', path.join(path.dirname(personalRules), 'lessons')],
    ['personal index', path.join(rules, INDEX)],
    ['auto memory', autoMemoryPath(root)]
  ];
}

function resolveImport(fromFile, target) {
  const expanded = target.startsWith('~/') ? path.join(os.homedir(), target.slice(2)) : target;
  return path.resolve(path.dirname(fromFile), expanded);
}

function importedFiles(file) {
  if (!fs.existsSync(file)) return [];
  const imports = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.match(IMPORT_LINE))
    .filter((match) => match !== null)
    .map((match) => resolveImport(file, match[1]))
    .filter((target) => fs.existsSync(target) && fs.statSync(target).isFile());
  return [file, ...imports];
}

const NOTE_LINK = /^(?![a-z][a-z0-9+.-]*:|#).*\.md$/i;

function rewriteLinks(line, oldIndex, newNote) {
  const oldDir = path.dirname(oldIndex);
  return line.replace(LINK, (whole, target) => (NOTE_LINK.test(target) ? `](${newNote(path.resolve(oldDir, target))})` : whole));
}

function moveNotes(lines, oldIndex, store) {
  const oldDir = path.dirname(oldIndex);
  if (oldDir === store) return;
  const notes = lines.flatMap((line) => [...line.matchAll(LINK)].map((match) => match[1])).filter((target) => NOTE_LINK.test(target)).map((target) => path.resolve(oldDir, target));
  for (const note of new Set(notes.filter((file) => path.dirname(file) === oldDir && fs.existsSync(file)))) {
    const destination = path.join(store, path.basename(note));
    if (fs.existsSync(destination)) continue;
    fs.mkdirSync(store, { recursive: true });
    fs.renameSync(note, destination);
  }
}

function moveIndex({ oldIndex, newIndex, store, toLink }) {
  if (realOrResolved(oldIndex) === realOrResolved(newIndex)) return;
  const oldDir = path.dirname(oldIndex);
  const lines = fs.existsSync(oldIndex) ? fs.readFileSync(oldIndex, 'utf8').split('\n').filter((line) => line.trim() !== '') : [];
  moveNotes(lines, oldIndex, store);
  const newNote = (note) => toLink(path.dirname(note) === oldDir ? path.join(store, path.basename(note)) : note);
  const moved = lines.map((line) => rewriteLinks(line, oldIndex, newNote));
  const current = fs.existsSync(newIndex) ? fs.readFileSync(newIndex, 'utf8') : '';
  const known = new Set(current.split('\n'));
  const added = moved.filter((line) => !known.has(line));
  if (added.length > 0) {
    fs.mkdirSync(path.dirname(newIndex), { recursive: true });
    const separator = current === '' || current.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(newIndex, `${current}${separator}${added.join('\n')}\n`);
  }
  fs.rmSync(oldIndex, { force: true });
}

function migrateFile(file, scope) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const removed = lines.filter((line) => OLD_INDEX_LINE.test(line));
  for (const line of removed) moveIndex({ ...scope, oldIndex: resolveImport(file, line.match(OLD_INDEX_LINE)[1]) });
  if (removed.length > 0) fs.writeFileSync(file, lines.filter((line) => !OLD_INDEX_LINE.test(line)).join('\n'));
  return removed.map((line) => `removed: ${file}: ${line}`);
}

function migrate(cwd, root) {
  const places = Object.fromEntries(lessonPaths(root));
  const config = configDirectory();
  const personalFiles = importedFiles(path.join(config, 'CLAUDE.md'));
  const personalReal = new Set(personalFiles.filter((file) => fs.existsSync(file)).map(realOrResolved));
  const project = {
    files: [...new Set([cwd, root].flatMap((folder) => [path.join(folder, 'CLAUDE.md'), path.join(folder, '.claude', 'CLAUDE.md')]))].filter((file) => fs.existsSync(file) && !personalReal.has(realOrResolved(file))),
    newIndex: places['project index'],
    store: places['project store'],
    toLink: (target) => path.relative(root, target).split(path.sep).join('/')
  };
  const personal = {
    files: personalFiles,
    newIndex: places['personal index'],
    store: places['personal store'],
    toLink: (target) => target
  };
  return [personal, project].flatMap(({ files, ...scope }) => files.filter((file) => fs.existsSync(file)).flatMap((file) => migrateFile(file, scope)));
}

function main() {
  const command = process.argv[2];
  if (command === 'migrate') {
    const values = parseFlags(process.argv.slice(3), { cwd: 'string', help: 'boolean' }, { usage: USAGE });
    const cwd = path.resolve(values.cwd ?? process.cwd());
    for (const line of migrate(cwd, projectRoot(cwd, { explicit: values.cwd !== undefined }))) console.log(line);
    return;
  }
  if (command === 'paths') {
    const values = parseFlags(process.argv.slice(3), { cwd: 'string', help: 'boolean' }, { usage: USAGE });
    const cwd = values.cwd ?? process.cwd();
    for (const [label, file] of lessonPaths(projectRoot(cwd, { explicit: values.cwd !== undefined }))) console.log(`${label}: ${file}`);
    return;
  }
  if (command !== 'check') {
    parseFlags(process.argv.slice(2), { help: 'boolean' }, { usage: USAGE });
    throw new UsageError(`unknown command '${command ?? ''}'\n${USAGE}`);
  }
  const values = parseFlags(process.argv.slice(3), { dir: 'string', help: 'boolean' }, { usage: USAGE });
  const { count, problems } = checkStore(path.resolve(values.dir ?? path.join(projectRoot(process.cwd(), { explicit: false }), '.claude', 'lessons')), { required: values.dir !== undefined });
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`lessons: ${count} of ${MAX_NOTES}`);
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
