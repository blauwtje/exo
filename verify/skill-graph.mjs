#!/usr/bin/env node
// skill-graph.mjs: a read-only index over the exo skill corpus, rebuilt from
// disk on every run. It answers the facts an agent would otherwise grep for:
// where a section starts and ends, what links or points at a file, which
// literal strings a check or test pins to a doc, and how a reference set
// shapes up. Nothing here writes to the repository; every command prints
// compact text (or JSON for `json`), never a whole file.
//
// Usage: node skill-graph.mjs <command> [args]
//   size <skill>
//   range <path-or-skill> <heading text or prefix> [--sed]
//   inbound <path>[#heading]
//   pins <skill|path>
//   refs <skill>
//   overlap <json-file>
//   json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BYTES_PER_TOKEN } from './budgets.mjs';
import { markdownBody } from './markdown.mjs';

// ---------------------------------------------------------------------------
// Repository discovery
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function relFromRoot(absolutePath) {
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

function listDocFiles() {
  const files = [];
  const skillsDir = path.join(ROOT, 'skills');
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) files.push(skillMd);
    const referencesDir = path.join(skillsDir, entry.name, 'references');
    if (fs.existsSync(referencesDir)) {
      for (const ref of fs.readdirSync(referencesDir)) {
        if (ref.endsWith('.md')) files.push(path.join(referencesDir, ref));
      }
    }
  }
  const agentsDir = path.join(ROOT, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const agent of fs.readdirSync(agentsDir)) {
      if (agent.endsWith('.md')) files.push(path.join(agentsDir, agent));
    }
  }
  for (const rootDoc of ['README.md', 'CONTRIBUTING.md', 'CLAUDE.md']) {
    const full = path.join(ROOT, rootDoc);
    if (fs.existsSync(full)) files.push(full);
  }
  const docsSkillsDir = path.join(ROOT, 'docs', 'skills');
  if (fs.existsSync(docsSkillsDir)) {
    for (const doc of fs.readdirSync(docsSkillsDir)) {
      if (doc.endsWith('.md')) files.push(path.join(docsSkillsDir, doc));
    }
  }
  return files;
}

function listCodeFiles() {
  const files = [];
  const hooksDir = path.join(ROOT, 'hooks');
  if (fs.existsSync(hooksDir)) {
    for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
      if (entry.isFile()) files.push(path.join(hooksDir, entry.name));
    }
  }
  const verifyMjs = path.join(ROOT, 'verify.mjs');
  if (fs.existsSync(verifyMjs)) files.push(verifyMjs);
  files.push(...walkFilesWithExtension(path.join(ROOT, 'verify'), '.mjs'));
  files.push(...walkFilesWithExtension(path.join(ROOT, 'tests'), '.mjs'));
  return files;
}

