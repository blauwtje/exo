import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCRATCH_FOLDER } from '#scratch-path';

const PROOF = /^grep -qF '([^'`]+)' CHANGELOG\.md$/;
const SUBHEADING = /### (Added|Changed|Fixed|Removed)\b/g;
const LITERAL = /`([^`]+)`/g;

export function changelogLine(task, text) {
  if (task.files.length !== 1 || task.files[0].path !== 'CHANGELOG.md') return null;
  const proof = PROOF.exec((task.proof ?? '').replace(/^`(.*)`$/, '$1'));
  if (proof === null || (task.data ?? '') === '') return null;
  const headings = new Set([...task.data.matchAll(SUBHEADING)].map((match) => match[1]));
  if (headings.size !== 1) return null;
  const heading = `### ${[...headings][0]}`;
  if (text.includes(proof[1]) || sectionOf(text.split('\n'), heading) === null) return null;
  const candidates = [...task.data.matchAll(LITERAL)].map((match) => match[1]).filter((literal) => literal.includes(proof[1]));
  const line = candidates.reduce((longest, literal) => (literal.length > longest.length ? literal : longest), proof[1]);
  if (line.includes('\n') || line.startsWith('- ')) return null;
  return { heading, line };
}

function sectionOf(lines, heading) {
  const unreleased = lines.findIndex((line) => /^## Unreleased\b/.test(line));
  if (unreleased === -1) return null;
  let stop = lines.findIndex((line, index) => index > unreleased && /^## /.test(line));
  if (stop === -1) stop = lines.length;
  const start = lines.findIndex((line, index) => index > unreleased && index < stop && line.trimEnd() === heading);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && index < stop && /^#{1,3} /.test(line));
  return { start, end: next === -1 ? stop : next };
}

function withLine(text, { heading, line }) {
  const lines = text.split('\n');
  const { start, end } = sectionOf(lines, heading);
  let last = end - 1;
  while (last > start && lines[last].trim() === '') last -= 1;
  lines.splice(last + 1, 0, `- ${line}`);
  return lines.join('\n');
}

function proveLine({ root, proof, report }) {
  if (spawnSync(proof, { cwd: root, shell: true, stdio: 'ignore' }).status !== 0) return false;
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, `Landed: CHANGELOG.md\nProof:\n- \`${proof}\`: pass\nUnresolved: none\n`);
  return true;
}

function restore({ file, before, report }) {
  fs.writeFileSync(file, before);
  fs.rmSync(report, { force: true });
}

export function landChangelogTask({ root, task, land }) {
  const file = path.join(root, 'CHANGELOG.md');
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, 'utf8');
  const found = changelogLine(task, before);
  if (found === null) return false;
  const report = path.join(root, SCRATCH_FOLDER, `implementer-${task.number}.md`);
  let landed = false;
  try {
    fs.writeFileSync(file, withLine(before, found));
    landed = proveLine({ root, proof: task.proof.replace(/^`(.*)`$/, '$1'), report }) && land() === true;
  } catch (error) {
    process.stderr.write(`changelog-task ${task.number}: script landing failed: ${error.message}\n`);
    landed = false;
  }
  if (!landed) restore({ file, before, report });
  return landed;
}