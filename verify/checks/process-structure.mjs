// A process file opens with an H1, then a stance/enemy/overcorrection
// paragraph, and closes on a non-empty Judgment section. A slim skill instead
// runs straight into numbered steps, keeps a References table, and ends on one
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
  'skills/verify/SKILL.md',
  'skills/ship/SKILL.md'
];
const POINTER_REFERENCES = ['skills/build/references/workspace.md'];

const H1 = /^# [^\r\n]+\r?$/m;
const H2 = /^## (?<name>[^\r\n]+)\r?$/gm;
const BLANK_LINE = /\r?\n\s*\r?\n/;
const OPENING = /^(?!This (?:skill|reference|file)\b)[A-Z][^.]+\.\s+The enemy is [^.]+\.\s+The overcorrection is [^.]+\./;
const STANCE = /\bThe (?:enemy|overcorrection) is\b/;
const DROPPED_SECTION = /^#{2,} (?:Judgment|Red flags)\s*$/m;
const NUMBERED_STEP = /^(?<number>\d+)\. \S/gm;
const REFERENCES_TABLE = /^## References\r?\n\s*\r?\n\|[^\r\n]*\|\r?$/m;
const MIN_STEPS = 3;
const SUBSECTION_HEADING = /^#{2,3} \S/;
const LONG_LINE = 40;

function fullContractErrors(relative, body, afterHeading) {
  const errors = [];
  const opening = afterHeading.split(BLANK_LINE)[0].replace(/\r?\n/g, ' ').trim();
  if (!OPENING.test(opening)) {
    errors.push(`${relative}: opening stance/enemy/overcorrection contract failed`);
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

function slimContractErrors(relative, body, afterHeading) {
  const errors = [];
  if (STANCE.test(body)) {
    errors.push(`${relative}: slim skill carries a stance/enemy/overcorrection sentence`);
  }
  if (DROPPED_SECTION.test(body)) {
    errors.push(`${relative}: slim skill keeps a Judgment or Red flags section`);
  }
  const blocks = afterHeading.split(BLANK_LINE);
  const firstBlock = (blocks[0] ?? '').trim();
  const STEP_START = /^(?:\d+\. |[a-z]\. )/;
  if (!/^## /.test(firstBlock) && !STEP_START.test(firstBlock)) {
    errors.push(`${relative}: slim skill opens on a paragraph instead of a heading or step 1`);
  } else if (/^## /.test(firstBlock)) {
    const nextBlock = (blocks[1] ?? '').trim();
    if (!/^## /.test(nextBlock) && !STEP_START.test(nextBlock)) {
      errors.push(`${relative}: slim skill's heading opens on a paragraph instead of step 1`);
    }
  }
  const numbers = [...body.matchAll(NUMBERED_STEP)].map((match) => Number(match.groups.number));
  const run = numbers.findIndex((number, index) => number === 1 && numbers[index + MIN_STEPS - 1] === MIN_STEPS
    && numbers.slice(index, index + MIN_STEPS).every((value, offset) => value === offset + 1));
  if (run === -1) {
    errors.push(`${relative}: slim skill has no numbered steps 1 to ${MIN_STEPS}`);
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
