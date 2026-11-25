import crypto from 'node:crypto';
import path from 'node:path';
import { indexed, isFailedRow, VERDICTS } from './ledger.mjs';
import { projectFolder, sessionFiles, promptMessages, toolCalls } from './sessions.mjs';

const MAX_ENTRY_CHARS = 300;
export const MIN_SESSIONS = 3;
const MAX_DOCUMENT_SHARE = 0.05;
export const MIN_SHARED_WORDS = 3;
const MIN_JACCARD = 0.4;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function hashed(text, length) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, length);
}

export function words(text) {
  const spoken = text.split(/\s+/).filter((token) => !token.includes('/')).join(' ');
  return [...new Set([...segmenter.segment(spoken)].filter((part) => part.isWordLike).map((part) => hashed(part.segment.toLowerCase(), 8)))].sort();
}

export function cutText(text) {
  return text.trim().slice(0, MAX_ENTRY_CHARS);
}

function idOf(session, text) {
  return hashed(`${session}\n${text}`, 12);
}

export function entryOf({ date, session, text }) {
  const cut = cutText(text);
  return { id: idOf(session, cut), date, session, words: words(cut) };
}

export function failureOf({ date, session, text }) {
  const cut = cutText(text);
  return { id: idOf(session, cut), date, session, words: words(cut.replace(/[/.-]/g, ' ')) };
}

export function transcriptTexts(folder, sessions) {
  const texts = new Map();
  for (const file of sessionFiles(folder)) {
    const session = path.basename(file, '.jsonl');
    if (!sessions.has(session)) continue;
    for (const { text, kind } of promptMessages(file)) {
      if (kind === 'skipped') continue;
      const cut = cutText(text);
      texts.set(idOf(session, cut), cut);
    }
    for (const { text } of toolCalls(file).filter(({ failed }) => failed)) {
      const cut = cutText(text);
      texts.set(idOf(session, cut), cut);
    }
  }
  return texts;
}

export function countedWords(entries) {
  const frequency = new Map();
  for (const { words: entryWords } of entries) {
    for (const word of entryWords) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const limit = entries.length * MAX_DOCUMENT_SHARE;
  return new Set([...frequency].filter(([, count]) => count >= 2 && count <= limit).map(([word]) => word));
}

export function similar(a, b, counted) {
  const left = [...a].filter((word) => counted.has(word));
  const right = new Set([...b].filter((word) => counted.has(word)));
  const shared = left.filter((word) => right.has(word)).length;
  return shared >= MIN_SHARED_WORDS && shared / (left.length + right.size - shared) >= MIN_JACCARD;
}

export function rowMatches(row, entry, counted) {
  return Boolean(row.ids?.includes(entry.id)) || (row.words !== undefined && similar(entry.words, row.words, counted));
}

function decider(verdicts, counted) {
  return (entry) => verdicts.some((row) => rowMatches(row, entry, counted));
}

export function byAge(a, b) {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

export function neighbourCount(group, counted) {
  return (entry) => group.filter((other) => other !== entry && similar(entry.words, other.words, counted)).length;
}

function medoid(group, counted, texts) {
  const neighbours = neighbourCount(group, counted);
  const best = group.filter(({ id }) => texts.has(id)).map((entry) => ({ entry, neighbours: neighbours(entry) })).sort((a, b) => b.neighbours - a.neighbours || texts.get(a.entry.id).length - texts.get(b.entry.id).length)[0];
  return best && best.entry;
}

function otherText(group, centre, texts) {
  const other = group.findLast(({ id, session }) => session !== centre.session && texts.has(id));
  return other && texts.get(other.id);
}

function groupsOf(rows, verdicts, counted, ownCounted) {
  const decided = decider(verdicts, ownCounted);
  const entries = rows.filter((entry) => !decided(entry));
  const parent = entries.map((_, index) => index);
  const root = (index) => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  const postings = new Map();
  entries.forEach(({ words: entryWords }, index) => {
    for (const word of [...entryWords].filter((candidate) => counted.has(candidate))) {
      if (!postings.has(word)) postings.set(word, []);
      postings.get(word).push(index);
    }
  });
  entries.forEach((entry, i) => {
    const shared = new Map();
    for (const word of entry.words) for (const j of postings.get(word) ?? []) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
    for (const [j, count] of shared) if (count >= MIN_SHARED_WORDS && similar(entry.words, entries[j].words, counted)) parent[root(j)] = root(i);
  });
  const groups = new Map();
  entries.forEach((entry, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), entry]));
  return [...groups.values()];
}

