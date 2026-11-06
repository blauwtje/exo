import fs from 'node:fs';

const LOAD_SENTENCE = /Load the `exo:(?<skill>[a-z0-9-]+)` skill/;
const STEP_REFERENCE = /\bSteps? (?<first>\d+)(?:(?: to |-)(?<last>\d+)| and (?<second>\d+))?/g;
const FRONT_MATTER = /^---\r?\n(?<data>[\s\S]*?)\r?\n---\r?\n/;
const FORBIDDEN_KEY = /^forbidden-steps:\s*(?<list>.+)$/m;
const FORBIDDEN_ITEM = /^(?<first>\d+)(?:-(?<last>\d+))?$/;
const NUMBERED_STEP = /^(\d+)\. /gm;

function range(first, last) {
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, offset) => first + offset);
}

function splitFrontMatter(text) {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: '', body: text };
  return { data: match.groups.data, body: text.slice(match[0].length) };
}

function forbiddenSteps(data) {
  const list = FORBIDDEN_KEY.exec(data)?.groups.list ?? '';
  const forbidden = new Set();
  for (const item of list.split(',')) {
    const match = FORBIDDEN_ITEM.exec(item.trim());
    if (!match) continue;
    const first = Number(match.groups.first);
    for (const step of range(first, Number(match.groups.last ?? first))) forbidden.add(step);
  }
  return forbidden;
}

function numbersOf({ first, last, second }) {
  if (last) return range(Number(first), Number(last));
  if (second) return [Number(first), Number(second)];
  return [Number(first)];
}

function stepReferences(body) {
  return [...body.matchAll(STEP_REFERENCE)].map((match) => ({ text: match[0], numbers: numbersOf(match.groups) }));
}

function stepsOf(repository, skill) {
  const skillFile = repository.join('skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  const numbers = [...repository.text(skillFile).matchAll(NUMBERED_STEP)].map((match) => Number(match[1]));
  return numbers.length === 0 ? null : new Set(numbers);
}

function ownerOf(relativePath) {
  const [root, skill] = relativePath.split('/');
  return root === 'skills' ? skill : null;
}

function targetSkill(body, relativePath) {
  return LOAD_SENTENCE.exec(body)?.groups.skill ?? ownerOf(relativePath);
}

function missingStepErrors(label, reference, skill, steps) {
  const missing = reference.numbers.filter((number) => !steps.has(number));
  if (missing.length === 0) return [];
  const last = Math.max(...steps);
  return [`${label}: '${reference.text}' names step ${missing.join(', ')} that exo:${skill} lacks (it has 1 to ${last})`];
}

function forbiddenStepErrors(label, reference, forbidden) {
  const hit = reference.numbers.filter((number) => forbidden.has(number));
  if (hit.length === 0) return [];
  return [`${label}: '${reference.text}' names forbidden step ${hit.join(', ')}`];
}

function fileErrors(repository, file) {
  const label = repository.relative(file);
  const { data, body } = splitFrontMatter(repository.text(file));
  const references = stepReferences(body);
  if (references.length === 0) return { count: 0, errors: [] };
  const skill = targetSkill(body, label);
  const steps = skill ? stepsOf(repository, skill) : null;
  const forbidden = forbiddenSteps(data);
  const errors = references.flatMap((reference) => [
    ...(steps ? missingStepErrors(label, reference, skill, steps) : []),
    ...forbiddenStepErrors(label, reference, forbidden)
  ]);
  return { count: references.length, errors };
}

export function checkStepReferences(report, repository) {
  const files = [...repository.processFiles(), ...repository.promptFiles(), ...repository.agentFiles()];
  const results = files.map((file) => fileErrors(repository, file));
  const errors = results.flatMap((result) => result.errors);
  const count = results.reduce((sum, result) => sum + result.count, 0);
  report.assert(
    errors.length === 0,
    'Step references',
    `${count} step references resolve to numbered steps and avoid forbidden ones`,
    errors.join('; ')
  );
}
