import fs from 'node:fs';
import path from 'node:path';
import { hashedWholeFiles } from '../../benchmarks/routing.mjs';
import { proseStyleRows, violates } from '../prose-style.mjs';

const DIRECTORIES = ['skills', 'agents', 'hooks', 'output-styles'];
const FILES = ['harnesses/codex/host-note.md', '.claude/CLAUDE.md', '.claude/landing.md', 'README.md', 'CONTRIBUTING.md'];

function instructionTargets(root) {
  const directories = DIRECTORIES.map((name) => path.join(root, name));
  const files = FILES.map((name) => path.join(root, name));
  return [...directories, ...files].filter((target) => fs.existsSync(target));
}

function describe(row, root) {
  const reasons = [];
  if (row.arrowRatio > 0.3) reasons.push(`arrow bullets ${Math.round(row.arrowRatio * 100)}%`);
  if (row.chainedBullets > 0) reasons.push(`${row.chainedBullets} bullets with two semicolons`);
  if (!row.goalLine) reasons.push('no goal line');
  if (row.nevers > 2) reasons.push(`${row.nevers} never`);
  return `${path.relative(root, row.path).split(path.sep).join('/')} (${reasons.join(', ')})`;
}

export function checkProseStyle(report, repository) {
  const rows = proseStyleRows(instructionTargets(repository.root), { exclude: hashedWholeFiles(repository.root) });
  const failing = rows.filter(violates);
  report.assert(
    failing.length === 0,
    'prose style',
    `${rows.length} instruction files hold at most 30% arrow bullets, no bullet with two semicolons, two never, and a goal line`,
    failing.map((row) => describe(row, repository.root)).join('; ')
  );
}
