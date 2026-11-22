#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { clusters, entryOf, readLedger } from '../skills/learn/scripts/corrections.mjs';
import { projectFolder, promptMessages, sessionFiles, toolCalls } from '../skills/learn/scripts/sessions.mjs';

const FOLLOW_UPS = 3;
const SKILL_PREFIX = 'Skill exo:';

function skillsUsed(file) {
  return toolCalls(file).filter(({ name, text }) => name === 'Skill' && text.startsWith(SKILL_PREFIX))
    .map(({ text, line }) => ({ skill: text.slice('Skill '.length), line }));
}

function correctedSession(file, session, corrections) {
  const prompts = promptMessages(file).filter(({ kind }) => kind !== 'skipped');
  const isCorrected = ({ text, timestamp }) => corrections.has(entryOf({ date: timestamp.slice(0, 10), session, text }).id);
  return (use) => prompts.filter(({ line }) => line > use.line).slice(0, FOLLOW_UPS).some(isCorrected);
}

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ledger = readLedger(cwd);
const corrections = new Set(clusters({ ...ledger, verdicts: [] }).flatMap(({ group }) => group.map(({ id }) => id)));
const totals = new Map();
for (const file of sessionFiles(projectFolder(cwd))) {
  const session = path.basename(file, '.jsonl');
  const uses = skillsUsed(file);
  const corrected = correctedSession(file, session, corrections);
  for (const skill of new Set(uses.map((use) => use.skill))) {
    const total = totals.get(skill) ?? { used: 0, corrected: 0 };
    total.used += 1;
    if (uses.some((use) => use.skill === skill && corrected(use))) total.corrected += 1;
    totals.set(skill, total);
  }
}
const lines = [...totals].sort(([nameA, a], [nameB, b]) => b.corrected - a.corrected || b.used - a.used || nameA.localeCompare(nameB));
process.stdout.write(lines.map(([skill, { corrected, used }]) => `${skill}: corrected in ${corrected} of ${used} sessions\n`).join(''));
