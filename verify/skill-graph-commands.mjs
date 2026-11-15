import fs from 'node:fs';
import path from 'node:path';
import { BYTES_PER_TOKEN } from './budgets.mjs';
import { stripFrontmatter } from './markdown.mjs';
import { ROOT, readDescription, normalizeHeading } from './skill-graph-files.mjs';

function skillFilePath(skillOrPath) {
  if (skillOrPath.includes('/')) return skillOrPath;
  return `skills/${skillOrPath}/SKILL.md`;
}

function matchesScope(nodePath, scope) {
  if (scope.includes('/') || scope.endsWith('.md')) {
    return nodePath === scope || nodePath.startsWith(scope.endsWith('/') ? scope : `${scope}/`);
  }
  return nodePath === `skills/${scope}/SKILL.md` || nodePath.startsWith(`skills/${scope}/`);
}

export function cmdSize(graph, skillName) {
  const file = `skills/${skillName}/SKILL.md`;
  const node = graph.filesByPath.get(file);
  if (!node) {
    console.error(`no such skill: ${skillName}`);
    process.exitCode = 1;
    return;
  }
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const body = stripFrontmatter(text);
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  const bodyTokens = Math.ceil(bodyBytes / BYTES_PER_TOKEN);
  const description = readDescription(text);
  console.log(`${file} body-bytes=${bodyBytes} body-tokens=${bodyTokens} description-chars=${description.length}`);
  const sections = graph.sections.filter((s) => s.path === file);
  for (const section of sections) {
    console.log(`${section.startLine}-${section.endLine} ${section.tokens} ${'#'.repeat(section.level)} ${section.heading}`);
  }
}

function findRangeSection(graph, target, headingQuery) {
  const file = skillFilePath(target);
  const sections = graph.sections.filter((s) => s.path === file);
  const wanted = headingQuery.toLowerCase();
  const exact = sections.find((s) => s.heading.toLowerCase() === wanted);
  const prefix = exact || sections.find((s) => s.heading.toLowerCase().startsWith(wanted));
  const found = prefix || sections.find((s) => s.heading.toLowerCase().includes(wanted));
  if (found) return { file, section: found };
  console.error(`no heading matching "${headingQuery}" in ${file}`);
  console.error(`available: ${sections.map((s) => s.heading).join(' | ')}`);
  process.exitCode = 1;
  return null;
}

export function cmdRange(graph, target, headingQuery) {
  const found = findRangeSection(graph, target, headingQuery);
  if (found) console.log(`${found.section.startLine} ${found.section.endLine}`);
}

export function cmdRangeSed(graph, target, headingQuery) {
  const found = findRangeSection(graph, target, headingQuery);
  if (found) console.log(`sed -n '${found.section.startLine},${found.section.endLine}p' ${found.file}`);
}

function edgeReachesTarget(edge, wanted, targetSection) {
  if (!wanted) return true;
  if (edge.kind === 'pointer' || edge.kind === 'link') {
    return Boolean(edge.toAnchor) && normalizeHeading(edge.toAnchor) === wanted;
  }
  if (!targetSection) return false;
  return edge.toLine >= targetSection.startLine && edge.toLine <= targetSection.endLine;
}

export function cmdInbound(graph, query) {
  const [targetPath, anchorPart] = query.split('#');
  const wanted = anchorPart ? normalizeHeading(anchorPart) : null;
  const targetSection = wanted
    ? graph.sections.find((s) => s.path === targetPath && normalizeHeading(s.heading) === wanted)
    : null;
  const lines = graph.edges.filter((edge) => edge.to === targetPath && edgeReachesTarget(edge, wanted, targetSection));
  if (lines.length === 0) {
    console.log(`(no inbound edges for ${query})`);
    return;
  }
  for (const edge of lines) console.log(`${edge.from}:${edge.fromLine} ${edge.kind}`);
}

