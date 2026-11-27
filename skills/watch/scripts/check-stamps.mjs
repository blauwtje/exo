#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { storeFolder } from './store.mjs';

const USAGE = [
  'usage: node check-stamps.mjs --answer <file> | --notes <file> [--notes <file> ...]',
  'With --notes, each line that opens with a stamp link is a note and the first text in double quotes after the stamp is its quote; prints notes, quoted and dropped counts, one keep: <note line as written> per kept note in file order and one drop: <file>:<line> per dropped note; exit 1 when one is dropped.',
  'With --answer, checks every stamp link of the file against <id>/transcript.txt in the kept watch folder (<config directory>/exo/watch, or EXO_WATCH_STORE); prints checked, exact, off and unchecked counts and one line per off stamp.',
  'Exit codes: 0 no off stamp; 1 an off stamp; 2 bad usage.'
].join('\n');

const LINK = /\[[^\]]*\]\(https:\/\/(?:youtu\.be\/([\w-]{11})\?t=(\d+)|www\.youtube\.com\/watch\?v=([\w-]{11})&t=(\d+)s)\)/g;
const BARE = /\[\d+(?::\d{2}){1,2}\](?!\()/g;
const LINE_START = /^\[[^\]]*\]\(https:\/\/youtu\.be\/[\w-]{11}\?t=(\d+)\)/gm;

const NOTE = /^\[[^\]]*\]\(https:\/\/(?:youtu\.be\/([\w-]{11})\?t=(\d+)|www\.youtube\.com\/watch\?v=([\w-]{11})&t=(\d+)s)\)(?:[^"\n]*"([^"\n]*)")?/;
const STAMP_PREFIX = /^\[[^\]]*\]\([^)]*\)\s*/;

const squash = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const startOf = (line) => {
  const match = line.match(/^\[[^\]]*\]\(https:\/\/youtu\.be\/[\w-]{11}\?t=(\d+)\)/);
  return match ? Number(match[1]) : undefined;
};

const startsOf = (transcript) => [...transcript.matchAll(LINE_START)].map((match) => Number(match[1]));

export function checkStamps(text, transcriptOf) {
  const result = { checked: 0, exact: 0, off: 0, unchecked: 0, offs: [] };
  const starts = new Map();
  for (const match of text.matchAll(LINK)) {
    const id = match[1] ?? match[3];
    const second = Number(match[2] ?? match[4]);
    result.checked += 1;
    if (!starts.has(id)) {
      const transcript = transcriptOf(id);
      starts.set(id, transcript === undefined ? undefined : startsOf(transcript));
    }
    const lines = starts.get(id);
    if (lines === undefined) {
      result.unchecked += 1;
    } else if (lines.includes(second)) {
      result.exact += 1;
    } else {
      result.off += 1;
      result.offs.push({ stamp: match[0], nearest: Math.min(...lines.map((start) => Math.abs(start - second))) });
    }
  }
  const bare = text.replace(LINK, '').match(BARE)?.length ?? 0;
  result.checked += bare;
  result.unchecked += bare;
  return result;
}

function isQuoted(note, transcript) {
  const quote = squash(note[5] ?? '');
  if (!quote || transcript === undefined) return false;
  const lines = transcript.split('\n');
  const at = lines.findIndex((line) => startOf(line) === Number(note[2] ?? note[4]));
  if (at === -1) return false;
  const joined = squash(`${lines[at].replace(STAMP_PREFIX, '')} ${(lines[at + 1] ?? '').replace(STAMP_PREFIX, '')}`);
  return ` ${joined} `.includes(` ${quote} `);
}

export function checkNotes(text, transcriptOf) {
  const result = { notes: 0, quoted: 0, drops: [] };
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const note = line.match(NOTE);
    if (!note) return;
    result.notes += 1;
    if (isQuoted(note, transcriptOf(note[1] ?? note[3]))) result.quoted += 1;
    else result.drops.push(index + 1);
  });
  return result;
}

function mainNotes(files, transcriptOf) {
  const total = { notes: 0, quoted: 0 };
  const drops = [];
  const keeps = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const result = checkNotes(text, transcriptOf);
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (NOTE.test(line) && !result.drops.includes(index + 1)) keeps.push(`keep: ${line}`);
    });
    total.notes += result.notes;
    total.quoted += result.quoted;
    drops.push(...result.drops.map((line) => `drop: ${file}:${line}`));
  }
  console.log(`notes=${total.notes} quoted=${total.quoted} dropped=${drops.length}`);
  for (const line of [...keeps, ...drops]) console.log(line);
  return drops.length > 0 ? 1 : 0;
}

function main(argv) {
  const flags = parseFlags(argv, { answer: 'string', notes: 'list' }, { usage: USAGE });
  if (!flags.answer && !flags.notes) throw new UsageError('give --answer <file> or --notes <file>');
  const folder = storeFolder();
  const transcriptOf = (id) => {
    const file = path.join(folder, id, 'transcript.txt');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  };
  if (flags.notes) return mainNotes(flags.notes, transcriptOf);
  const result = checkStamps(fs.readFileSync(flags.answer, 'utf8'), transcriptOf);
  console.log(`checked=${result.checked} exact=${result.exact} off=${result.off} unchecked=${result.unchecked}`);
  for (const { stamp, nearest } of result.offs) console.log(`off: ${stamp} nearest=${nearest}`);
  return result.off > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
