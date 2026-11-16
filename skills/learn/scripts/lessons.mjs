import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const MAX_NOTES = 15;
const MAX_LINES = 12;
const INDEX = 'index.md';
const DATE = /\d{4}-\d{2}-\d{2}/;
const TYPES = ['feedback', 'project'];
const LINK = /\]\(([^)]*)\)/g;
const USAGE = 'usage: node lessons.mjs check [--dir <dir>]\nChecks the lesson store (default .claude/lessons) against its cap and note shape.';

function parseNote(lines) {
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close === -1) return { fields: null, body: lines };
  const fields = Object.fromEntries(
    lines.slice(1, close).map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()])
  );
  return { fields, body: lines.slice(close + 1) };
}

function noteProblems(name, text) {
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
  }
  const isLabel = (line) => line.startsWith('Why:') || line.startsWith('How to apply:');
  if (!body.some((line) => line.trim() !== '' && !isLabel(line))) problems.push(`${name}: no rule line`);
  for (const label of ['Why:', 'How to apply:']) {
    if (!body.some((line) => line.startsWith(label))) problems.push(`${name}: no ${label} line`);
  }
  return problems;
}

function indexProblems(dir, names) {
  const index = fs.existsSync(path.join(dir, INDEX)) ? fs.readFileSync(path.join(dir, INDEX), 'utf8') : '';
  const links = [...index.matchAll(LINK)].map((match) => match[1]);
  return [
    ...names
      .filter((name) => links.filter((link) => link === name).length !== 1)
      .map((name) => `${INDEX}: needs exactly one link to ${name}`),
    ...links
      .filter((link) => !names.includes(link))
      .map((link) => `${INDEX}: links to ${link}, which is not a note`)
  ];
}

export function checkStore(dir, { required = false } = {}) {
  if (!fs.existsSync(dir)) {
    return { count: 0, problems: required ? [`${dir}: no such directory`] : [] };
  }
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.md') && name !== INDEX).sort();
  const problems = [
    ...(names.length > MAX_NOTES ? [`${dir}: ${names.length} notes, at most ${MAX_NOTES}`] : []),
    ...names.flatMap((name) => noteProblems(name, fs.readFileSync(path.join(dir, name), 'utf8'))),
    ...indexProblems(dir, names)
  ];
  return { count: names.length, problems };
}

function main() {
  const command = process.argv[2];
  if (command !== 'check') {
    parseFlags(process.argv.slice(2), { help: 'boolean' }, { usage: USAGE });
    throw new UsageError(`unknown command '${command ?? ''}'\n${USAGE}`);
  }
  const values = parseFlags(process.argv.slice(3), { dir: 'string', help: 'boolean' }, { usage: USAGE });
  const { count, problems } = checkStore(path.resolve(values.dir ?? '.claude/lessons'), { required: values.dir !== undefined });
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
