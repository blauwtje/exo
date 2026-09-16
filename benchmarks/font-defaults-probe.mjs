#!/usr/bin/env node
// benchmarks/font-defaults-probe.mjs
// Asks models, with no plugin and no user settings, to name a display and a
// body typeface for sixteen unrelated briefs, then counts the distinct briefs
// each family was picked for. A family picked for two or more unrelated
// subjects is a default rather than a choice, and belongs in
// skills/designing/scripts/overused-fonts.mjs. Every call is billed, so the
// probe prints its call count and stops until --confirm is given. With
// --avoid-overused the prompt forbids every family the list already bans, which
// shows the faces a generated design falls back on next.
//
//   node benchmarks/font-defaults-probe.mjs --out <file.json> [--runs <n>] [--avoid-overused] [--confirm]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { OVERUSED_FONTS } from '../skills/designing/scripts/overused-fonts.mjs';
import { MODELS } from './tasks.mjs';

const USAGE = 'usage: font-defaults-probe.mjs --out <file.json> [--runs <n>] [--avoid-overused] [--confirm]';
const BRIEFS = [
  'a landing page for an independent bakery that sells sourdough by subscription',
  'the marketing site of a developer tool that profiles database queries',
  'a portfolio for an architecture photographer',
  'a dashboard for a hospital pharmacy tracking medicine stock',
  'the website of a small jazz festival in a coastal town',
  'a landing page for a climate-tech startup selling heat pumps to landlords',
  'a personal finance app for teenagers',
  'the homepage of a law firm specialising in maritime disputes',
  'an online shop for handmade ceramics',
  'a documentation site for an open-source vector database',
  'a booking page for a mountain hut in the Alps',
  'a newsletter archive for a long-form science magazine',
  "the site of a children's museum about the human body",
  'a SaaS pricing page for an AI meeting-notes product',
  'a restaurant menu site for a Korean barbecue place',
  "a public dashboard of a city's air quality sensors"
];
const PROBE_MODELS = [MODELS.sonnet, MODELS.opus];
const CONCURRENCY = 4;
const DEFAULT_BRIEF_COUNT = 2;
const DISALLOWED_TOOLS = 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch';
// "Source Serif 4" and "Source Serif Pro" are one family to a reader of a page.
const VERSION_SUFFIX = / (?:\d+|Pro)$/;

function parseArguments(argv) {
  const options = { out: null, runs: 3, avoidOverused: false, confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--confirm') {
      options.confirm = true;
    } else if (flag === '--avoid-overused') {
      options.avoidOverused = true;
    } else if (flag === '--out') {
      index += 1;
      options.out = argv[index];
    } else if (flag === '--runs') {
      index += 1;
      options.runs = Number(argv[index]);
    } else {
      throw new Error(`unknown flag ${flag}\n${USAGE}`);
    }
  }
  if (!options.out) throw new Error(USAGE);
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs takes a positive integer');
  return options;
}

function askForTypefaces(brief, model, avoided) {
  const avoidance = avoided.length === 0 ? '' : `Do not use any of these families: ${avoided.join(', ')}. `;
  const prompt = `Choose the typefaces for ${brief}. You decide; do not ask questions. ${avoidance}`
    + 'Reply with exactly two lines and nothing else:\ndisplay: <font family name>\nbody: <font family name>';
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-probe-'));
  const args = ['-p', prompt, '--model', model, '--output-format', 'text', '--setting-sources', 'project,local',
    '--strict-mcp-config', '--disallowedTools', DISALLOWED_TOOLS, '--max-turns', '1'];
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] });
    let reply = '';
    let complaint = '';
    child.stdout.on('data', (chunk) => { reply += chunk; });
    // A pipe nobody reads fills and blocks the child once its buffer is full.
    child.stderr.on('data', (chunk) => { complaint += chunk; });
    child.on('error', (error) => {
      fs.rmSync(workdir, { recursive: true, force: true });
      resolve({ reply: '', error: error.message });
    });
    child.on('close', (code) => {
      fs.rmSync(workdir, { recursive: true, force: true });
      const failure = `claude exited ${code}: ${complaint.trim().slice(0, 200)}`;
      resolve({ reply: reply.trim(), error: code === 0 ? null : failure });
    });
  });
}

function pickedFamilies(reply) {
  const picked = [];
  for (const role of ['display', 'body']) {
    const line = reply.match(new RegExp(`^\\s*\\**${role}\\**\\s*:\\s*(.+)$`, 'im'));
    if (line === null) continue;
    const named = line[1].replace(/[*`"']/g, '').split(/[,(]/)[0].trim();
    picked.push(named.replace(VERSION_SUFFIX, ''));
  }
  return picked;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const jobs = BRIEFS.flatMap((brief) => PROBE_MODELS.flatMap((model) =>
    Array.from({ length: options.runs }, () => ({ brief, model }))));
  if (!options.confirm) {
    console.log(`${jobs.length} billed calls on ${PROBE_MODELS.join(', ')}; add --confirm to run them`);
    return;
  }
  const avoided = options.avoidOverused ? [...OVERUSED_FONTS] : [];
  const answers = [];
  let nextJob = 0;
  async function worker() {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob];
      nextJob += 1;
      const { reply, error } = await askForTypefaces(job.brief, job.model, avoided);
      const families = pickedFamilies(reply);
      answers.push({ ...job, reply, error, families });
      console.log(`${answers.length}/${jobs.length} ${job.model}: ${families.join(' / ') || error || 'unparsed'}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const briefsByFamily = new Map();
  for (const answer of answers) {
    for (const family of answer.families) {
      const briefs = briefsByFamily.get(family) ?? new Set();
      briefs.add(answer.brief);
      briefsByFamily.set(family, briefs);
    }
  }
  const tally = [...briefsByFamily]
    .map(([family, briefs]) => ({ family, briefs: briefs.size }))
    .sort((left, right) => right.briefs - left.briefs || left.family.localeCompare(right.family));
  const defaults = tally.filter((entry) => entry.briefs >= DEFAULT_BRIEF_COUNT).map((entry) => entry.family);
  const unparsed = answers.filter((answer) => answer.families.length < 2).length;
  fs.writeFileSync(options.out, `${JSON.stringify({ models: PROBE_MODELS, runs: options.runs, avoided, unparsed, defaults, tally, answers }, null, 2)}\n`);
  console.log(`defaults (picked for ${DEFAULT_BRIEF_COUNT}+ briefs): ${defaults.join(', ')}; unparsed answers: ${unparsed}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
