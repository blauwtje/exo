import fs from 'node:fs';
import path from 'node:path';
import { commentSpans } from '../../lib/code-comments.mjs';

const NAME = 'script help';
const ENTRY_POINT = /^#!|\bisMain\(/m;
const HELP_LITERAL = /['"`]--help['"`]/.source;
const HELP_FLAG = new RegExp([
  `(?:===?|includes\\(|\\bcase)\\s*${HELP_LITERAL}`,
  `${HELP_LITERAL}\\s*===?`,
  `${HELP_LITERAL}[^\\]\\n;]*\\]\\s*\\.includes\\(`,
].join('|'));
const PARSE_FLAGS_USAGE = /parseFlags\([^;]*\{\s*usage\b/;

function entryPoints(repository) {
  return repository.skillDirectories()
    .map((skill) => path.join(repository.skillsRoot, skill, 'scripts'))
    .filter((folder) => fs.existsSync(folder))
    .flatMap((folder) => fs.readdirSync(folder).sort().map((name) => path.join(folder, name)))
    .filter((file) => file.endsWith('.mjs') && fs.statSync(file).isFile())
    .filter((file) => ENTRY_POINT.test(repository.text(file)));
}

function withoutComments(file, source) {
  let code = '';
  let pos = 0;
  for (const span of commentSpans(file, source)) {
    code += source.slice(pos, span.from);
    pos = span.to;
  }
  return code + source.slice(pos);
}

function answersHelp(file, source) {
  const code = withoutComments(file, source);
  return HELP_FLAG.test(code) || PARSE_FLAGS_USAGE.test(code);
}

export function checkScriptHelp(report, repository) {
  const scripts = entryPoints(repository);
  const missing = scripts.filter((file) => !answersHelp(file, repository.text(file)));
  if (missing.length === 0) {
    report.result('PASS', NAME, `${scripts.length} skill entry-point scripts have a --help path`);
    return;
  }
  for (const file of missing) {
    report.result('FAIL', NAME, `${repository.relative(file)} has no --help path; pass usage to parseFlags or compare against '--help'`);
  }
}
