import fs from 'node:fs';
import { UsageError } from '#script-flags';

const LIST_SUMMARY = /^\d+ entr(y|ies)(\s|$)/;
const STDIN = '-';

export function parseUrlLines(text) {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !LIST_SUMMARY.test(line))
    .map((line) => line.split(/\s/)[0]);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readSource(source) {
  if (source === STDIN) return readStdin();
  try {
    return fs.readFileSync(source, 'utf8');
  } catch (error) {
    throw new UsageError(`cannot read --from ${source}: ${error.code ?? error.message}`);
  }
}

export async function readListed(sources) {
  const urls = [];
  for (const source of sources) {
    const found = parseUrlLines(await readSource(source));
    if (found.length === 0) throw new UsageError(`--from ${source} holds no url`);
    urls.push(...found);
  }
  return urls;
}
