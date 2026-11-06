import fs from 'node:fs';
import { parseFlags, UsageError, isMain } from '#script-flags';

const USAGE = [
  'usage: verdict-check.mjs --plan <brief>',
  "Checks that the brief's '## Verdict' section holds 'Verdict: go' and a one-line 'Objection:'; exits 1 on a problem, 2 on a usage error."
].join('\n');

const MIN_OBJECTION_LENGTH = 12;

function verdictSection(text) {
  const match = text.match(/^## Verdict[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return match === null ? null : match[1];
}

function lineValue(section, label) {
  const match = section.match(new RegExp(`^${label}:[ \\t]*(.*)$`, 'm'));
  return match === null ? null : match[1].trim();
}

function verdictLineProblems(section) {
  const verdict = lineValue(section, 'Verdict');
  if (verdict === null) return ["the '## Verdict' section has no 'Verdict:' line"];
  if (verdict === 'go') return [];
  return [`'Verdict: ${verdict}' belongs in the reply, not a brief: clarify asks the question and stop writes no brief`];
}

function objectionLineProblems(section) {
  const objection = lineValue(section, 'Objection');
  if (objection === null) return ["the '## Verdict' section has no 'Objection:' line"];
  if (objection.length >= MIN_OBJECTION_LENGTH) return [];
  return ["the 'Objection:' line names no concrete reason the work could fail"];
}

export function verdictProblems(text) {
  const section = verdictSection(text);
  if (section === null) return ["the brief has no '## Verdict' section: add 'Verdict: go' and 'Objection: <strongest reason the work fails or is not worth doing>'"];
  return [...verdictLineProblems(section), ...objectionLineProblems(section)];
}

export function main(argv) {
  const flags = parseFlags(argv, { plan: 'value' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the brief file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no brief at '${flags.plan}'`);
  const problems = verdictProblems(fs.readFileSync(flags.plan, 'utf8'));
  process.stdout.write(problems.length === 0 ? 'verdict: ok\n' : `${problems.map((problem) => `verdict: ${problem}`).join('\n')}\n`);
  if (problems.length > 0) process.exitCode = 1;
}

function run(argv) {
  try {
    main(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`verdict-check: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (isMain(import.meta.url)) run(process.argv.slice(2));
