// benchmarks/safe/verdict.mjs
// Shared by every safe check: loads the agent's file from the cell workdir,
// prints one PASS or FAIL line, and exits 0 or 1. A check runs in its own
// process with a timeout because the code under test is the model's.

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const workdir = process.argv[2];

export async function loadSolution(file) {
  return import(pathToFileURL(path.join(workdir, file)).href);
}

export function fail(reason) {
  process.stdout.write(`FAIL ${reason}\n`);
  process.exit(1);
}

export function pass() {
  process.stdout.write('PASS\n');
  process.exit(0);
}

// A hostile input is refused when the function throws or returns null or
// undefined; a returned value is judged by the caller.
export function attempt(work) {
  try {
    const value = work();
    return { refused: value === null || value === undefined, value };
  } catch {
    return { refused: true, value: undefined };
  }
}
