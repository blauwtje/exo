import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { proseUnits } from './instruction-density.mjs';

export const MAX_ARROW_RATIO = 0.3;
export const CHAINED_SEMICOLONS = 2;
export const MAX_NEVERS = 2;

const ARROW = '→';
const NEVER = /\bnever\b/gi;
const CODE_OR_QUOTE = /`[^`]*`|"[^"]*"/g;
const NON_PROSE_START = /^(?:[-*+]\s|[>|#]|\d+[.)]|`{3,}|~{3,}|<!--)/;
const GOAL_FILE = /(?:^|\/)(?:SKILL\.md|agents\/[^/]+\.md)$/;

function bodyLines(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return lines;
  const close = lines.indexOf('---', 1);
  return close === -1 ? lines : lines.slice(close + 1);
}

function hasGoalLine(text) {
  const lines = bodyLines(text);
  const heading = lines.findIndex((line) => /^# /.test(line));
  if (heading === -1) return false;
  const first = lines.slice(heading + 1).find((line) => line.trim() !== '');
  if (first === undefined) return false;
  return !NON_PROSE_START.test(first.trim());
}

export function proseStyleRow(file, text) {
  const units = proseUnits(text);
  const bullets = units.filter((unit) => unit.kind === 'bullet');
  const plain = (unit) => unit.text.replace(CODE_OR_QUOTE, '');
  const arrows = bullets.filter((unit) => plain(unit).includes(ARROW));
  const chainedBullets = bullets.filter((unit) => plain(unit).split(';').length - 1 >= CHAINED_SEMICOLONS).length;
  const nevers = units.reduce((total, unit) => total + (plain(unit).match(NEVER) ?? []).length, 0);
  const goalLine = GOAL_FILE.test(file.split(path.sep).join('/')) ? hasGoalLine(text) : true;
  return {
    path: file,
    arrowRatio: bullets.length === 0 ? 0 : arrows.length / bullets.length,
    chainedBullets,
    goalLine,
    nevers,
  };
}

export const violates = (row) => row.arrowRatio > MAX_ARROW_RATIO
  || row.chainedBullets > 0
  || !row.goalLine
  || row.nevers > MAX_NEVERS;

function markdownFiles(target) {
  if (!fs.statSync(target).isDirectory()) return [target];
  return fs.readdirSync(target, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export function proseStyleRows(targets, { exclude = [] } = {}) {
  const skipped = new Set(exclude.map((file) => path.resolve(file)));
  return targets
    .flatMap(markdownFiles)
    .filter((file) => !skipped.has(path.resolve(file)))
    .map((file) => proseStyleRow(file, fs.readFileSync(file, 'utf8')));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failing = proseStyleRows(process.argv.slice(2)).filter(violates);
  for (const row of failing) console.log(JSON.stringify(row));
  process.exit(failing.length > 0 ? 1 : 0);
}
