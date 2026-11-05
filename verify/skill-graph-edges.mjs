import fs from 'node:fs';
import path from 'node:path';
import { ROOT, relFromRoot, skillNameFromPath } from './skill-graph-files.mjs';
import { normalizeHeading } from './skill-graph-sections.mjs';

const MD_LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const BACKTICK_SPAN = /`([^`]+)`/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HARNESS_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];

function looksLikePath(candidate) {
  if (!candidate.includes('/')) return false;
  if (candidate.includes('<') || candidate.includes('>')) return false;
  if (candidate.includes('$') || candidate.includes('*') || candidate.includes('?')) return false;
  return /^[\w.-]+(\/[\w.-]+)+\/?$/.test(candidate);
}

function resolveLinkTarget(fromPath, target) {
  const [withoutFragment, fragment] = target.split('#');
  const trimmed = withoutFragment.trim();
  if (trimmed === '' || SCHEME.test(trimmed)) return null;
  if (HARNESS_ROOT_FILES.some((name) => name.toLowerCase() === trimmed.toLowerCase())) return null;
  const fromDir = path.dirname(path.join(ROOT, fromPath));
  const resolved = path.resolve(fromDir, trimmed);
  if (!fs.existsSync(resolved)) return null;
  return { path: relFromRoot(resolved), anchor: fragment ? fragment.replace(/-/g, ' ') : null };
}

export function extractLinks(relativePath, lines) {
  const edges = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(MD_LINK)) {
      const target = resolveLinkTarget(relativePath, match[1]);
      if (target) edges.push({ kind: 'link', from: relativePath, fromLine: index + 1, to: target.path, toAnchor: target.anchor });
    }
    for (const match of line.matchAll(BACKTICK_SPAN)) {
      const candidate = match[1];
      if (candidate.startsWith('#')) continue;
      if (!looksLikePath(candidate)) continue;
      const target = resolveLinkTarget(relativePath, candidate);
      if (target) edges.push({ kind: 'link', from: relativePath, fromLine: index + 1, to: target.path, toAnchor: target.anchor });
    }
  });
  return edges;
}

const BACKTICK_HEADING = /`(#{1,6}\s[^`]+)`/g;

function escapeForRegExp(text) {
  return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function mentionsSkill(line, skillName) {
  if (line.includes('`' + skillName + '`')) return true;
  const bare = new RegExp(`(?<![\\w-])${escapeForRegExp(skillName)}(?![\\w-])`);
  return bare.test(line);
}

function splitIntoSentences(line) {
  return line.split(/(?<=\.)\s+(?=[A-Z`])/);
}

function resolveHeadingTarget(graph, skillName, headingText) {
  const wanted = normalizeHeading(headingText);
  const candidateFiles = [
    `skills/${skillName}/SKILL.md`,
    ...graph.files.filter((f) => f.path.startsWith(`skills/${skillName}/references/`)).map((f) => f.path)
  ];
  for (const file of candidateFiles) {
    const found = graph.sections.find((s) => s.path === file && normalizeHeading(s.heading) === wanted);
    if (found) return { path: file, anchor: found.heading, resolved: true };
  }
  return { path: `skills/${skillName}/SKILL.md`, anchor: headingText.replace(/^#+\s*/, '').trim(), resolved: false };
}

export function extractPointers(graph, relativePath, lines) {
  const edges = [];
  const selfSkill = skillNameFromPath(relativePath);
  lines.forEach((line, index) => {
    for (const sentence of splitIntoSentences(line)) {
      const headingMatches = [...sentence.matchAll(BACKTICK_HEADING)].map((m) => m[1]);
      if (headingMatches.length === 0) continue;
      const others = graph.skillNames.filter((name) => name !== selfSkill && mentionsSkill(sentence, name));
      for (const skillName of others) {
        for (const heading of headingMatches) {
          const target = resolveHeadingTarget(graph, skillName, heading);
          edges.push({
            kind: 'pointer',
            from: relativePath,
            fromLine: index + 1,
            to: target.path,
            toAnchor: target.anchor,
            resolved: target.resolved
          });
        }
      }
    }
  });
  return edges;
}

const STRING_LITERAL = /"([^"\\]{20,})"|'([^'\\]{20,})'|`([^`\\]{20,})`/g;

export function extractPins(codeFiles, docFiles) {
  const docLines = new Map();
  for (const doc of docFiles) docLines.set(doc.path, doc.text.split('\n'));

  const edges = [];
  for (const code of codeFiles) {
    const lines = code.text.split('\n');
    lines.forEach((line, sourceIndex) => {
      for (const match of line.matchAll(STRING_LITERAL)) {
        const literal = match[1] ?? match[2] ?? match[3];
        for (const doc of docFiles) {
          const docLineArray = docLines.get(doc.path);
          const docLineIndex = docLineArray.findIndex((docLine) => docLine.includes(literal));
          if (docLineIndex >= 0) {
            edges.push({
              kind: 'pin',
              from: code.path,
              fromLine: sourceIndex + 1,
              to: doc.path,
              toLine: docLineIndex + 1,
              text: literal
            });
          }
        }
      }
    });
  }
  return edges;
}
