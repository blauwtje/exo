import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isMain } from '#script-flags';
import { killTree } from './process-tree.mjs';

const MAX_CONCURRENCY = 6;

export const poolSize = (count) => Math.max(1, Math.min(count, MAX_CONCURRENCY, os.availableParallelism() - 1));

export function projectNodeFlags(root) {
  let script;
  try {
    script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.test;
  } catch {
    return [];
  }
  const words = String(script ?? '').trim().split(/\s+/);
  const testAt = words.indexOf('--test');
  if (words[0] !== 'node' || testAt < 0) return [];
  return words.slice(1, testAt);
}

function runFile(file, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const chunks = [];
    let timedOut = false;
    const child = spawn(process.execPath, [...projectNodeFlags(cwd), '--test', '--test-reporter=spec', file], { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => chunks.push(Buffer.from(String(error.message))));
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ file, status, timedOut, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function runTestFiles(files, options) {
  const results = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const index = next++;
      results[index] = await runFile(files[index], options);
    }
  };
  await Promise.all(Array.from({ length: poolSize(files.length) }, worker));
  return results;
}

export function parseTestPool(stdout) {
  return JSON.parse(stdout.trim().split('\n').pop());
}

export function testPoolCommand(files) {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(import.meta.url))} ${files.map((file) => JSON.stringify(file)).join(' ')}`;
}

if (isMain(import.meta.url)) {
  const timeoutMs = Number(process.env.EXO_TEST_POOL_TIMEOUT_MS);
  const results = await runTestFiles(process.argv.slice(2), { cwd: process.cwd(), env: process.env, timeoutMs });
  process.stdout.write(`${JSON.stringify(results)}\n`);
}
