import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, isMain, UsageError, USAGE_EXIT } from '#script-flags';

const USAGE = 'usage: author-check.mjs --target <skill or agent file>';
const CODE_SPAN = /```[\s\S]*?```|`[^`\n]*`/g;
const CAPS_WORD = /\b[A-Z]{2,}\b/g;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const TOP_LEVEL_KEY = /^([A-Za-z][\w-]*):/gm;

export function styleCounts(text) {
  const prose = text.replace(CODE_SPAN, '');
  const frontmatter = text.match(FRONTMATTER)?.[1] ?? '';
  return {
    lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    emDashes: (text.match(/—/g) ?? []).length,
    capsWords: (prose.match(CAPS_WORD) ?? []).length,
    keys: [...frontmatter.matchAll(TOP_LEVEL_KEY)].map((match) => match[1]),
  };
}

if (isMain(import.meta.url)) {
  try {
    const flags = parseFlags(process.argv.slice(2), { target: 'value' }, { usage: USAGE });
    if (flags.target === undefined) throw new UsageError('--target is required');
    const counts = styleCounts(fs.readFileSync(flags.target, 'utf8'));
    process.stdout.write([
      `Lines: ${counts.lines}`,
      `Em dashes: ${counts.emDashes}`,
      `CAPS words: ${counts.capsWords}`,
      `Frontmatter keys: ${counts.keys.join(', ')}`,
    ].join('\n') + '\n');
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exitCode = USAGE_EXIT;
  }
}
