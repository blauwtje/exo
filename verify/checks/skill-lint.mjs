import fs from 'node:fs';
import path from 'node:path';

const NAME = 'skill lint';
const EMPHASIS = /\b(?:IMPORTANT|CRITICAL|MUST)\b/;
const EMPHASIS_LIMIT = 2;
const SCRIPT_COMMAND = /`[^`]*?([\w-]+\.mjs)([^`]*)`/g;
const FLAG = /(?<![\w-])--[a-z][a-z0-9-]*/g;
const UNSAFE = [
  { rule: 'remote-fetch', pattern: /\b(?:curl|wget)\b[^\n]*https?:\/\//i },
  { rule: 'install-hook', pattern: /\b(?:pre|post)install\b/i },
  { rule: 'claude-md-write', pattern: />>?\s*\S*CLAUDE\.md|\b(?:append|write)\w*\s+(?:\w+\s+){0,3}(?:to|into)\s+(?:the\s+)?`?(?:\S*\/)?CLAUDE\.md/i },
  { rule: 'user-prompt-submit', pattern: /["`]UserPromptSubmit["`]\s*:|\bregister\w*\b[^\n]*\bUserPromptSubmit\b/i }
];
const RITUAL = /\b(?:double[- ]check|be maximally thorough|think step by step|think carefully)\b/i;
const QUOTED = /"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/g;
const AT_MOST = /((?:\S+\s+){0,2})at most (\d+) ([a-z][a-z-]*)/gi;

function skillMarkdown(repository) {
  return repository.walk(repository.skillsRoot, (file) => file.endsWith('.md'));
}

function scriptSource(repository, markdownFile, scriptName) {
  const skillFolder = path.relative(repository.skillsRoot, markdownFile).split(path.sep)[0];
  const folder = path.join(repository.skillsRoot, skillFolder, 'scripts');
  if (!fs.existsSync(path.join(folder, scriptName))) return null;
  return fs.readdirSync(folder)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => repository.text(path.join(folder, name)))
    .join('\n');
}

function unknownFlags(tail, source) {
  return (tail.replace(/\$\([^)]*\)/g, '').match(FLAG) ?? [])
    .filter((flag) => flag !== '--help')
    .filter((flag) => !source.includes(flag) && !source.includes(flag.slice(2)));
}

function missingFlags(repository, file, lines) {
  const rows = [];
  lines.forEach((line, index) => {
    for (const [, scriptName, tail] of line.matchAll(SCRIPT_COMMAND)) {
      const source = scriptSource(repository, file, scriptName);
      if (source === null) continue;
      for (const flag of unknownFlags(tail, source)) {
        rows.push({ path: repository.relative(file), line: index + 1, rule: `flag-missing ${flag}` });
      }
    }
  });
  return rows;
}

function excessEmphasis(repository, file, lines) {
  const hits = lines.map((line, index) => (EMPHASIS.test(line) ? index + 1 : 0)).filter(Boolean);
  if (hits.length <= EMPHASIS_LIMIT) return [];
  return [{ path: repository.relative(file), line: hits[EMPHASIS_LIMIT], rule: 'emphasis' }];
}

function unsafeLines(repository, file, lines) {
  const rows = [];
  lines.forEach((line, index) => {
    for (const { rule, pattern } of UNSAFE) {
      if (pattern.test(line)) rows.push({ path: repository.relative(file), line: index + 1, rule });
    }
  });
  return rows;
}

function ritualPhrases(repository, file, lines) {
  const rows = [];
  lines.forEach((line, index) => {
    if (RITUAL.test(line.replace(QUOTED, ''))) rows.push({ path: repository.relative(file), line: index + 1, rule: 'ritual' });
  });
  return rows;
}

function conflictingCounts(repository, files) {
  const rows = [];
  const seen = new Map();
  for (const file of files) {
    const skillFolder = path.relative(repository.skillsRoot, file).split(path.sep)[0];
    let heading = '';
    repository.text(file).split('\n').forEach((line, index) => {
      if (line.startsWith('#')) heading = line;
      for (const match of line.matchAll(AT_MOST)) {
        const key = `${skillFolder}\0${heading}\0${match[1].toLowerCase()}${match[3].toLowerCase()}`;
        const first = seen.get(key);
        if (!first) seen.set(key, { count: match[2], file });
        else if (first.count !== match[2]) rows.push({ path: repository.relative(file), line: index + 1, rule: `count-conflict ${match[3]}` });
      }
    });
  }
  return rows;
}

export function skillLintFindings(repository) {
  const files = skillMarkdown(repository);
  const rows = files.flatMap((file) => {
    const lines = repository.text(file).split('\n');
    return [
      ...missingFlags(repository, file, lines),
      ...excessEmphasis(repository, file, lines),
      ...unsafeLines(repository, file, lines),
      ...ritualPhrases(repository, file, lines)
    ];
  });
  return [...rows, ...conflictingCounts(repository, files)];
}

export function checkSkillLint(report, repository) {
  const findings = skillLintFindings(repository);
  if (findings.length === 0) {
    report.result('PASS', NAME, 'skill prose keeps flags, emphasis, safety and counts consistent');
    return;
  }
  for (const finding of findings) {
    report.result('FAIL', NAME, `${finding.path}:${finding.line} ${finding.rule}`);
  }
}
