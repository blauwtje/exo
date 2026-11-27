#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { WATCH_BATCH_TOKENS } from '#shared-values';
import { tokensOf } from './transcript.mjs';

const USAGE = [
  'usage: node pack.mjs --lines <file>',
  `Packs the transcript.mjs output lines into one batch per researcher: each chunk file and each short video as one item, a video over ${WATCH_BATCH_TOKENS} tokens alone, items together up to ${WATCH_BATCH_TOKENS} tokens.`
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
  const items = lines.map(videoOf).flatMap((video) => {
    if (!video.chunks) return [{ file: video.transcript, tokens: video.tokens }];
    return fs.readdirSync(video.chunks).sort().map((name) => {
      const file = `${video.chunks}/${name}`;
      return { file, tokens: tokensOf(fs.readFileSync(file, 'utf8')) };
    });
  });
  for (const item of items) {
    if (item.tokens > WATCH_BATCH_TOKENS) {
      batches.push([item.file]);
      continue;
    }
    if (sharedTokens + item.tokens > WATCH_BATCH_TOKENS) closeShared();
    shared.push(item.file);
    sharedTokens += item.tokens;
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
