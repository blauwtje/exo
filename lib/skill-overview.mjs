import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from '../verify/frontmatter.mjs';

export const OVERVIEW_PATH = 'skills/start/references/cheat-sheet.md';
const HIDDEN = new Set(['route-skills']);

const INTRO = [
  '# Cheat sheet',
  '',
  'Relay the table as the whole reply, rows unchanged. It is generated from each skill\'s frontmatter by `node skills/start/scripts/overview.mjs --write`.',
  '',
  '**Just ask** skills start from your own words; **Type it** skills run only when you type the command. For what a skill does, give `/exo:start` a goal.',
  '',
  '| Skill | How to start it |',
  '|---|---|',
];

export function skillFromLines(lines) {
  const { values, errors } = readFrontmatter(lines);
  if (errors.length > 0) return null;
  return {
    name: values.get('name'),
    userOnly: values.get('disable-model-invocation') === 'true',
    hint: values.get('argument-hint') ?? '',
  };
}

export function readSkills(skillsRoot) {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'))
    .filter((file) => fs.existsSync(file))
    .map((file) => skillFromLines(fs.readFileSync(file, 'utf8').split(/\r?\n/)))
    .filter((skill) => skill !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function overviewRow(skill) {
  if (!skill.userOnly) return `| \`${skill.name}\` | Just ask |`;
  const hint = skill.hint.replace(/^"|"$/g, '');
  const command = [`/exo:${skill.name}`, hint].filter(Boolean).join(' ');
  return `| \`${skill.name}\` | Type \`${command}\` |`;
}

export function buildOverview(skills) {
  const rows = skills.filter((skill) => !HIDDEN.has(skill.name)).map(overviewRow);
  return [...INTRO, ...rows, ''].join('\n');
}

export function userOnlyNames(skills) {
  return skills.filter((skill) => skill.userOnly).map((skill) => skill.name);
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

export function countWord(count) {
  return COUNT_WORDS[count] ?? String(count);
}

export function userOnlyClaimProblems(contributing, skills) {
  const names = userOnlyNames(skills);
  const claim = contributing.split('\n').find((line) => line.includes('carry `disable-model-invocation: true`'));
  if (!claim) return ['CONTRIBUTING.md has no line stating the user-only count'];
  const problems = [];
  const expected = countWord(names.length);
  if (!claim.startsWith(`${expected} skills`)) problems.push(`count should read "${expected} skills" for ${names.length} flagged skills`);
  const missing = names.filter((name) => !claim.includes(`\`${name}\``));
  if (missing.length > 0) problems.push(`user-only skills not named: ${missing.join(', ')}`);
  return problems;
}
