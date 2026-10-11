// Every exo question recommends option A, and no text states an assumption in
// place of asking. A finding is `{ path, line }`: the file and the 1-based line
// holding a `Recommended: (<letter>)` line off A, a `(Recommended)` tag, or an `Assuming:` line. Every
// markdown and script file under skills/, agents/, output-styles/ and lib/ is read, listed skill or not, because
// the route-skills references sit outside the listed skills.

import fs from 'node:fs';
import path from 'node:path';

const RECOMMENDATION_OFF_A = /^\s*['"`]?Recommended: \((?!A\))[A-Z]\)/;
const RECOMMENDED_TAG = /\(Recommended\)/;
const ASSUMING = /^\s*(?:[-*]\s+)?Assuming:/;

export function questionOptionFindings(repository) {
  const files = [repository.skillsRoot, repository.join('agents'), repository.join('output-styles'), repository.join('lib')]
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(md|mjs)$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .sort();
  const findings = [];
  for (const file of files) {
    repository.lines(file).forEach((text, index) => {
      if (RECOMMENDATION_OFF_A.test(text) || RECOMMENDED_TAG.test(text) || ASSUMING.test(text)) {
        findings.push({ path: repository.relative(file), line: index + 1 });
      }
    });
  }
  return findings;
}

export const QUESTION_CAPS = { title: 10, context: 15, label: 3, option: 8, reason: 8 };

const words = (text) => text.trim().split(/\s+/).length;
const TITLE = /^\*\*(?:\d+\/\d+ )?([^*]+\?)\*\*$/;
const EXAMPLE_OPTION = /^- \*\*\([A-Z]\) ([^*]+)\*\*: (\S.*)$/;
const EXAMPLE_REASON = /^Recommended: \([A-Z]\), because (\S.*)$/;

// Each fenced block opening on a bold title ending in `?` is an example question;
// a finding is `{ path, line }` for every cap it breaks, at the line that breaks it.
export function questionCapFindings(repository) {
  const files = [repository.skillsRoot, repository.join('agents'), repository.join('lib')]
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(md|mjs)$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .sort();
  const findings = [];
  for (const file of files) {
    const lines = repository.lines(file);
    for (let open = 0; open < lines.length; open++) {
      if (!/^\s*```/.test(lines[open]) || !TITLE.test((lines[open + 1] ?? '').trim())) continue;
      const rel = repository.relative(file);
      const flag = (offset) => findings.push({ path: rel, line: open + 1 + offset });
      let end = open + 1;
      while (end < lines.length && !/^\s*```/.test(lines[end])) end++;
      const block = lines.slice(open + 1, end).map((line) => line.trim());
      if (words(block[0].match(TITLE)[1]) > QUESTION_CAPS.title) flag(1);
      const blank = block.indexOf('');
      const context = block.slice(1, blank < 0 ? block.length : blank).join(' ');
      const sentences = context.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
      if (sentences.length > 1 || sentences.some((sentence) => words(sentence) > QUESTION_CAPS.context)) flag(2);
      block.forEach((text, index) => {
        const option = text.match(EXAMPLE_OPTION);
        if (option && (words(option[1]) > QUESTION_CAPS.label || words(option[2]) > QUESTION_CAPS.option)) flag(index + 1);
        const reason = text.match(EXAMPLE_REASON);
        if (reason && words(reason[1]) > QUESTION_CAPS.reason) flag(index + 1);
      });
    }
  }
  return findings;
}

export function checkQuestionOptions(report, repository) {
  const capFindings = questionCapFindings(repository);
  report.assert(
    capFindings.length === 0,
    'question caps',
    'every example question keeps the word caps',
    `example question over a word cap at ${capFindings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}`
  );
  const findings = questionOptionFindings(repository);
  report.assert(
    findings.length === 0,
    'question options',
    'every recommendation sits on A, none is tagged (Recommended), and no line opens with Assuming:',
    `recommendation off A, a (Recommended) tag or an Assuming: line at ${findings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}`
  );
}
