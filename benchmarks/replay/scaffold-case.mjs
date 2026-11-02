#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain, parseFlags, UsageError } from '../../lib/script-flags.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CASES = path.join(HERE, 'cases');
export const NOT_INPUT = [/^tests?\//, /\.md$/, /^benchmarks\/results\//, /package-lock\.json$/];
export const MAX_DIFF_CHARS = 6000;
export const TASK_TEMPLATE = 'The directory input/ holds the source files of a program as they stood before a defect was fixed. Find the defect behind the symptom below and say what it is, where it is and how to fix it.';
const USAGE = `Usage: node scaffold-case.mjs --commit <sha> --id <case id> [--symptom <text>] [--files <a,b>] [--cases-dir <dir>] [--repo <dir>] [--dry-run] [--force]
Turns a fix commit into a replay case skeleton under the cases folder: input/ holds the fix's changed source files as they stood in the commit's parent, case.json carries the provenance (commit, parent, subject, date) and a rubric skeleton with the real diff as the reference fix, prompt.md carries the symptom.
--symptom: the failure as it was observed, without the cause; default is the first CHANGELOG.md line the commit added. Without either the case stays ready:false.
--files: comma list of paths to copy; default is every changed file except tests, markdown, benchmark results and lock files.
--dry-run prints the plan and writes nothing. A case folder that exists is refused unless --force.
Exit codes: 0 done, 1 refused or git failed, 2 usage error.
`;

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function isInputFile(file) {
  return !NOT_INPUT.some((pattern) => pattern.test(file));
}

export function changelogSymptom(diffText) {
  const added = diffText.split('\n').filter((line) => line.startsWith('+- ')).map((line) => line.slice(3).trim());
  return added[0] ?? null;
}

export function boundedDiff(diff, limit = MAX_DIFF_CHARS) {
  return diff.length <= limit ? diff : `${diff.slice(0, limit)}\n[diff cut at ${limit} characters]`;
}

export function commitFacts(repo, commit) {
  const sha = git(repo, ['rev-parse', '--verify', `${commit}^{commit}`]).trim();
  const parent = git(repo, ['rev-parse', '--verify', `${sha}^`]).trim();
  const [subject, date] = git(repo, ['show', '-s', '--format=%s%n%cs', sha]).trim().split('\n');
  const changed = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean);
  const changelog = git(repo, ['show', '--format=', sha, '--', 'CHANGELOG.md']);
  return { sha, parent, subject, date, changed, changelog };
}

export function inputFilesAt(repo, parent, files) {
  return files.filter((file) => {
    try {
      git(repo, ['cat-file', '-e', `${parent}:${file}`]);
      return true;
    } catch {
      return false;
    }
  });
}

export function caseDefinition({ id, facts, files, symptom, diff }) {
  const ready = symptom !== null;
  return {
    id,
    kind: 'case',
    replay: null,
    task: symptom === null ? 'TODO: the observed symptom' : `${TASK_TEMPLATE} Symptom: ${symptom}`,
    grade: {
      type: 'rubric',
      pass: [],
      fail: [],
      rubric: `TODO: FACTS (the defect and where it is), FAIL (what a wrong answer blames), PASS (what a right answer names; any fix with the same effect passes).\nReference fix, the real commit ${facts.sha.slice(0, 8)}:\n${boundedDiff(diff)}`
    },
    provenance: { type: 'fix-commit', ref: facts.sha, parent: facts.parent, subject: facts.subject, date: facts.date },
    source: `${files.join(', ')} at ${facts.sha.slice(0, 8)}^ (git show). Fix commit ${facts.sha.slice(0, 8)}: ${facts.subject}.`,
    transcript: 'none',
    constructed: true,
    fidelity_notes: {
      real: `The input files are byte copies of ${files.join(', ')} at the fix's parent ${facts.parent.slice(0, 8)}.`,
      edited: 'Nothing.',
      assumed: 'The symptom wording and the prompt are written for the replay, not taken from a session.'
    },
    ready: false,
    ...(ready ? {} : { not_ready_reason: 'no symptom given' })
  };
}

export function scaffold({ repo, commit, id, symptom, files, casesDir, dryRun, force }) {
  const facts = commitFacts(repo, commit);
  const wanted = files ?? facts.changed.filter(isInputFile);
  const present = inputFilesAt(repo, facts.parent, wanted);
  if (present.length === 0) throw new UsageError(`no input files: ${facts.sha.slice(0, 8)} changes no source file that exists in its parent; pass --files`);
  const folder = path.join(casesDir, id);
  if (fs.existsSync(folder) && !force) throw new UsageError(`${folder} exists; pass --force to rewrite it`);
  const finalSymptom = symptom ?? changelogSymptom(facts.changelog);
  const diff = git(repo, ['show', '--format=', facts.sha, '--', ...present]);
  const definition = caseDefinition({ id, facts, files: present, symptom: finalSymptom, diff });
  const plan = { folder, input: present, definition };
  if (dryRun) return plan;
  fs.rmSync(folder, { recursive: true, force: true });
  for (const file of present) {
    const target = path.join(folder, 'input', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, execFileSync('git', ['-C', repo, 'show', `${facts.parent}:${file}`], { maxBuffer: 64 * 1024 * 1024 }));
  }
  fs.writeFileSync(path.join(folder, 'prompt.md'), `${definition.task}\n`);
  fs.writeFileSync(path.join(folder, 'case.json'), `${JSON.stringify(definition, null, 2)}\n`);
  return plan;
}

export function parseScaffoldArguments(argv) {
  const flags = parseFlags(argv, { commit: 'string', id: 'string', symptom: 'string', files: 'string', 'cases-dir': 'string', repo: 'string', 'dry-run': 'boolean', force: 'boolean' }, { usage: USAGE });
  if (!flags.commit || !flags.id) throw new UsageError(`--commit and --id are required\n${USAGE}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(flags.id)) throw new UsageError(`--id '${flags.id}' must be a plain folder name`);
  return {
    commit: flags.commit,
    id: flags.id,
    symptom: flags.symptom ?? null,
    files: flags.files ? flags.files.split(',').filter(Boolean) : null,
    casesDir: path.resolve(flags['cases-dir'] ?? DEFAULT_CASES),
    repo: path.resolve(flags.repo ?? path.join(HERE, '..', '..')),
    dryRun: flags['dry-run'] === true,
    force: flags.force === true
  };
}

function main(argv) {
  try {
    const plan = scaffold(parseScaffoldArguments(argv));
    const action = argv.includes('--dry-run') ? 'would write' : 'wrote';
    console.log(`${action} ${plan.folder} (${plan.input.length} input files: ${plan.input.join(', ')}; ready ${plan.definition.ready})`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return error instanceof UsageError ? 2 : 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
