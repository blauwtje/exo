import fs from 'node:fs';
import { listedFiles } from './script-syntax.mjs';

const ROUTED = /^(skills|agents)\//;
const NAMES_MODEL = /\bmodel:? +(sonnet|opus|haiku|inherit)\b/i;

const NAMES_FABLE = /\bfable\b/i;

const SCRIPT = /^(?!tests\/|verify\/checks\/model-routing\.mjs$).*\.(mjs|js|sh|py)$/;
const PRINT_ARGUMENT = /'-p'|"-p"|(?<![\w-])-p(?![\w-])|--print/;
const CLAUDE_COMMAND = /(?<![\w./-])claude(?![\w./-])/;
const MODEL_ARGUMENT = /'--model'|"--model"|--model[ =]/;

const RULES = [
  { rule: 'general-purpose with no model', hits: (line) => line.includes('general-purpose') && !NAMES_MODEL.test(line) },
  { rule: 'fable', hits: (line) => NAMES_FABLE.test(line) }
];

const unroutedLines = (text) => text.split('\n')
  .flatMap((line, index) => RULES
    .filter(({ hits }) => hits(line))
    .map(({ rule }) => ({ number: index + 1, rule })));

function modellessSpawn(text) {
  const lines = text.split('\n');
  const spawns = lines.flatMap((line, index) => PRINT_ARGUMENT.test(line) ? [index] : []);
  return spawns.flatMap((index, position) => {
    const end = spawns[position + 1] ?? lines.length;
    const spawn = lines.slice(Math.max(index - 1, 0), end).join('\n');
    const model = lines.slice(index, end).join('\n');
    return CLAUDE_COMMAND.test(spawn) && !MODEL_ARGUMENT.test(model)
      ? [{ number: index + 1, rule: 'claude -p without --model' }]
      : [];
  });
}

export function checkModelRouting(report, repository) {
  const textHits = listedFiles(repository, (entry) => ROUTED.test(entry))
    .flatMap((file) => unroutedLines(fs.readFileSync(file, 'utf8'))
      .map(({ number, rule }) => `${repository.relative(file)}:${number} ${rule}`));
  const spawnHits = listedFiles(repository, (entry) => SCRIPT.test(entry))
    .flatMap((file) => modellessSpawn(fs.readFileSync(file, 'utf8'))
      .map(({ number, rule }) => `${repository.relative(file)}:${number} ${rule}`));
  const hits = [...textHits, ...spawnHits];
  report.assert(
    hits.length === 0,
    'model routing',
    { pass: 'every general-purpose dispatch names a model, no text names fable and every claude -p passes --model', fail: hits.join('; ') }
  );
}
