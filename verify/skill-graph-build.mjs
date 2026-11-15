import fs from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '#basics';
import { SCHEME, HARNESS_ROOT_FILES } from './markdown.mjs';
import { ROOT, relFromRoot, listDocFiles, listCodeFiles, skillNameFromPath, parseSections, normalizeHeading } from './skill-graph-files.mjs';

const MD_LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const BACKTICK_SPAN = /`([^`]+)`/g;

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

function extractLinks(relativePath, lines) {
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

function mentionsSkill(line, skillName) {
  if (line.includes('`' + skillName + '`')) return true;
  const bare = new RegExp(`(?<![\\w-])${escapeRegExp(skillName)}(?![\\w-])`);
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

function pointerEdges(graph, origin, line) {
  const edges = [];
  for (const sentence of splitIntoSentences(line)) {
    const headings = [...sentence.matchAll(BACKTICK_HEADING)].map((m) => m[1]);
    const others = headings.length === 0
      ? []
      : graph.skillNames.filter((name) => name !== origin.skill && mentionsSkill(sentence, name));
    const pairs = others.flatMap((skillName) => headings.map((heading) => [skillName, heading]));
    for (const [skillName, heading] of pairs) {
      const target = resolveHeadingTarget(graph, skillName, heading);
      edges.push({
        kind: 'pointer',
        from: origin.path,
        fromLine: origin.line,
        to: target.path,
        toAnchor: target.anchor,
        resolved: target.resolved
      });
    }
  }
  return edges;
}

function extractPointers(graph, relativePath, lines) {
  const selfSkill = skillNameFromPath(relativePath);
  return lines.flatMap((line, index) => {
    return pointerEdges(graph, { path: relativePath, skill: selfSkill, line: index + 1 }, line);
  });
}

const STRING_LITERAL = /"([^"\\]{20,})"|'([^'\\]{20,})'|`([^`\\]{20,})`/g;

function pinsInDoc(origin, doc, literal) {
  const docLineIndex = doc.lines.findIndex((docLine) => docLine.includes(literal));
  if (docLineIndex < 0) return [];
  return [{
    kind: 'pin',
    from: origin.path,
    fromLine: origin.line,
    to: doc.path,
    toLine: docLineIndex + 1,
    text: literal
  }];
}

function pinEdges(origin, docs, line) {
  const literals = [...line.matchAll(STRING_LITERAL)].map((match) => match[1] ?? match[2] ?? match[3]);
  return literals.flatMap((literal) => docs.flatMap((doc) => pinsInDoc(origin, doc, literal)));
}

function extractPins(codeFiles, docFiles) {
  const docs = docFiles.map((doc) => ({ path: doc.path, lines: doc.text.split('\n') }));
  return codeFiles.flatMap((code) => {
    return code.text.split('\n').flatMap((line, index) => pinEdges({ path: code.path, line: index + 1 }, docs, line));
  });
}

export function buildGraph() {
  const docPaths = listDocFiles();
  const codePaths = listCodeFiles();

  const docFiles = docPaths.map((absolute) => ({ path: relFromRoot(absolute), text: fs.readFileSync(absolute, 'utf8') }));
  const codeFiles = codePaths.map((absolute) => ({ path: relFromRoot(absolute), text: fs.readFileSync(absolute, 'utf8') }));

  const files = [...docFiles, ...codeFiles].map((f) => ({
    kind: 'file',
    path: f.path,
    bytes: Buffer.byteLength(f.text, 'utf8'),
    skill: skillNameFromPath(f.path)
  }));

  const skillNames = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name);

  const sections = [];
  for (const doc of docFiles) sections.push(...parseSections(doc.path, doc.text));

  const graph = { root: ROOT, files, skillNames, sections, links: [], pointers: [], pins: [] };

  for (const doc of docFiles) {
    const lines = doc.text.split('\n');
    graph.links.push(...extractLinks(doc.path, lines));
    graph.pointers.push(...extractPointers(graph, doc.path, lines));
  }
  graph.pins = extractPins(codeFiles, docFiles);

  graph.filesByPath = new Map(files.map((f) => [f.path, f]));
  graph.edges = [...graph.links, ...graph.pointers, ...graph.pins];
  return graph;
}
