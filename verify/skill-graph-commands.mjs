import fs from 'node:fs';
import path from 'node:path';
import { BYTES_PER_TOKEN } from './budgets.mjs';
import { markdownBody } from './markdown.mjs';
import { ROOT } from './skill-graph-files.mjs';
import { readDescription, normalizeHeading } from './skill-graph-sections.mjs';

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
  const body = markdownBody(path.basename(file), text);
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  const bodyTokens = Math.ceil(bodyBytes / BYTES_PER_TOKEN);
  const description = readDescription(text);
  console.log(`${file} body-bytes=${bodyBytes} body-tokens=${bodyTokens} description-chars=${description.length}`);
  const sections = graph.sections.filter((s) => s.path === file);
  for (const section of sections) {
    console.log(`${section.startLine}-${section.endLine} ${section.tokens} ${'#'.repeat(section.level)} ${section.heading}`);
  }
}

export function cmdRange(graph, target, headingQuery, useSed) {
  const file = skillFilePath(target);
  const sections = graph.sections.filter((s) => s.path === file);
  const wanted = headingQuery.toLowerCase();
  const exact = sections.find((s) => s.heading.toLowerCase() === wanted);
  const prefix = exact || sections.find((s) => s.heading.toLowerCase().startsWith(wanted));
  const loose = prefix || sections.find((s) => s.heading.toLowerCase().includes(wanted));
  if (!loose) {
    console.error(`no heading matching "${headingQuery}" in ${file}`);
    console.error(`available: ${sections.map((s) => s.heading).join(' | ')}`);
    process.exitCode = 1;
    return;
  }
  if (useSed) console.log(`sed -n '${loose.startLine},${loose.endLine}p' ${file}`);
  else console.log(`${loose.startLine} ${loose.endLine}`);
}

export function cmdInbound(graph, query) {
  const [filePart, anchorPart] = query.split('#');
  const targetPath = filePart;
  const wanted = anchorPart ? normalizeHeading(anchorPart) : null;
  const targetSection = wanted
    ? graph.sections.find((s) => s.path === targetPath && normalizeHeading(s.heading) === wanted)
    : null;

  const lines = [];
  for (const edge of graph.edges) {
    if (edge.to !== targetPath) continue;
    if (!wanted) {
      lines.push(edge);
      continue;
    }
    if (edge.kind === 'pointer' || edge.kind === 'link') {
      if (edge.toAnchor && normalizeHeading(edge.toAnchor) === wanted) lines.push(edge);
    } else if (edge.kind === 'pin' && targetSection) {
      if (edge.toLine >= targetSection.startLine && edge.toLine <= targetSection.endLine) lines.push(edge);
    }
  }
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
