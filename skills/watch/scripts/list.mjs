#!/usr/bin/env node

import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { SPEC, USAGE, readListOptions } from './list-options.mjs';
import { listProfile } from './listing.mjs';

async function main(argv) {
  const options = readListOptions(parseFlags(argv, SPEC, { usage: USAGE }));
  const result = await listProfile(options);
  if (result.failure) {
    console.error(result.failure);
    return 1;
  }
  console.log(result.lines.join('\n'));
  return 0;
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