export function cmdPins(graph, scope) {
  const pins = graph.pins.filter((edge) => matchesScope(edge.to, scope));
  if (pins.length === 0) {
    console.log(`(no pins for ${scope})`);
    return;
  }
  for (const pin of pins) {
    const preview = pin.text.length > 60 ? `${pin.text.slice(0, 60)}...` : pin.text;
    console.log(`${pin.to}:${pin.toLine} <- ${pin.from}:${pin.fromLine} "${preview}"`);
  }
}

export function cmdJson(graph) {
  const { root: _root, filesByPath: _filesByPath, ...serializable } = graph;
  console.log(JSON.stringify(serializable));
}

const TABLE_ROW = /^\|\s*`([^`]+\.md)`\s*\|\s*(.*?)\s*\|\s*$/;
const WHEN_CLAUSE = /\b(when|if|before|after|only)\b/i;

function findWhenClauseLine(skillMdLines, referenceRelativeRef) {
  for (const line of skillMdLines) {
    const row = TABLE_ROW.exec(line);
    if (row && row[1] === referenceRelativeRef) return row[2];
    if (!row && line.includes('`' + referenceRelativeRef + '`')) return line;
  }
  return null;
}

const LINK_ITEM = /^[-*]\s*\[[^\]]+\]\([^)]+\)/;

function hasTableOfContents(lines) {
  const head = lines.slice(0, 20);
  if (head.some((line) => /^#+\s*Contents\b/i.test(line))) return true;
  return head.map((line) => (LINK_ITEM.test(line) ? 'L' : '.')).join('').includes('LLL');
}

export function cmdRefs(graph, skillName) {
  const referencesPrefix = `skills/${skillName}/references/`;
  const referenceFiles = graph.files.filter((f) => f.path.startsWith(referencesPrefix)).map((f) => f.path);
  if (referenceFiles.length === 0) {
    console.log(`(no references under ${referencesPrefix})`);
    return;
  }
  const skillMdPath = `skills/${skillName}/SKILL.md`;
  const skillMdLines = fs.readFileSync(path.join(ROOT, skillMdPath), 'utf8').split('\n');

  for (const referencePath of referenceFiles) {
    const text = fs.readFileSync(path.join(ROOT, referencePath), 'utf8');
    const lines = text.split('\n');
    const relativeRef = `references/${path.basename(referencePath)}`;
    const whenText = findWhenClauseLine(skillMdLines, relativeRef);
    const hasWhen = whenText !== null && WHEN_CLAUSE.test(whenText);
    const toc = hasTableOfContents(lines);
    const depthViolations = graph.links.filter(
      (edge) => edge.from === referencePath && edge.to.includes('/references/') && edge.to !== referencePath
    );
    const violationText = depthViolations.length > 0 ? depthViolations.map((e) => `${e.to}@${e.fromLine}`).join(',') : 'none';
    console.log(
      `${referencePath} lines=${lines.length} toc=${toc} when-clause=${hasWhen} depth-violations=${violationText}`
    );
  }
}

function overlapLines(filePath, entries) {
  const lines = [];
  entries.forEach((a, i) => {
    for (const b of entries.slice(i + 1)) {
      const sameAnchor = a.anchor && b.anchor && normalizeHeading(a.anchor) === normalizeHeading(b.anchor);
      const label = sameAnchor ? `same-anchor:${a.anchor}` : 'file-only';
      lines.push(`${a.task} <-> ${b.task} : ${filePath} (${label})`);
    }
  });
  return lines;
}

export function cmdOverlap(graph, jsonFile) {
  const raw = fs.readFileSync(path.resolve(jsonFile), 'utf8');
  const tasks = JSON.parse(raw);
  const byPath = new Map();
  tasks.forEach((task) => {
    for (const fileEntry of task.files || []) {
      const bucket = byPath.get(fileEntry.path) || [];
      bucket.push({ task: task.task, anchor: fileEntry.anchor || null });
      byPath.set(fileEntry.path, bucket);
    }
  });
  const lines = [...byPath].flatMap(([filePath, entries]) => overlapLines(filePath, entries));
  if (lines.length === 0) console.log('(no overlapping files between tasks)');
  for (const line of lines) console.log(line);
}
