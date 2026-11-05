import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './skill-graph-files.mjs';
import { normalizeHeading } from './skill-graph-sections.mjs';

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

export function cmdOverlap(graph, jsonFile) {
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
