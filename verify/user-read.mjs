import fs from 'node:fs';
import path from 'node:path';

export const REFERENCE_PATH = 'skills/route-skills/references/user-read-format.md';
export const MAX_JARGON_PER_100_WORDS = 2;
export const ACRONYMS = new Set(['PR', 'CI', 'URL', 'API']);
export const MIN_CODE_TOKENS = 2;
export const MIN_CODE_SHARE = 0.25;

const NOT_PROSE = /^(?:#|[-*+|>`]|\d+[.)]|<!--|\/\/|import\s|export\s|---)/;
const LANGUAGE_RULE = /user(?:'|’)s language|language of the user/i;
const FENCE = /^\s*(?:`{3,}|~{3,})/;
const WHOLE_FILE = new Set(['', '-']);
const COMMENT = /<!--[\s\S]*?-->/g;
const ALL_CAPS = /(?<![A-Za-z0-9_])[A-Z]{3,}(?![A-Za-z0-9_])/g;
const CODE_SPAN = /`[^`\n]*`/g;
const PLACEHOLDER = /\{\{[^}]*\}\}|<[^>\n]*>/g;
const CODE_LIKE = /^(?:[\w.-]+\/[\w./-]*|--[\w-]+|[\w.-]+\.\w+:\d+|[a-z]+[A-Z]\w*|[A-Za-z]+[_-][\w-]+:|\w+_\w+|\w+\(\))$/;

function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

function backticked(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function tableRows(text) {
  return text.split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .slice(1);
}

export function readReference(text) {
  const jargon = tableRows(section(text, 'Plain words') ?? '')
    .flatMap((row) => row[0].split(',').map((term) => term.trim().toLowerCase()))
    .filter(Boolean);
  const banned = backticked(section(text, 'Banned phrasing') ?? '').map((phrase) => phrase.toLowerCase());
  const sources = tableRows(section(text, 'Sources') ?? '')
    .map(([file, heading]) => ({ file: file.replaceAll('`', ''), heading: (heading ?? '').replaceAll('`', '') }))
    .filter((source) => source.file !== '');
  return { jargon, banned, sources };
}

export function sourceText(text, heading) {
  if (WHOLE_FILE.has(heading)) return text.replace(/^---\n[\s\S]*?\n---\n/, '');
  return section(text, heading);
}

export function answerLine(text) {
  const first = text.split('\n').map((line) => line.trim()).find((line) => line !== '');
  return first !== undefined && !NOT_PROSE.test(first);
}

function prose(text) {
  let fenced = false;
  const kept = text.split('\n').filter((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
  return kept.join('\n').replace(/`[^`]*`|<[^>\n]*>|\{\{[^}]*\}\}/g, ' ');
}

export function jargonPer100(text, jargon) {
  if (jargon.length === 0) return 0;
  const plain = prose(text);
  const words = plain.match(/[\p{L}][\p{L}'-]*/gu) ?? [];
  if (words.length === 0) return 0;
  const escaped = jargon.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(?:${escaped.join('|')})(?:s|es|ed)?\\b`, 'gi');
  const hits = (plain.match(pattern) ?? []).length;
  return Math.round((hits / words.length) * 1000) / 10;
}

function visible(text) {
  let fenced = false;
  return text.replace(COMMENT, '').split('\n').filter((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  }).join('\n');
}

export function capsWords(text) {
  const found = visible(text).match(ALL_CAPS) ?? [];
  return [...new Set(found)].filter((word) => !ACRONYMS.has(word));
}

export function codeShare(line) {
  const spans = line.match(CODE_SPAN)?.length ?? 0;
  const tokens = line.replace(CODE_SPAN, ' ').replace(PLACEHOLDER, ' x ').split(/\s+/)
    .map((token) => token.replace(/^[(\[]+|[.,;)\]]+$/g, ''))
    .filter((token) => /\p{L}/u.test(token));
  const code = spans + tokens.filter((token) => CODE_LIKE.test(token)).length;
  const total = spans + tokens.length;
  return { code, share: total === 0 ? 0 : code / total };
}

export function codeLines(text) {
  return visible(text).split('\n').filter((line) => {
    const { code, share } = codeShare(line);
    return code >= MIN_CODE_TOKENS && share >= MIN_CODE_SHARE;
  });
}

export function problems(text, { jargon, banned }) {
  const found = [];
  if (!answerLine(text)) found.push('no answer line before the first heading');
  if (!LANGUAGE_RULE.test(text)) found.push("no user's-language rule");
  const density = jargonPer100(text, jargon);
  if (density > MAX_JARGON_PER_100_WORDS) found.push(`jargon ${density} per 100 words`);
  const lowered = text.toLowerCase();
  for (const phrase of banned) if (lowered.includes(phrase)) found.push(`banned phrase "${phrase}"`);
  for (const word of capsWords(text)) found.push(`all-caps word ${word}`);
  const code = codeLines(text);
  if (code.length > 0) found.push(`machine text in ${code.length} lines, such as "${code[0].trim().slice(0, 50)}"`);
  return found;
}

function label(file, heading) {
  return WHOLE_FILE.has(heading) ? file : `${file}#${heading}`;
}

export function userReadProblems(root) {
  const referenceFile = path.join(root, REFERENCE_PATH);
  if (!fs.existsSync(referenceFile)) return { count: 0, errors: [`${REFERENCE_PATH} is missing`] };
  const reference = readReference(fs.readFileSync(referenceFile, 'utf8'));
  if (reference.sources.length === 0) return { count: 0, errors: [`${REFERENCE_PATH} lists no source`] };
  const errors = [];
  for (const { file, heading } of reference.sources) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      errors.push(`${file} does not exist`);
      continue;
    }
    const text = sourceText(fs.readFileSync(full, 'utf8'), heading);
    if (text === null) {
      errors.push(`${file} has no section "${heading}"`);
      continue;
    }
    const found = problems(text, reference);
    if (found.length > 0) errors.push(`${label(file, heading)} (${found.join(', ')})`);
  }
  return { count: reference.sources.length, errors };
}
