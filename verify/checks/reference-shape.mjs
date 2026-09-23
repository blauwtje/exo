// Every reference a skill reads holds one topic: it names no other reference,
// so a reader never follows a chain past the file SKILL.md sent it to, and one
// longer than REFERENCE_CONTENTS_LINES opens with a contents list linking
// each of its sections, so a partial read still finds its place. No SKILL.md
// table row leaves "Read it when" empty; the reference tables check owns
// whether every reference has a row. A skill in PENDING_TRIM.references skips
// the first two rules until its trim and fails once it already meets them.

import fs from 'node:fs';
import path from 'node:path';
import { markdownTargets, resolveMarkdownTarget } from '../markdown.mjs';
import { referenceTableEntries } from './reference-tables.mjs';
import { PENDING_TRIM, REFERENCE_CONTENTS_LINES } from '../budgets.mjs';

const FENCE = /^\s*(`{3,}|~{3,})/;

function referenceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return referenceFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

// The level-two headings outside fenced code, in order, with their line index.
export function sectionHeadings(lines) {
  const headings = [];
  let fence = null;
  lines.forEach((line, index) => {
    const opener = FENCE.exec(line);
    if (opener !== null) {
      const marker = opener[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return;
    }
    if (fence === null && line.startsWith('## ')) headings.push({ text: line.slice(3).trim(), index });
  });
  return headings;
}

export function headingAnchor(heading) {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/ /g, '-');
}

// The contents list sits before the first section, under a `## Contents`
// heading or as a plain list, and links every other level-two heading.
function contentsProblem(lines) {
  const headings = sectionHeadings(lines);
  const sections = headings.filter((heading) => heading.text !== 'Contents');
  if (sections.length === 0) return null;
  const lead = lines.slice(0, sections[0].index).join('\n');
  const missing = sections.filter((heading) => !lead.includes(`](#${headingAnchor(heading.text)})`));
  return missing.length > 0
    ? `its contents list before the first section does not link ${missing.map((heading) => heading.text).join(', ')}`
    : null;
}

function namedReferences(file, text) {
  return markdownTargets(text).filter((target) => {
    const resolved = resolveMarkdownTarget(file, target);
    return resolved !== null
      && resolved !== file
      && path.basename(path.dirname(resolved)) === 'references'
      && fs.existsSync(resolved);
  });
}

export function checkReferenceShape(report, repository) {
  const failures = [];
  const pending = [];
  let count = 0;
  for (const skillFile of repository.everySkillFile()) {
    const skillDirectory = path.dirname(skillFile);
    const skill = path.basename(skillDirectory);
    const skillRelative = repository.relative(skillFile);
    const rows = referenceTableEntries(repository.text(skillFile));
    for (const row of rows) {
      if (row.readWhen === '') failures.push(`${skillRelative}: the row for ${row.path} leaves "Read it when" empty`);
    }
    const shapeProblems = [];
    for (const file of referenceFiles(path.join(skillDirectory, 'references'))) {
      count += 1;
      const relative = repository.relative(file);
      const lines = repository.lines(file);
      if (lines.length > REFERENCE_CONTENTS_LINES) {
        const problem = contentsProblem(lines);
        if (problem !== null) shapeProblems.push(`${relative} has ${lines.length} lines and ${problem}`);
      }
      const named = namedReferences(file, repository.text(file));
      if (named.length > 0) shapeProblems.push(`${relative} names ${named.join(', ')}: link each reference from SKILL.md instead`);
    }
    if (PENDING_TRIM.references.includes(skill)) {
      if (shapeProblems.length === 0) failures.push(`${skill} meets the reference shape: remove it from PENDING_TRIM.references in verify/budgets.mjs`);
      else pending.push(skill);
      continue;
    }
    failures.push(...shapeProblems);
  }
  report.assert(
    failures.length === 0,
    'reference shape',
    `${count} references name no other reference and open with contents past ${REFERENCE_CONTENTS_LINES} lines, and every table row says when to read it; pending trim: ${pending.join(', ') || 'none'}`,
    failures.join('; ')
  );
}
