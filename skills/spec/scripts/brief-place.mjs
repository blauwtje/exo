import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseFlags, isMain } from '#script-flags';
import { settingValue } from '#settings-store';
import { scratchPath } from '#scratch-path';
import { SPECS_FOLDER, SPECS_SCRATCH } from '#shared-values';

const USAGE = 'usage: brief-place.mjs --topic <topic> [--issue <n>]';
const GATE_SCRIPTS = ['check', 'test', 'typecheck'];

function ghLine(args) {
  const answer = spawnSync('gh', args, { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : '';
}

function issueAuthor(number) {
  const author = ghLine(['issue', 'view', number, '--json', 'author', '--jq', '.author.login']);
  const login = ghLine(['api', 'user', '--jq', '.login']);
  if (author === '' || login === '') return 'unknown';
  return author === login ? 'same' : 'other';
}

function landGate(cwd) {
  try {
    const scripts = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts ?? {};
    const name = GATE_SCRIPTS.find((script) => Object.hasOwn(scripts, script));
    return name === undefined ? 'none' : `npm run ${name}`;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return 'none';
  }
}

export function briefPlace({ topic, issue, cwd }) {
  const mode = settingValue('specs');
  const lines = [
    `Mode: ${mode}`,
    `Brief: ${mode === 'issues' ? 'none' : `${SPECS_FOLDER}/${topic}.md`}`,
    `Scratch: ${scratchPath(cwd, path.join(SPECS_SCRATCH, `${topic}.md`))}`
  ];
  if (issue !== undefined) lines.push(`Issue author: ${issueAuthor(issue)}`);
  lines.push(`Land gate: ${landGate(cwd)}`);
  return `${lines.join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { topic: 'value', issue: 'value' }, { usage: USAGE });
  if (flags.topic === undefined) throw new Error(USAGE);
  process.stdout.write(briefPlace({ topic: flags.topic, issue: flags.issue, cwd: process.cwd() }));
}
