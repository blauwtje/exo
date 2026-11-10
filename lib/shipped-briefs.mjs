import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PlanError, parsePlan } from './plan-tasks.mjs';

const BRIEF_FOLDERS = ['docs/specs', 'docs/plans'];

const AREA_PATH = /\b(?:skills|docs\/skills|agents|hooks|lib|verify|benchmarks|harnesses)\/[\w./-]+/g;
const TASK_CITATION = /\bTask (\d+)\b/;
const SUPERSEDES = /^\s*(?:[-*]\s+)?Supersedes:\s*(.+)$/gm;
const HOME_PATH = /\/(?:Users|home)\/[^\s`'")]+/g;

function areaOf(file) {
  const parts = file.split('/');
  if (parts[0] === 'skills' && parts.length > 2) return parts[1];
  if (parts[0] === 'docs' && parts[1] === 'skills' && parts[2]?.endsWith('.md')) return parts[2].slice(0, -3);
  if (parts.length > 1 && ['agents', 'hooks', 'lib', 'verify', 'benchmarks', 'harnesses'].includes(parts[0])) return parts[0];
  return null;
}

function bulletsOf(sectionText = '') {
  const bullets = [];
  for (const line of sectionText.split('\n')) {
    if (/^[-*]\s+/.test(line)) bullets.push(line.replace(/^[-*]\s+/, '').trim());
    else if (/^\s+\S/.test(line) && bullets.length > 0) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  return bullets.map((bullet) => bullet.replace(HOME_PATH, '<path>'));
}

function trackedBriefFiles(root) {
  const output = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...BRIEF_FOLDERS], { encoding: 'utf8' });
  return output.split('\0').filter((file) => file.endsWith('.md') && fs.existsSync(path.join(root, file))).sort();
}

function areasIn(text, known) {
  return [...new Set((text.match(AREA_PATH) ?? []).map(areaOf).filter((area) => area !== null && known(area)))];
}

function dominant(areas) {
  const counts = new Map();
  for (const area of areas) counts.set(area, (counts.get(area) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked.length === 0 ? 'general' : ranked[0][0];
}

function supersededNames(text) {
  return [...text.matchAll(SUPERSEDES)].flatMap((match) => match[1].split(','))
    .map((name) => path.basename(name.trim().replaceAll('`', ''), '.md'))
    .filter((name) => name !== '');
}

function acceptanceLine(text, tasks, briefArea, known) {
  const own = areasIn(text, known);
  if (own.length > 0) return { text, areas: own };
  const cited = text.match(TASK_CITATION);
  const task = cited === null ? undefined : tasks.find((candidate) => candidate.number === Number(cited[1]));
  const fromTask = task === undefined ? [] : areasIn(task.files.map((file) => file.path).join(' '), known);
  return { text, areas: fromTask.length > 0 ? fromTask : [briefArea] };
}

function knownAreaIn(root) {
  const fixed = new Set(['agents', 'hooks', 'lib', 'verify', 'benchmarks', 'harnesses']);
  return (area) => fixed.has(area) || fs.existsSync(path.join(root, 'skills', area));
}

function readBrief(root, file) {
  const known = knownAreaIn(root);
  const parsed = parsePlan(fs.readFileSync(path.join(root, file), 'utf8'));
  const taskPaths = parsed.tasks.flatMap((task) => task.files.map((entry) => entry.path));
  const briefArea = dominant(taskPaths.map(areaOf).filter((area) => area !== null && known(area)));
  const decisions = parsed.frame.Decisions ?? '';
  return {
    file,
    name: path.basename(file, '.md'),
    tasks: parsed.tasks,
    decisions: bulletsOf(decisions),
    acceptance: bulletsOf(parsed.frame.Acceptance).map((bullet) => acceptanceLine(bullet, parsed.tasks, briefArea, known)),
    supersedes: supersededNames(decisions)
  };
}

export function shippedBriefs(root) {
  const briefs = [];
  const unreadable = [];
  for (const file of trackedBriefFiles(root)) {
    try {
      briefs.push(readBrief(root, file));
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      unreadable.push({ file, reason: error.message });
    }
  }
  const replaced = new Set(briefs.flatMap((brief) => brief.supersedes));
  return { briefs: briefs.filter((brief) => !replaced.has(brief.name)), unreadable };
}