function skillNameFromPath(relativePath) {
  const match = /^skills\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Frontmatter and section parsing
// ---------------------------------------------------------------------------

// Mirrors the frontmatter shape verify/frontmatter.mjs reads: an opening and
// closing `---` line and one `key: value` per line between them.
function readDescription(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return '';
  const closing = lines.indexOf('---', 1);
  if (closing < 0) return '';
  for (const line of lines.slice(1, closing)) {
    const match = /^description: +(.+)$/.exec(line);
    if (!match) continue;
    const raw = match[1];
    if (raw.startsWith('"')) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return '';
}

function parseSections(relativePath, text) {
  const lines = text.split('\n');
  const headingLine = /^(#{1,6})\s+(.*)$/;
  const headings = [];
  lines.forEach((line, index) => {
    const match = headingLine.exec(line);
    if (match) headings.push({ level: match[1].length, heading: match[2].trim(), lineIndex: index });
  });
  const sections = [];
  headings.forEach((current, position) => {
    let endIndex = lines.length - 1;
    for (let next = position + 1; next < headings.length; next += 1) {
      if (headings[next].level <= current.level) {
        endIndex = headings[next].lineIndex - 1;
        break;
      }
    }
    const bytes = Buffer.byteLength(lines.slice(current.lineIndex, endIndex + 1).join('\n'), 'utf8');
    sections.push({
      path: relativePath,
      heading: current.heading,
      level: current.level,
      startLine: current.lineIndex + 1,
      endLine: endIndex + 1,
      bytes,
      tokens: Math.floor(bytes / BYTES_PER_TOKEN)
    });
  });
  return sections;
}

function normalizeHeading(heading) {
  return heading.replace(/^#+\s*/, '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Link edges: markdown links and backticked paths
// ---------------------------------------------------------------------------

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

function extractLinks(relativePath, lines) {
  const edges = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(MD_LINK)) {
      const target = resolveLinkTarget(relativePath, match[1]);
      if (target) edges.push({ kind: 'link', from: relativePath, fromLine: index + 1, to: target.path, toAnchor: target.anchor });
    }
    for (const match of line.matchAll(BACKTICK_SPAN)) {
      const candidate = match[1];
      if (candidate.startsWith('#')) continue; // heading reference, not a path
      if (!looksLikePath(candidate)) continue;
      const target = resolveLinkTarget(relativePath, candidate);
      if (target) edges.push({ kind: 'link', from: relativePath, fromLine: index + 1, to: target.path, toAnchor: target.anchor });
    }
  });
  return edges;
}

// ---------------------------------------------------------------------------
// Pointer edges: "`## Heading` in `skill`" prose, either order, same line
// ---------------------------------------------------------------------------

const BACKTICK_HEADING = /`(#{1,6}\s[^`]+)`/g;

function escapeForRegExp(text) {
  return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function mentionsSkill(line, skillName) {
  if (line.includes('`' + skillName + '`')) return true;
  const bare = new RegExp(`(?<![\\w-])${escapeForRegExp(skillName)}(?![\\w-])`);
  return bare.test(line);
}

// A line often carries several clauses; a heading named in one clause is not
// pointed at by a skill named in another. Splitting on a period followed by a
// capital letter or a backtick approximates sentence boundaries without
// having to parse backtick spans first.
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

function extractPointers(graph, relativePath, lines) {
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

// ---------------------------------------------------------------------------
// Pin edges: 20+ char literals in verify/tests source that occur verbatim
// in a doc
// ---------------------------------------------------------------------------

const STRING_LITERAL = /"([^"\\]{20,})"|'([^'\\]{20,})'|`([^`\\]{20,})`/g;

function extractPins(codeFiles, docFiles) {
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

// ---------------------------------------------------------------------------
// Graph assembly
// ---------------------------------------------------------------------------

function buildGraph() {
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

// ---------------------------------------------------------------------------
// Argument resolution shared by commands
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdSize(graph, skillName) {
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
  // Rounded up, so a body the skill body budgets check fails never reads as at its ceiling here.
  const bodyTokens = Math.ceil(bodyBytes / BYTES_PER_TOKEN);
  const description = readDescription(text);
  console.log(`${file} body-bytes=${bodyBytes} body-tokens=${bodyTokens} description-chars=${description.length}`);
  const sections = graph.sections.filter((s) => s.path === file);
  for (const section of sections) {
    console.log(`${section.startLine}-${section.endLine} ${section.tokens} ${'#'.repeat(section.level)} ${section.heading}`);
  }
}

function cmdRange(graph, target, headingQuery, useSed) {
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

function cmdInbound(graph, query) {
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

function cmdPins(graph, scope) {
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

function hasTableOfContents(lines) {
  const head = lines.slice(0, 20);
  if (head.some((line) => /^#+\s*Contents\b/i.test(line))) return true;
  let run = 0;
  for (const line of head) {
    if (/^[-*]\s*\[[^\]]+\]\([^)]+\)/.test(line)) {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function cmdRefs(graph, skillName) {
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

function cmdOverlap(graph, jsonFile) {
  const raw = fs.readFileSync(path.resolve(jsonFile), 'utf8');
  const tasks = JSON.parse(raw);
  const byPath = new Map();
  tasks.forEach((task, taskIndex) => {
    for (const fileEntry of task.files || []) {
      const bucket = byPath.get(fileEntry.path) || [];
      bucket.push({ taskIndex, task: task.task, anchor: fileEntry.anchor || null });
      byPath.set(fileEntry.path, bucket);
    }
  });
  let printed = false;
  for (const [filePath, entries] of byPath) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        const sameAnchor = a.anchor && b.anchor && normalizeHeading(a.anchor) === normalizeHeading(b.anchor);
        const label = sameAnchor ? `same-anchor:${a.anchor}` : 'file-only';
        console.log(`${a.task} <-> ${b.task} : ${filePath} (${label})`);
        printed = true;
      }
    }
  }
  if (!printed) console.log('(no overlapping files between tasks)');
}

function cmdJson(graph) {
  const { root: _root, filesByPath: _filesByPath, ...serializable } = graph;
  console.log(JSON.stringify(serializable));
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

function main() {
  const [command, ...args] = process.argv.slice(2);
  const graph = buildGraph();

  switch (command) {
    case 'size':
      cmdSize(graph, args[0]);
      break;
    case 'range': {
      const sedFlagIndex = args.indexOf('--sed');
      const useSed = sedFlagIndex >= 0;
      const positional = useSed ? [...args.slice(0, sedFlagIndex), ...args.slice(sedFlagIndex + 1)] : args;
      cmdRange(graph, positional[0], positional.slice(1).join(' '), useSed);
      break;
    }
    case 'inbound':
      cmdInbound(graph, args[0]);
      break;
    case 'pins':
      cmdPins(graph, args[0]);
      break;
    case 'refs':
      cmdRefs(graph, args[0]);
      break;
    case 'overlap':
      cmdOverlap(graph, args[0]);
      break;
    case 'json':
      cmdJson(graph);
      break;
    default:
      console.error('usage: skill-graph.mjs <size|range|inbound|pins|refs|overlap|json> [args]');
      process.exitCode = 1;
  }
}

main();
