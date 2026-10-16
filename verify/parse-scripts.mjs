// Runs node --check on every path read from stdin, one per line, several at a
// time, and prints a JSON array of { file, message } for each that fails to parse.
// The syntax check calls it once instead of starting one node per script in turn.

import { spawn } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const files = input.split('\n').filter((line) => line !== '');
const failures = [];

function parse(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file]);
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status !== 0) failures.push({ file, message: output.split('\n').join(' ').trim() });
      resolve();
    });
  });
}

let next = 0;
async function worker() {
  while (next < files.length) await parse(files[next++]);
}
await Promise.all(Array.from({ length: os.availableParallelism() }, worker));

failures.sort((left, right) => files.indexOf(left.file) - files.indexOf(right.file));
process.stdout.write(JSON.stringify(failures));
