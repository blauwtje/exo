import fs from 'node:fs';
import path from 'node:path';

const OPTION_LINE = /^\s*- \*\*\(([A-Z])\)/;
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
    let previous = '@';
    repository.lines(file).forEach((text, index) => {
      const option = text.match(OPTION_LINE);
      const outOfOrder = option !== null && option[1] !== String.fromCharCode(previous.charCodeAt(0) + 1);
      previous = option ? option[1] : '@';
      if (outOfOrder || RECOMMENDED_TAG.test(text) || ASSUMING.test(text)) {
        findings.push({ path: repository.relative(file), line: index + 1 });
      }
    });
  }
  return findings;
}

// Word caps per part, and the most options a question offers.
export const QUESTION_CAPS = { title: 10, context: 15, label: 3, option: 8, reason: 8 };
export const MAX_OPTIONS = 3;

// The one copy of the line patterns; tests/question-shape.mjs imports them.
// Any letter parses, so a fourth option or a reason off A fails its own check.
export const QUESTION_TITLE = /^\*\*(?:\d+\/\d+ )?([^*]+\?)\*\*$/;
export const QUESTION_OPTION = /^- \*\*\(([A-Z])\) ([^*]+)\*\*: (\S.*)$/;
export const QUESTION_REASON = /^Recommended: \(([A-Z])\), because (\S.*)$/;

const words = (text) => text.trim().split(/\s+/).length;

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
      if (!/^\s*```/.test(lines[open]) || !QUESTION_TITLE.test((lines[open + 1] ?? '').trim())) continue;
      const rel = repository.relative(file);
      const flag = (offset) => findings.push({ path: rel, line: open + 1 + offset });
      let end = open + 1;
      while (end < lines.length && !/^\s*```/.test(lines[end])) end++;
      const block = lines.slice(open + 1, end).map((line) => line.trim());
      if (words(block[0].match(QUESTION_TITLE)[1]) > QUESTION_CAPS.title) flag(1);
      const blank = block.indexOf('');
      const context = block.slice(1, blank < 0 ? block.length : blank).join(' ');
      const sentences = context.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
      if (sentences.length > 1 || sentences.some((sentence) => words(sentence) > QUESTION_CAPS.context)) flag(2);
      block.forEach((text, index) => {
        const option = text.match(QUESTION_OPTION);
        if (option && (words(option[2]) > QUESTION_CAPS.label || words(option[3]) > QUESTION_CAPS.option)) flag(index + 1);
        const reason = text.match(QUESTION_REASON);
        if (reason && words(reason[2]) > QUESTION_CAPS.reason) flag(index + 1);
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
    'every question lists its options in order A, B, C, none is tagged (Recommended), and no line opens with Assuming:',
    `option out of order, a (Recommended) tag or an Assuming: line at ${findings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}`
  );
}
