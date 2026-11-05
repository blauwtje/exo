import path from 'node:path';
import { isTestPath } from '#red-green';

const REMOVED_ASSERTION = /expect\(|assert/;

const ADDED_SKIP = /\.(?:skip|only)\b/;

const SILENCER = /eslint-disable|@ts-(?:ignore|nocheck|expect-error)|#\s*(?:noqa|type:\s*ignore|pylint:\s*disable)|\/\/\s*nolint|biome-ignore|(?:istanbul|c8) ignore/;

const PROSE_FILE = /\.(?:md|mdx|txt|rst)$/;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const FILE_HEADER = /^(?:---|\+\+\+) (?:[ab]\/)?(.*?)\t?$/;

const WARN_TEXT_LENGTH = 100;

function testLineHits({ file, line, pattern, at }) {
  if (file === null || !isTestPath(file) || !pattern.test(line)) return [];
  return [{ file, at, text: line.slice(1).trim() }];
}

function unreplacedRemovals({ removed, assertions }, added) {
  const removedTexts = new Set(removed.map(({ text }) => text));
  const replacements = assertions.filter(({ text }) => !removedTexts.has(text)).length;
  return removed.filter(({ text }) => !added.has(text)).slice(replacements);
}

export function weakenedTests(patch) {
  const added = new Set();
  const hunks = [];
  const skips = [];
  let file = null;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of patch.split('\n')) {
    const hunk = oldLeft === 0 && newLeft === 0 ? line.match(HUNK_HEADER) : null;
    const header = oldLeft === 0 && newLeft === 0 ? line.match(FILE_HEADER) : null;
    if (hunk !== null) {
      [oldLine, newLine] = [Number(hunk[1]), Number(hunk[3])];
      [oldLeft, newLeft] = [Number(hunk[2] ?? 1), Number(hunk[4] ?? 1)];
      hunks.push({ removed: [], assertions: [] });
    } else if (header !== null) {
      if (header[1] !== '/dev/null') file = header[1];
    } else if (oldLeft > 0 && line.startsWith('-')) {
      hunks.at(-1).removed.push(...testLineHits({ file, line, pattern: REMOVED_ASSERTION, at: oldLine }));
      oldLeft -= 1;
      oldLine += 1;
    } else if (newLeft > 0 && line.startsWith('+')) {
      added.add(line.slice(1).trim());
      hunks.at(-1).assertions.push(...testLineHits({ file, line, pattern: REMOVED_ASSERTION, at: newLine }));
      skips.push(...testLineHits({ file, line, pattern: ADDED_SKIP, at: newLine }));
      newLeft -= 1;
      newLine += 1;
    }
  }
  const quote = (text) => `\`${text.slice(0, WARN_TEXT_LENGTH)}\``;
  return [
    ...hunks.flatMap((hunk) => unreplacedRemovals(hunk, added)).map(({ file: path, at, text }) => `${path}:${at} removed ${quote(text)}`),
    ...skips.map(({ file: path, at, text }) => `${path}:${at} added ${quote(text)}`)
  ];
}

export function silencedChecks(patch) {
  const findings = [];
  let file = null;
  let oldLeft = 0;
  let newLeft = 0;
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const idle = oldLeft === 0 && newLeft === 0;
    const hunk = idle ? line.match(HUNK_HEADER) : null;
    const header = idle ? line.match(FILE_HEADER) : null;
    if (hunk !== null) {
      [oldLeft, newLeft, newLine] = [Number(hunk[2] ?? 1), Number(hunk[4] ?? 1), Number(hunk[3])];
    } else if (header !== null) {
      if (header[1] !== '/dev/null') file = header[1];
    } else if (oldLeft > 0 && line.startsWith('-')) {
      oldLeft -= 1;
    } else if (newLeft > 0 && line.startsWith('+')) {
      if (!PROSE_FILE.test(file) && SILENCER.test(line)) findings.push(`${file}:${newLine} silenced \`${line.slice(1).trim().slice(0, WARN_TEXT_LENGTH)}\``);
      newLeft -= 1;
      newLine += 1;
    }
  }
  return findings;
}