export function counting(ledger) {
  const prompts = indexed(ledger.entries);
  const failures = indexed(ledger.failures);
  const own = [...prompts, ...failures].filter(({ project }) => project === undefined);
  return { prompts, failures, counted: countedWords([...prompts, ...failures]), ownCounted: countedWords(own) };
}

export function clusters(ledger) {
  const { prompts, failures, counted, ownCounted } = counting(ledger);
  const promptGroups = groupsOf(prompts, ledger.verdicts.filter((row) => !isFailedRow(row)), counted, ownCounted).map((group) => ({ group, failed: false }));
  const failureGroups = groupsOf(failures, ledger.verdicts.filter(isFailedRow), counted, ownCounted).map((group) => ({ group, failed: true }));
  return [...promptGroups, ...failureGroups]
    .map(({ group, failed }) => ({ group: group.sort(byAge), failed, sessions: new Set(group.map(({ session }) => session)).size }))
    .filter(({ group, sessions }) => sessions >= MIN_SESSIONS && group.some(({ project }) => project === undefined))
    .sort((a, b) => b.sessions - a.sessions || byAge(b.group.at(-1), a.group.at(-1)))
    .map(({ group, failed, sessions }) => ({ id: group[0].id, group, failed, counted, sessions, projects: new Set(group.map(({ project }) => project)).size, first: group[0].date, last: group.at(-1).date }));
}

export function listed(cwd, ledger, withTexts = false) {
  const top = clusters(ledger);
  const rows = top.flatMap(({ group }) => group);
  const sessions = new Set(rows.map(({ session }) => session));
  const here = projectFolder(cwd);
  const texts = transcriptTexts(here, sessions);
  const others = withTexts ? new Set(rows.flatMap(({ project }) => (project === undefined ? [] : [project]))) : new Set();
  const allTexts = new Map([...texts, ...[...others].flatMap((project) => [...transcriptTexts(path.join(path.dirname(here), project), sessions)])]);
  return top
    .map((cluster) => ({ cluster, centre: medoid(cluster.group, cluster.counted, texts) }))
    .filter(({ centre }) => centre !== undefined)
    .map(({ cluster, centre }) => ({ ...cluster, text: texts.get(centre.id), other: otherText(cluster.group, centre, allTexts) }));
}

export function cleanCalls(cwd) {
  return sessionFiles(projectFolder(cwd)).flatMap((file) => toolCalls(file).filter(({ failed }) => !failed).map(failureOf));
}

export function laterCleanRuns(members, counted, calls) {
  const last = members.reduce((latest, { date }) => (date > latest ? date : latest), '');
  return new Set(calls.filter((call) => call.date > last && members.some((row) => similar(call.words, row.words, counted))).map(({ session }) => session)).size;
}

export function keptFailures(ledger, calls) {
  const { failures, counted, ownCounted } = counting(ledger);
  const verdicts = ledger.verdicts.filter(isFailedRow);
  return verdicts.flatMap((row, index) => {
    if (row.verdict !== VERDICTS.keep || row.project !== undefined) return [];
    const members = failures.filter((entry) => rowMatches(row, entry, ownCounted));
    if (members.length === 0 || verdicts.slice(index + 1).some((later) => members.some((entry) => rowMatches(later, entry, ownCounted)))) return [];
    return [{ id: row.ids?.[0] ?? members[0].id, clean: laterCleanRuns(members, counted, calls) }];
  }).filter(({ clean }) => clean > 0);
}

export function describe({ id, failed, text, sessions, projects, first, last, clean }) {
  return `${id} ${failed ? 'failed: ' : ''}"${text}" (${sessions} sessions, ${first} to ${last}${clean > 0 ? `, ${clean} later clean runs` : ''})${projects >= 2 ? ` global (${projects} projects)` : ''}`;
}
