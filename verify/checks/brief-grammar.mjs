import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { baseOf, workerSize } from '../../lib/worker-size.mjs';
import { agentContextTarget, orchestratorPredispatchReads } from '../../lib/context-limits.mjs';

const CATALOG_HOME = path.join(os.tmpdir(), 'exo-catalog-defaults');
const FIELD = /(?:^|[\s(*`])(?:\*\*)?(Reads|Result|Fetches|Workers|Worktree)(?::\*\*|\*\*:|:)/g;
const SPAN = /`((?:Reads|Result|Fetches|Workers|Worktree):[^`\n]*\S[^`\n]*)`/g;
const FENCE = /```[a-z]*\n([\s\S]*?)```/g;
const SIZING = /\b(?:Reads|Fetches):/;
const DELEGATE_LINE = /general-purpose.*exo-kind:|exo-kind:.*general-purpose/;
const RULES = 'hooks/dispatch-rules.md';

function markdownFiles(repository, directory, deep) {
  const root = repository.join(directory);
  if (!fs.existsSync(root)) return [];
  return repository.walk(root, (file) => file.endsWith('.md'))
    .filter((file) => deep || path.dirname(file) === root)
    .map((file) => repository.relative(file));
}

const shownFields = (text) => [...new Set([...text.matchAll(FIELD)].map((match) => match[1]))];

function fencedExamples(file, text) {
  return [...text.matchAll(FENCE)]
    .map((match) => match[1])
    .filter((block) => block.includes('exo-kind:') && shownFields(block).length > 0)
    .map((block) => ({ file, text: block }));
}

function spanExamples(file, text) {
  return [...text.matchAll(SPAN)].map((match) => ({ file, text: match[1] }));
}

function examplesOf(repository) {
  const found = [];
  const read = (file) => repository.text(repository.join(file));
  for (const file of markdownFiles(repository, 'skills', true)) found.push(...fencedExamples(file, read(file)));
  for (const file of markdownFiles(repository, 'agents', false)) {
    const text = read(file);
    found.push(...fencedExamples(file, text), ...spanExamples(file, text.match(/^description:.*$/m)?.[0] ?? ''));
  }
  if (fs.existsSync(repository.join(RULES))) found.push(...spanExamples(RULES, read(RULES)));
  return found;
}

function filled(text, worktree) {
  return text
    .replaceAll('<n>', '2')
    .replace(/(Worktree:(?:\*\*)?[ \t]*)`?<[^>\n]*>`?/g, (_, lead) => `${lead}${worktree}`)
    .replace(/(Reads:(?:\*\*)?[ \t]*)`?<[^>\n]*>`?/g, '$1x.md')
    .replace(/(Result:(?:\*\*)?[ \t]*)`?<[^>\n]*>`?/g, '$1.exo/x.md')
    .replace(/<[^>\n]*>/g, 'x');
}

function parsedFields(prompt, directory) {
  const size = workerSize({ prompt, cwd: directory });
  const withoutFetches = workerSize({ prompt: prompt.replace('Fetches:', 'Fetch:'), cwd: directory });
  return {
    Reads: !size.missing.includes('Reads'),
    Result: !size.missing.includes('Result'),
    Workers: size.workers !== undefined,
    Worktree: baseOf(prompt, path.sep) === directory,
    Fetches: size.tokens > withoutFetches.tokens,
  };
}

function exampleFailures(example, directory) {
  const parsed = parsedFields(filled(example.text, directory), directory);
  return shownFields(example.text)
    .filter((name) => !parsed[name])
    .map((name) => `${example.file} shows ${name}: but the parser does not read it (one field per line, ${name}: at the line start)`);
}

function delegateFailures(repository) {
  return markdownFiles(repository, 'skills', true).flatMap((file) => {
    const text = repository.text(repository.join(file));
    const delegates = text.split('\n').some((line) => DELEGATE_LINE.test(line)) || fencedExamples(file, text).length > 0;
    return delegates && !SIZING.test(text) ? [`${file} briefs a general-purpose delegate but shows no Reads: or Fetches: line`] : [];
  });
}

function stated(repository, { file, needle, label }) {
  const path = repository.join(file);
  if (!fs.existsSync(path)) return [`${file} is missing`];
  return repository.text(path).includes(needle) ? [] : [`${file} does not state ${label} (${needle})`];
}

export function limitFailures(repository) {
  const budget = `${agentContextTarget(CATALOG_HOME) / 2000}k tokens`;
  const fetches = 'whole number first';
  return [
    ...stated(repository, { file: 'agents/orchestrator.md', needle: `at most ${orchestratorPredispatchReads(CATALOG_HOME)} reads`, label: 'the reads count' }),
    ...stated(repository, { file: 'agents/orchestrator.md', needle: budget, label: 'the context budget' }),
    ...stated(repository, { file: 'hooks/dispatch-rules.md', needle: budget, label: 'the context budget' }),
    ...stated(repository, { file: 'agents/orchestrator.md', needle: fetches, label: 'the Fetches: rule' }),
    ...stated(repository, { file: 'hooks/dispatch-rules.md', needle: fetches, label: 'the Fetches: rule' })
  ];
}

export function briefFailures(repository) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brief-grammar-')));
  fs.writeFileSync(path.join(directory, 'x.md'), 'x\n');
  try {
    const examples = examplesOf(repository).flatMap((example) => exampleFailures(example, directory));
    return [...new Set([...examples, ...delegateFailures(repository)])];
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export function checkBriefGrammar(report, repository) {
  const found = [...briefFailures(repository), ...limitFailures(repository)];
  report.assert(
    found.length === 0,
    'brief grammar',
    'every brief example shown to a writer parses to the fields it shows, each general-purpose delegate template shows a Reads: or Fetches: line, and the agent texts state the reads count, the context budget and the Fetches: rule of the rule table',
    found.join('; ')
  );
}
