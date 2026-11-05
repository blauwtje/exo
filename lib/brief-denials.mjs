import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const SHOWN_CANDIDATES = 5;
const ONE_FIELD_PER_LINE = 'Put one field per line, each label at the start of its line.';
const READS_LABELS = /^[ \t]*(?:[-*][ \t]+)?\**(?:(?:Read first|Reads first|Read|Input|Inputs|File|Files|Sources?|Paths?)\**(?:[ \t]*\([^)\n]*\))?:|[^:\n]{1,40}:[ \t]*read\b).*$/im;
const ABSOLUTE_PATH = /(?<![\w.~])\/[^\s`'"(),;:]+/g;
const READS_GRAMMAR = 'Write `Reads:` as items split by `,` or `;`, each a path, optionally followed by `lines N-M` or `by grep`, or `Reads: none`; an item that does not start with a path is prose and is not read.';

function isDirectory(target) {
  return statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function worktreeHint(missing, prompt = '') {
  const named = [...prompt.matchAll(ABSOLUTE_PATH)].map(([word]) => word.replace(/\.+$/, ''));
  const holder = named.find((dir) => isDirectory(dir) && missing.some((name) => existsSync(path.resolve(dir, name))));
  return holder ? ` The paths exist under ${holder}: add a \`Worktree: ${holder}\` line.` : '';
}

function unresolvedReason(unresolved, ambiguous, searched = [], prompt) {
  const several = ambiguous.map(({ name, matches }) => `${name} matches ${matches.slice(0, SHOWN_CANDIDATES).join(', ')}`);
  const missing = unresolved.filter((name) => !ambiguous.some((entry) => entry.name === name));
  const parts = [
    several.length && `names that match several tracked files, so give the full path: ${several.join('; ')}`,
    missing.length && `paths that do not exist: ${missing.join(', ')} (searched ${searched.join(', ') || 'the working directory'}; name a pasted image by its full path)`,
  ].filter(Boolean);
  return `This worker brief reads ${parts.join('. It also reads ')}.${worktreeHint(missing, prompt)} ${READS_GRAMMAR}`;
}

function readsLabelHint(prompt = '') {
  const found = READS_LABELS.exec(prompt)?.[0].trim();
  return found ? ` It has \`${found.slice(0, 80)}\`; rename it to \`Reads:\`.` : '';
}

export function sizeReason(size, { missing, fetchDocs, ambiguous, prompt }) {
  if (size.invalid.length) return `This worker brief has an invalid ${size.invalid.join(' and ')} line. Give a whole number.`;
  if (size.unresolved.length) return unresolvedReason(size.unresolved, ambiguous, size.searched, prompt);
  const hint = missing.includes('Reads') ? readsLabelHint(prompt) : '';
  if (missing.join() === 'Reads') return `This worker brief lacks a \`Reads:\` line.${hint} Add one of paths or \`none\`. ${ONE_FIELD_PER_LINE}`;
  if (missing.length) return `This worker brief lacks ${missing.join(' and ')}.${hint} Add a \`Reads:\` line of paths or \`none\` and a \`Result:\` line naming one \`.exo/<...>.md\` file. ${ONE_FIELD_PER_LINE}`;
  const estimate = `This worker brief reads about ${size.tokens} tokens against a budget of ${size.budget}.`;
  if (fetchDocs) return `${estimate} Lower the \`Fetches:\` count or split the fetches across more agents.`;
  return `${estimate} Largest reads: ${size.largest.map((entry) => `${entry.path} (${entry.tokens})`).join(', ')}. Cut at least ${size.tokens - size.budget} tokens: give the largest read its own agent, or cut it: a qualifier is only \`lines N-M\` or \`by grep\` right after the path (other words cut nothing), and split the rest by path so each agent's \`Reads:\` stays under ${size.budget} with its own \`Result:\`.`;
}
