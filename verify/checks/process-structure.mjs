// Each process file opens with an H1, then a stance/enemy/overcorrection
// paragraph, and closes on a non-empty Judgment section.

import path from 'node:path';
import { markdownBody } from '../markdown.mjs';

const H1 = /^# [^\r\n]+\r?$/m;
const H2 = /^## (?<name>[^\r\n]+)\r?$/gm;
const BLANK_LINE = /\r?\n\s*\r?\n/;
const OPENING = /^(?!This (?:skill|reference|file)\b)[A-Z][^.]+\.\s+The enemy is [^.]+\.\s+The overcorrection is [^.]+\./;

export function checkProcessStructure(report, repository) {
  const errors = [];
  for (const file of repository.processFiles()) {
    const relative = repository.relative(file);
    const body = markdownBody(path.basename(file), repository.text(file));
    const heading = H1.exec(body);
    if (heading === null) {
      errors.push(`${relative}: missing H1`);
      continue;
    }
    const afterHeading = body.slice(heading.index + heading[0].length).replace(/^\s+/, '');
    const opening = afterHeading.split(BLANK_LINE)[0].replace(/\r?\n/g, ' ').trim();
    if (!OPENING.test(opening)) {
      errors.push(`${relative}: opening stance/enemy/overcorrection contract failed`);
    }
    const sections = [...body.matchAll(H2)];
    const last = sections[sections.length - 1];
    if (last === undefined || last.groups.name.trim() !== 'Judgment') {
      errors.push(`${relative}: final H2 is not Judgment`);
      continue;
    }
    const judgment = body.slice(last.index + last[0].length).trim();
    if (judgment === '') {
      errors.push(`${relative}: Judgment is empty`);
    }
  }
  report.assert(
    errors.length === 0,
    'process structure',
    'every process file opens and closes with the required structure',
    errors.join('; ')
  );
}
