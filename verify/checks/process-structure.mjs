// A process file opens with an H1, then a stance paragraph (principle, enemy,
// overcorrection; or principle, "Produce" direction, "Avoid" list), and closes on a non-empty Judgment section. A slim skill instead
// runs straight into steps (numbered only where order matters, else bullets; a numbered list runs 1, 2, ... with 2 or more items), keeps a References table, and ends on one
// `Report:` line. A pointer reference names the script that owns its rule and
// carries no process, so it holds neither shape; the text checks still read it.
// A step reference under references/ keeps the H1 but needs neither the
// stance opening nor a closing Judgment section; only SKILL.md keeps both.

import path from 'node:path';
import { markdownBody } from '../markdown.mjs';

const SLIM_SKILLS = [
  'skills/spec/SKILL.md',
  'skills/find-cause/SKILL.md',
  'skills/build/SKILL.md',
  'skills/gate/SKILL.md',
  'skills/ship/SKILL.md'
];
const POINTER_REFERENCES = ['skills/build/references/workspace.md'];

const H1 = /^# [^\r\n]+\r?$/m;
const H2 = /^## (?<name>[^\r\n]+)\r?$/gm;
const BLANK_LINE = /\r?\n\s*\r?\n/;
const NOT_META = /^(?!This (?:skill|reference|file)\b)[A-Z][^.]+\.\s+/;
const ENEMY_OPENING = new RegExp(NOT_META.source + /The enemy is [^.]+\.\s+The overcorrection is [^.]+\./.source);
const DIRECTION_OPENING = new RegExp(NOT_META.source + /Produce [^.]+\.\s+Avoid [^.]+\./.source);
const STANCE = /\bThe (?:enemy|overcorrection) is\b/;
const DROPPED_SECTION = /^#{2,} (?:Judgment|Red flags)\s*$/m;
const NUMBERED_STEP = /^(?<number>\d+)\. \S/gm;
const REFERENCES_TABLE = /^## References\r?\n\s*\r?\n\|[^\r\n]*\|\r?$/m;
const SUBSECTION_HEADING = /^#{2,3} \S/;
const LONG_LINE = 40;

function fullContractErrors(relative, body, afterHeading) {
  const errors = [];
  const opening = afterHeading.split(BLANK_LINE)[0].replace(/\r?\n/g, ' ').trim();
  if (!ENEMY_OPENING.test(opening) && !DIRECTION_OPENING.test(opening)) {
    errors.push(`${relative}: opening contract failed: principle, then enemy and overcorrection, or Produce and Avoid sentences`);
  }
  const sections = [...body.matchAll(H2)];
  const last = sections[sections.length - 1];
  if (last === undefined || last.groups.name.trim() !== 'Judgment') {
    errors.push(`${relative}: final H2 is not Judgment`);
  } else if (body.slice(last.index + last[0].length).trim() === '') {
    errors.push(`${relative}: Judgment is empty`);
  }
  return errors;
}

// Numbered steps mean order matters: each numbered list runs 1, 2, ... without
// a gap and holds at least two items. A list restarts where a number returns to 1.
function numberedListErrors(relative, body) {
  const errors = [];
  const withoutFences = body.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, '');
  const lists = [];
  for (const match of withoutFences.matchAll(NUMBERED_STEP)) {
    const number = Number(match.groups.number);
    if (number === 1 || lists.length === 0) lists.push([]);
    lists[lists.length - 1].push(number);
  }
  for (const list of lists) {
    if (list.length < 2) {
      errors.push(`${relative}: numbered list "${list.join(', ')}" has fewer than 2 items; use a bullet`);
    } else if (!list.every((value, offset) => value === offset + 1)) {
      errors.push(`${relative}: numbered list "${list.join(', ')}" does not run 1, 2, ... without a gap`);
    }
  }
  return errors;
}

function slimContractErrors(relative, body, afterHeading) {
  const errors = [...numberedListErrors(relative, body)];
  if (STANCE.test(body)) {
    errors.push(`${relative}: slim skill carries a stance/enemy/overcorrection sentence`);
  }
  if (DROPPED_SECTION.test(body)) {
    errors.push(`${relative}: slim skill keeps a Judgment or Red flags section`);
  }
  const blocks = afterHeading.split(BLANK_LINE);
  const firstBlock = (blocks[0] ?? '').trim();
  const STEP_START = /^(?:\d+\. |[a-z]\. |- )/;
  if (!/^## /.test(firstBlock) && !STEP_START.test(firstBlock)) {
    errors.push(`${relative}: slim skill opens on a paragraph instead of a heading or step 1`);
  } else if (/^## /.test(firstBlock)) {
    const nextBlock = (blocks[1] ?? '').trim();
    if (!/^## /.test(nextBlock) && !STEP_START.test(nextBlock)) {
      errors.push(`${relative}: slim skill's heading opens on a paragraph instead of step 1`);
    }
  }
  if (!REFERENCES_TABLE.test(body)) {
    errors.push(`${relative}: slim skill has no References table`);
  }
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!/^Report: \S/.test(lines[lines.length - 1] ?? '')) {
    errors.push(`${relative}: slim skill's last line does not start with Report:`);
  }
  return errors;
}

// A SKILL.md that repeats a heading text or a long line carries a pasted
// section twice. Fences and table rows repeat legitimately, so they stay out.
function repeatedTextErrors(relative, body) {
  const errors = [];
  const seen = new Set();
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const text = line.trim();
    if (inFence || text.startsWith('|')) continue;
    const isHeading = SUBSECTION_HEADING.test(text);
    if (!isHeading && text.length <= LONG_LINE) continue;
    if (seen.has(text)) {
      errors.push(`${relative}: repeats "${text.slice(0, 60)}"`);
    }
    seen.add(text);
  }
  return errors;
}

export function checkProcessStructure(report, repository) {
  const errors = [];
  for (const file of repository.processFiles()) {
    const relative = repository.relative(file);
    if (POINTER_REFERENCES.includes(relative)) continue;
    const body = markdownBody(path.basename(file), repository.text(file));
    const heading = H1.exec(body);
    if (heading === null) {
      errors.push(`${relative}: missing H1`);
      continue;
    }
    const afterHeading = body.slice(heading.index + heading[0].length).replace(/^\s+/, '');
    const isStepReference = path.basename(file) !== 'SKILL.md';
    if (!isStepReference) errors.push(...repeatedTextErrors(relative, body));
    if (SLIM_SKILLS.includes(relative)) {
      errors.push(...slimContractErrors(relative, body, afterHeading));
    } else if (!isStepReference) {
      errors.push(...fullContractErrors(relative, body, afterHeading));
    }
  }
  report.assert(
    errors.length === 0,
    'process structure',
    'every process file opens and closes with the structure its contract requires',
    errors.join('; ')
  );
}
