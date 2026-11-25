#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isMain } from '#script-flags';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROMPTS = new URL('./trigger.json', import.meta.url);
const BUDGET_USD = '0.25';
const USAGE = 'usage: trigger.mjs [skill]';

export function firedSkill(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch (error) {
    process.stderr.write(`trigger: skipped a line that is not json (${error.message})\n`);
    return undefined;
  }
  const block = event.type === 'assistant' ? event.message?.content?.find((part) => part.type === 'tool_use') : undefined;
  if (!block) return undefined;
  return block.name === 'Skill' ? block.input?.skill : null;
}

export function runOnce(prompt, skill) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--plugin-dir', ROOT, '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--max-budget-usd', BUDGET_USD];
    const child = spawn('claude', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let fired;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (fired !== undefined) return;
      const name = firedSkill(line);
      if (name === undefined) return;
      fired = name === `exo:${skill}`;
      child.kill();
    });
    child.on('error', reject);
    child.on('close', () => resolve(fired ?? false));
  });
}

export async function votesFor(prompt, skill) {
  const votes = [await runOnce(prompt, skill), await runOnce(prompt, skill)];
  if (votes[0] !== votes[1]) votes.push(await runOnce(prompt, skill));
  return votes;
}

export function isWrong(votes, shouldTrigger) {
  const fired = votes.filter(Boolean).length;
  return (fired * 2 > votes.length) !== shouldTrigger;
}

export function lineFor(skill, entry, votes) {
  return `${skill} ${votes.filter(Boolean).length}/${votes.length} "${entry.prompt}" expected ${entry.should_trigger ? 'yes' : 'no'}`;
}

async function main(only) {
  const all = JSON.parse(fs.readFileSync(PROMPTS, 'utf8'));
  const skills = only === undefined ? Object.keys(all) : [only];
  if (!skills.every((skill) => all[skill])) {
    process.stderr.write(`${USAGE}; known: ${Object.keys(all).join(', ')}\n`);
    process.exit(2);
  }
  let wrong = 0;
  let total = 0;
  for (const skill of skills) {
    const results = await Promise.all(all[skill].map(async (entry) => ({ entry, votes: await votesFor(entry.prompt, skill) })));
    for (const { entry, votes } of results) {
      process.stdout.write(`${lineFor(skill, entry, votes)}\n`);
      total += 1;
      if (isWrong(votes, entry.should_trigger)) wrong += 1;
    }
  }
  process.stdout.write(`wrong: ${wrong} of ${total}\n`);
  process.exitCode = wrong > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) await main(process.argv[2]);
