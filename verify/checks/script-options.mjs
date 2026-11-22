import { git } from '#git';
import { BASE_REF } from './plugin-version.mjs';
import { moduleFiles } from './script-syntax.mjs';

const NEW_SCRIPT_LIMIT = 5;
const NAME = 'script options';
const SPEC_OPENERS = [/parseFlags\(\s*[^,()]+,\s*\{/g, /\bFLAGS = \{/g, /parseArgs\(\{[\s\S]*?\boptions:\s*\{/g];
const COMPARED_LITERAL = /(?:[!=]==|\bcase|\.includes\(|\.indexOf\()\s*['"]--([\w-]+)['"]/g;
const SPEC_KEY = /(?:^|,)\s*['"]?([\w-]+)['"]?\s*:/g;

function topLevelBody(source, openIndex) {
  let depth = 1;
  let body = '';
  for (let index = openIndex; index < source.length && depth > 0; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (depth === 1) body += character;
  }
  return body;
}

export function optionNames(source) {
  const names = new Set();
  for (const opener of SPEC_OPENERS) {
    for (const match of source.matchAll(opener)) {
      for (const key of topLevelBody(source, match.index + match[0].length).matchAll(SPEC_KEY)) names.add(key[1]);
    }
  }
  for (const match of source.matchAll(COMPARED_LITERAL)) names.add(match[1]);
  names.delete('help');
  return [...names].sort();
}

export function checkScriptOptions(report, repository) {
  const mergeBase = git(repository.root, ['merge-base', 'HEAD', BASE_REF]);
  if (mergeBase.status !== 0) {
    report.result('UNRUN', NAME, `${BASE_REF} is not available to compare against`);
    return;
  }
  const base = mergeBase.stdout.trim();
  const problems = [];
  for (const file of moduleFiles(repository)) {
    const name = repository.relative(file);
    if (name.startsWith('tests/')) continue;
    const now = optionNames(repository.text(file));
    const shown = git(repository.root, ['show', `${base}:${name}`]);
    if (shown.status !== 0) {
      if (now.length > NEW_SCRIPT_LIMIT) problems.push(`${name} is new and declares ${now.length} options, above ${NEW_SCRIPT_LIMIT}`);
      continue;
    }
    const before = optionNames(shown.stdout);
    if (now.length > before.length) {
      const added = now.filter((option) => !before.includes(option)).map((option) => `--${option}`);
      problems.push(`${name} gained ${added.join(', ')}`);
    }
  }
  report.assert(problems.length === 0, NAME, {
    pass: `no script declares more options than at the merge-base with ${BASE_REF}`,
    fail: problems.join('; ')
  });
}
