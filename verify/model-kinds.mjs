import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readKindTable } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const PINNED_FIELDS = ['model', 'effort'];

function readField(text, field) {
  const opening = FRONTMATTER.exec(text);
  if (opening === null) return null;
  const line = opening[1].split('\n').find((row) => row.startsWith(`${field}:`));
  return line === undefined ? null : line.slice(field.length + 1).trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function opensWithKind(match, kind) {
  return new RegExp(`exo-kind: ${escapeRegExp(kind)}(?![\\w-])`).test(match);
}

const INHERITANCE_NOTE = 'the session effort would reach the subagent';

function markdownFiles(root, folder) {
  const base = path.join(root, folder);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { recursive: true })
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(folder, name).split(path.sep).join('/'));
}

export function findInheritanceGaps(root, table) {
  const gaps = [];
  const covered = new Map();
  for (const { file, match } of table.dispatches) {
    covered.set(file, [...(covered.get(file) ?? []), match]);
  }
  for (const file of [...markdownFiles(root, 'skills'), ...markdownFiles(root, 'agents')]) {
    fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, index) => {
      const where = `${file}:${index + 1}`;
      if (line.includes('general-purpose') && !(covered.get(file) ?? []).some((match) => line.includes(match))) {
        gaps.push(`${where}: names general-purpose with no dispatches entry in lib/model-kinds.json`);
      }
      if (line.includes("session's model")) gaps.push(`${where}: names "the session's model"; name a kind in the prompt`);
      if (/\bfork\b/i.test(line) && /dispatch|spawn|delegate|subagent/i.test(line)) {
        gaps.push(`${where}: dispatches a fork, which takes the session's effort (${INHERITANCE_NOTE})`);
      }
    });
  }
  return gaps;
}

function filePins(root, file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return PINNED_FIELDS
    .map((field) => ({ file, field, expected: null, actual: readField(text, field) }))
    .filter((pin) => pin.actual !== null);
}

function findFrontmatterPins(root) {
  const files = [...markdownFiles(root, 'agents'), ...markdownFiles(root, 'skills')];
  return files.flatMap((file) => filePins(root, file));
}

function findDispatchPins(root, table) {
  const pins = [];
  for (const { file, match, kind } of table.dispatches) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter((line) => line.includes(match));
    if (lines.length !== 1) {
      throw new Error(`${file}: "${match}" matches ${lines.length} lines`);
    }
    if (!opensWithKind(match, kind)) {
      pins.push({ file, field: 'dispatch', expected: `exo-kind: ${kind}`, actual: match });
    }
  }
  return pins;
}

export function findKindDrift(root, table) {
  const kinds = table ?? readKindTable(path.join(root, 'lib', 'model-kinds.json'));
  return [...findFrontmatterPins(root), ...findDispatchPins(root, kinds)];
}

function main() {
  parseArgs({ options: { write: { type: 'boolean', default: false } } });
  const root = fileURLToPath(new URL('..', import.meta.url));
  const drift = findKindDrift(root);
  for (const record of drift) {
    console.log(`${record.file}: ${record.field} is ${record.actual}, the table says ${record.expected}`);
  }
  if (drift.length > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
