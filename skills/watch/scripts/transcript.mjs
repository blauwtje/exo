#!/usr/bin/env node

import process from 'node:process';
import { limitLifetime } from '#lifetime';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { SPEC, USAGE, readOptions } from './options.mjs';
import { readListed } from './url-list.mjs';
import { watchBatch, summaryLine, exitCodeOf } from './batch.mjs';

function report(outcome) {
  if (outcome.line) console.log(outcome.line);
  if (outcome.failure) console.error(outcome.failure);
}

function quoted(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

function withoutInputs(args) {
  return args.filter((arg, index) => !['--url', '--from'].includes(arg) && !['--url', '--from'].includes(args[index - 1]));
}

function restartFor(args, fromStdin) {
  return (open) => {
    const words = fromStdin ? [...withoutInputs(args), ...open.flatMap((url) => ['--url', url])] : args;
    return ['node', ...words].map(quoted).join(' ');
  };
}

async function main(argv) {
  const flags = parseFlags(argv, SPEC, { usage: USAGE });
  const options = readOptions(flags, await readListed(flags.from ?? []));
  limitLifetime('watch-transcript', 1800000 + options.rateWaitMs);
  const restart = restartFor(process.argv.slice(1), (flags.from ?? []).includes('-'));
  const outcomes = await watchBatch({ ...options, restart }, report);
  const exitCode = exitCodeOf(outcomes);
  if (outcomes.length > 1 || exitCode === 75) console.log(summaryLine(outcomes));
  return exitCode;
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
