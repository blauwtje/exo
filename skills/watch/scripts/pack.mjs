#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { WATCH_BATCH_TOKENS } from '#shared-values';

const USAGE = [
  'usage: node pack.mjs --lines <file>',
  `Packs the transcript.mjs output lines into one batch per researcher: each file of a chunks folder alone, a video over ${WATCH_BATCH_TOKENS} tokens alone, short videos together up to ${WATCH_BATCH_TOKENS} tokens.`
].join('\n');
const CHUNKS = / chunks=(.+) \(\d+ files\)$/;
const FIELD = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;

function videoOf(text) {
  const chunks = CHUNKS.exec(text)?.[1];
  const fields = Object.fromEntries([...text.replace(CHUNKS, '').matchAll(FIELD)].map(([, key, value]) => [key, value]));
  if (!fields.transcript || !/^\d+$/.test(fields.tokens ?? '')) throw new Error(`not a transcript line: ${text}`);
  return { transcript: fields.transcript, tokens: Number(fields.tokens), chunks };
}

export function pack(lines) {
  const batches = [];
  let shared = [];
  let sharedTokens = 0;
  const closeShared = () => {
    if (shared.length > 0) batches.push(shared);
    shared = [];
    sharedTokens = 0;
  };
  for (const video of lines.map(videoOf)) {
    if (video.chunks) {
      const files = fs.readdirSync(video.chunks).sort();
      batches.push(...files.map((name) => [`${video.chunks}/${name}`]));
    } else if (video.tokens > WATCH_BATCH_TOKENS) {
      batches.push([video.transcript]);
    } else {
      if (sharedTokens + video.tokens > WATCH_BATCH_TOKENS) closeShared();
      shared.push(video.transcript);
      sharedTokens += video.tokens;
    }
  }
  closeShared();
  return batches;
}

if (isMain(import.meta.url)) {
  try {
    const flags = parseFlags(process.argv.slice(2), { lines: 'string' }, { usage: USAGE });
    if (flags.lines === undefined) throw new UsageError(USAGE);
    const lines = fs.readFileSync(flags.lines, 'utf8').split('\n').filter((entry) => entry.startsWith('id='));
    const out = pack(lines).map((reads, index) => [`Batch ${index + 1}:`, ...reads.map((file) => `Reads: ${file}`)].join('\n'));
    process.stdout.write(`${out.join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? USAGE_EXIT : 1);
  }
}
