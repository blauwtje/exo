#!/usr/bin/env node

import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { SPEC, USAGE, readOptions } from './options.mjs';
import { readListed } from './url-list.mjs';
import { watchBatch, summaryLine, exitCodeOf } from './batch.mjs';

function report(outcome) {
  if (outcome.line) console.log(outcome.line);
  if (outcome.failure) console.error(outcome.failure);
}

async function main(argv) {
  const flags = parseFlags(argv, SPEC, { usage: USAGE });
  const options = readOptions(flags, await readListed(flags.from ?? []));
  const outcomes = await watchBatch(options, report);
  if (outcomes.length > 1) console.log(summaryLine(outcomes));
  return exitCodeOf(outcomes);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(error.message);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    },
  );
}
