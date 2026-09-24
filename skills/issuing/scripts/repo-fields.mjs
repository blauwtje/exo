#!/usr/bin/env node
// The vocabulary `issuing` fills an issue or a pull request from, and the
// Size, Estimate and Priority a fixed ladder computes so two sessions land
// on the same numbers.
//
//   node repo-fields.mjs --size --paths <n> --criteria <n> --shape spec|report
//     [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]
//
// --size takes no gh call and no cache: it sizes max(paths, criteria) against
// a fixed table, reads the matching estimate off it, and ranks the item's
// priority by its shape and, for a report, --shipped, or for a spec,
// --blocking, against the four-way rank the options list (or P0/P1/P2 with
// none given) carries. It prints one compact JSON line and exits 0.
// A usage error prints nothing to stdout and exits 2.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { UsageError, parseFlags } from '#script-flags';

const SIZE_LADDER = [
  { upTo: 1, size: 'XS' },
  { upTo: 3, size: 'S' },
  { upTo: 6, size: 'M' },
  { upTo: 12, size: 'L' }
];
const ESTIMATE_BY_SIZE = { XS: 1, S: 2, M: 3, L: 8, XL: 13 };
const DEFAULT_PRIORITY = { highest: 'P0', middle: 'P1', lowest: 'P2' };

function sizeForCount(count) {
  const step = SIZE_LADDER.find((candidate) => count <= candidate.upTo);
  return step ? step.size : 'XL';
}

// A report only takes --shipped, a spec only --blocking, into the same
// four-way rank: report+shipped highest, the other report and spec+blocking
// both middle, a plain spec lowest.
function priorityCategory({ shape, shipped, blocking }) {
  if (shape === 'report') return shipped ? 'highest' : 'middle';
  if (shape === 'spec') return blocking ? 'middle' : 'lowest';
  throw new UsageError(`--shape must be 'spec' or 'report', got '${shape}'`);
}

// With options the highest is the first and the lowest the last; the middle
// is the option at Math.floor((n-1)/2), which is already index 0 for n<=2.
function priorityForCategory(category, options) {
  if (!options || options.length === 0) return DEFAULT_PRIORITY[category];
  if (category === 'highest') return options[0];
  if (category === 'lowest') return options[options.length - 1];
  return options[Math.floor((options.length - 1) / 2)];
}

/** The Size, Estimate and Priority a body's paths, criteria and shape carry. */
export function sizeFields({ paths, criteria, shape, shipped = false, blocking = false, options }) {
  const size = sizeForCount(Math.max(paths, criteria));
  const category = priorityCategory({ shape, shipped, blocking });
  return { size, estimate: ESTIMATE_BY_SIZE[size], priority: priorityForCategory(category, options) };
}

function toCount(value, name) {
  if (value === undefined || !/^\d+$/.test(value)) throw new UsageError(`--${name} needs a non-negative integer`);
  return Number(value);
}

// null when --size is absent, so a future default-mode call falls through
// to whichever reading path handles it.
function readSizeFlags(argv) {
  const flags = parseFlags(argv, {
    size: 'boolean',
    paths: 'value',
    criteria: 'value',
    shape: 'value',
    shipped: 'boolean',
    blocking: 'boolean',
    options: 'value'
  });
  if (!flags.size) return null;
  const paths = toCount(flags.paths, 'paths');
  const criteria = toCount(flags.criteria, 'criteria');
  if (flags.shape !== 'spec' && flags.shape !== 'report') {
    throw new UsageError(`--shape must be 'spec' or 'report', got '${flags.shape}'`);
  }
  const options = flags.options ? flags.options.split(',').map((option) => option.trim()) : undefined;
  return { paths, criteria, shape: flags.shape, shipped: Boolean(flags.shipped), blocking: Boolean(flags.blocking), options };
}

function main() {
  let sizeFlags;
  try {
    sizeFlags = readSizeFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: repo-fields.mjs --size --paths <n> --criteria <n> --shape spec|report [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (sizeFlags) {
    console.log(JSON.stringify(sizeFields(sizeFlags)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}
