#!/usr/bin/env node

import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { SPEC, USAGE, readOptions } from './options.mjs';
import { watchAll } from './watch.mjs';

async function main(argv) {
  const options = readOptions(parseFlags(argv, SPEC, { usage: USAGE }));
  const results = await watchAll(options);
  for (const result of results) {
    if (result.line) console.log(result.line);
    if (result.failure) console.error(result.failure);
  }
  return results.some((result) => result.failure) ? 1 : 0;
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
