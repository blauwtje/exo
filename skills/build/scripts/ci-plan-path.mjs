#!/usr/bin/env node

import process from 'node:process';
import { isMain, parseFlags } from '#script-flags';

const PLAN_LINE = /^\/exo run (docs\/(?:plans|specs)\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.md)[ \t]*$/m;

export function planPathFrom(text) {
  const path = PLAN_LINE.exec(text ?? '')?.[1];
  if (path === undefined || path.includes('..')) return null;
  return path;
}

if (isMain(import.meta.url)) {
  parseFlags(process.argv.slice(2), {}, { usage: 'usage: EXO_TEXT=<comment text> ci-plan-path.mjs; prints plan=<path> for the first "/exo run <path>" line, else exits 2' });
  const path = planPathFrom(process.env.EXO_TEXT);
  if (path === null) {
    process.stderr.write('exo: no plan path; write "/exo run docs/plans/<name>.md" on a line of its own\n');
    process.exit(2);
  }
  process.stdout.write(`plan=${path}\n`);
}
