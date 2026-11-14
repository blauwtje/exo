import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BYTES_PER_TOKEN } from './budgets.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, '..');

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

export function relFromRoot(absolutePath) {
  return toPosix(path.relative(ROOT, absolutePath));
}

function walkFilesWithExtension(dir, extension) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFilesWithExtension(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

function directoryEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true });
}

function markdownIn(dir) {
  return directoryEntries(dir)
    .filter((entry) => entry.name.endsWith('.md'))
    .map((entry) => path.join(dir, entry.name));
}

function skillDocs(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  const own = fs.existsSync(skillMd) ? [skillMd] : [];
  return [...own, ...markdownIn(path.join(skillDir, 'references'))];
}

export function listDocFiles() {
  const skillsDir = path.join(ROOT, 'skills');
  const skillDirs = directoryEntries(skillsDir).filter((entry) => entry.isDirectory());
  const rootDocs = ['README.md', 'CONTRIBUTING.md', '.claude/CLAUDE.md', '.claude/landing.md']
    .map((rootDoc) => path.join(ROOT, rootDoc))
    .filter((full) => fs.existsSync(full));
  return [
    ...skillDirs.flatMap((entry) => skillDocs(path.join(skillsDir, entry.name))),
    ...markdownIn(path.join(ROOT, 'agents')),
    ...rootDocs,
    ...markdownIn(path.join(ROOT, 'docs', 'skills'))
  ];
}

export function listCodeFiles() {
  const hookFiles = directoryEntries(path.join(ROOT, 'hooks'))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(ROOT, 'hooks', entry.name));
  const verifyMjs = path.join(ROOT, 'verify.mjs');
  return [
    ...hookFiles,
    ...(fs.existsSync(verifyMjs) ? [verifyMjs] : []),
    ...walkFilesWithExtension(path.join(ROOT, 'verify'), '.mjs'),
    ...walkFilesWithExtension(path.join(ROOT, 'tests'), '.mjs')
  ];
}

export function skillNameFromPath(relativePath) {
  const match = /^skills\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : null;
}

function descriptionValue(raw) {
  if (!raw.startsWith('"')) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function readDescription(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return '';
  const closing = lines.indexOf('---', 1);
  if (closing < 0) return '';
  for (const line of lines.slice(1, closing)) {
    const match = /^description: +(.+)$/.exec(line);
    if (!match) continue;
    return descriptionValue(match[1]);
  }
  return '';
}

const HEADING_LINE = /^(#{1,6})\s+(.*)$/;

function parseHeadings(lines) {
  const headings = [];
  lines.forEach((line, index) => {
    const match = HEADING_LINE.exec(line);
    if (match) headings.push({ level: match[1].length, heading: match[2].trim(), lineIndex: index });
  });
  return headings;
}

function sectionEndIndex(lines, headings, position) {
  const current = headings[position];
  const next = headings.slice(position + 1).find((heading) => heading.level <= current.level);
  return next ? next.lineIndex - 1 : lines.length - 1;
}

export function parseSections(relativePath, text) {
  const lines = text.split('\n');
  const headings = parseHeadings(lines);
  return headings.map((current, position) => {
    const endIndex = sectionEndIndex(lines, headings, position);
    const bytes = Buffer.byteLength(lines.slice(current.lineIndex, endIndex + 1).join('\n'), 'utf8');
    return {
      path: relativePath,
      heading: current.heading,
      level: current.level,
      startLine: current.lineIndex + 1,
      endLine: endIndex + 1,
      bytes,
      tokens: Math.floor(bytes / BYTES_PER_TOKEN)
    };
  });
}

export function normalizeHeading(heading) {
  return heading.replace(/^#+\s*/, '').trim().toLowerCase();
}
