import process from 'node:process';
import { checkStamps } from '../skills/watch/scripts/check-stamps.mjs';

const LINK = /\[[^\]]*\]\(https:\/\/(?:youtu\.be\/([\w-]{11})\?t=(\d+)|www\.youtube\.com\/watch\?v=([\w-]{11})&t=(\d+)s)\)/g;
const TRANSCRIPT_LINE = /^\[[^\]]*\]\(https:\/\/youtu\.be\/[\w-]{11}\?t=(\d+)\) (.*)$/;
const WATCH_SCRIPT = /skills\/watch\/scripts\/([\w-]+\.mjs)/;
const CLAIM_LIMIT = 20;
const WINDOW_BEFORE = 5;
const WINDOW_AFTER = 45;
const STAMP_BUCKET = 30;
const VERDICT = /^C(\d+): .*\b(pass|fail)\s*$/;

export const parseLines = (text) => text.split('\n').filter(Boolean).flatMap((line) => {
  try {
    return [JSON.parse(line)];
  } catch (error) {
    process.stderr.write(`watch-bench: skipped a line that is not json (${error.message})\n`);
    return [];
  }
});

export const stampsOf = (text) => [...text.matchAll(LINK)].map((match) => ({
  id: match[1] ?? match[3],
  second: Number(match[2] ?? match[4])
}));

const blocksOf = (line) => (line.type === 'assistant' && Array.isArray(line.message?.content) ? line.message.content : []);

export function toolOrder(lines) {
  return lines
    .filter((line) => line.type === 'assistant' && !line.isSidechain)
    .flatMap(blocksOf)
    .filter((block) => block.type === 'tool_use')
    .map((block) => {
      const script = block.name === 'Bash' ? block.input?.command?.match(WATCH_SCRIPT)?.[1] : undefined;
      return script ? `Bash:${script}` : block.name;
    });
}

export const distinctOrders = (orders) => new Set(orders.map((order) => order.join('>'))).size;

export function stampOverlap(answers) {
  const share = (keyOf) => {
    const sets = answers.map((answer) => new Set(stampsOf(answer).map(keyOf)));
    const union = new Set(sets.flatMap((set) => [...set]));
    if (union.size === 0) return 0;
    return [...union].filter((key) => sets.every((set) => set.has(key))).length / union.size;
  };
  return {
    shared: share((stamp) => `${stamp.id}@${Math.floor(stamp.second / STAMP_BUCKET) * STAMP_BUCKET}`),
    exact: share((stamp) => `${stamp.id}@${stamp.second}`)
  };
}

export function minutesOf(lines) {
  const first = lines.find((line) => line.type === 'user' && line.timestamp);
  const last = lines.findLast((line) => line.type === 'assistant' && line.timestamp);
  if (!first || !last) return 0;
  return (Date.parse(last.timestamp) - Date.parse(first.timestamp)) / 1000 / 60;
}

export function tokensOf(lines) {
  const byMessage = new Map();
  for (const line of lines) {
    if (line.type === 'assistant' && line.message?.usage) byMessage.set(line.message.id, line.message.usage);
  }
  let fresh = 0;
  let cacheRead = 0;
  for (const usage of byMessage.values()) {
    fresh += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
    cacheRead += usage.cache_read_input_tokens ?? 0;
  }
  return { fresh, cacheRead };
}

export function stampTotals(answer, transcripts) {
  const { exact, off, unchecked } = checkStamps(answer, (id) => transcripts[id]);
  return { exact, off, unchecked };
}

export function claimsOf(answer) {
  return answer.split('\n').flatMap((text) => {
    const [first] = stampsOf(text);
    return first ? [{ text: text.trim(), id: first.id, second: first.second }] : [];
  }).slice(0, CLAIM_LIMIT);
}

export function transcriptLines(transcript) {
  return transcript.split('\n').flatMap((raw) => {
    const match = raw.match(TRANSCRIPT_LINE);
    return match ? [{ second: Number(match[1]), text: match[2], raw }] : [];
  });
}

export const windowOf = (transcript, second) => transcriptLines(transcript)
  .filter((line) => line.second >= second - WINDOW_BEFORE && line.second <= second + WINDOW_AFTER);

export function judgePrompt(items) {
  const blocks = items.map(({ claim, lines }, index) => `Claim C${index + 1}: ${claim}\nLines:\n${lines.length ? lines.map((line) => line.raw).join('\n') : '(no transcript lines)'}`);
  return [
    'Judge each claim against the transcript lines given with it. A claim passes only when those lines say what the claim says.',
    'Write one line per claim, in the form "C<number>: <reason> <pass or fail>", with the reason first and the word pass or fail last, and nothing else.',
    '',
    blocks.join('\n\n')
  ].join('\n');
}

export function verdictsOf(text, count) {
  const found = {};
  for (const line of text.split('\n')) {
    const match = line.trim().match(VERDICT);
    if (match) found[Number(match[1])] = match[2];
  }
  return Array.from({ length: count }, (_, index) => found[index + 1]);
}

export const plantedMissed = ({ own, foreign }) => own !== 'pass' || foreign !== 'fail';

export const hitsShare = (verdicts) => (verdicts.length === 0 ? 0 : verdicts.filter((verdict) => verdict === 'pass').length / verdicts.length);

export function coverageOf(answer, benchCase) {
  const stamps = stampsOf(answer);
  if (benchCase.chapters.length === 0) {
    const cited = new Set(stamps.map((stamp) => stamp.id));
    return benchCase.ids.filter((id) => cited.has(id)).length / benchCase.ids.length;
  }
  const covered = new Set(stamps.filter((stamp) => stamp.id === benchCase.ids[0]).map((stamp) => benchCase.chapters.findLastIndex((start) => start <= stamp.second)));
  covered.delete(-1);
  return covered.size / benchCase.chapters.length;
}

export const spreadOf = (values) => ({ low: Math.min(...values), high: Math.max(...values) });
export const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
