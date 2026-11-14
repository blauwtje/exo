import fs from 'node:fs';
import path from 'node:path';

const OPTION_LINE = /^\s*- \*\*\(([A-Z])\)/;
const RECOMMENDED_TAG = /\(Recommended\)/;
const ASSUMING = /^\s*(?:[-*]\s+)?Assuming:/;

function sourceFiles(repository, extra) {
  return [repository.skillsRoot, ...['agents', ...extra, 'lib'].map((name) => repository.join(name))]
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(md|mjs)$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .sort();
}

function questionOptionFindings(repository) {
  const files = sourceFiles(repository, ['output-styles']);
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

const QUESTION_CAPS = { title: 10, context: 15, label: 3, option: 8, reason: 8 };

const QUESTION_TITLE = /^\*\*(?:\d+\/\d+ )?([^*]+\?)\*\*$/;
const QUESTION_OPTION = /^- \*\*\(([A-Z])\) ([^*]+)\*\*: (\S.*)$/;
const QUESTION_REASON = /^Recommended: \(([A-Z])\), because (\S.*)$/;

const words = (text) => text.trim().split(/\s+/).length;

function isFence(line) {
  return /^\s*```/.test(line);
}

function blockAfter(lines, open) {
  let end = open + 1;
  while (end < lines.length && !isFence(lines[end])) end++;
  return lines.slice(open + 1, end).map((line) => line.trim());
}

function exceedsContextCap(block) {
  const blank = block.indexOf('');
  const context = block.slice(1, blank < 0 ? block.length : blank).join(' ');
  const sentences = context.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
  return sentences.length > 1 || sentences.some((sentence) => words(sentence) > QUESTION_CAPS.context);
}

function exceedsLineCap(text) {
  const option = text.match(QUESTION_OPTION);
  if (option && (words(option[2]) > QUESTION_CAPS.label || words(option[3]) > QUESTION_CAPS.option)) return true;
  const reason = text.match(QUESTION_REASON);
  return Boolean(reason) && words(reason[2]) > QUESTION_CAPS.reason;
}

function blockOffenders(block) {
  const offsets = [];
  if (words(block[0].match(QUESTION_TITLE)[1]) > QUESTION_CAPS.title) offsets.push(1);
  if (exceedsContextCap(block)) offsets.push(2);
  block.forEach((text, index) => {
    if (exceedsLineCap(text)) offsets.push(index + 1);
  });
  return offsets;
}

function fileCapFindings(repository, file) {
  const lines = repository.lines(file);
  const findings = [];
  lines.forEach((line, open) => {
    if (!isFence(line) || !QUESTION_TITLE.test((lines[open + 1] ?? '').trim())) return;
    const path = repository.relative(file);
    for (const offset of blockOffenders(blockAfter(lines, open))) findings.push({ path, line: open + 1 + offset });
  });
  return findings;
}

function questionCapFindings(repository) {
  return sourceFiles(repository, []).flatMap((file) => fileCapFindings(repository, file));
}

export function checkQuestionOptions(report, repository) {
  const capFindings = questionCapFindings(repository);
  report.assert(
    capFindings.length === 0,
    'question caps',
    { pass: 'every example question keeps the word caps', fail: `example question over a word cap at ${capFindings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}` }
  );
  const findings = questionOptionFindings(repository);
  report.assert(
    findings.length === 0,
    'question options',
    { pass: 'every question lists its options in order A, B, C, none is tagged (Recommended), and no line opens with Assuming:', fail: `option out of order, a (Recommended) tag or an Assuming: line at ${findings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}` }
  );
}
