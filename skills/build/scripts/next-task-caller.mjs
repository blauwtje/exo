import { keepLines } from '#script-output';

const KNOWN_TO_RUNNER = /^(?:Plan|Repository|Branch|Base|Baseline|Proof|Run): |^Drift: none$/;

export function chainedForCaller(text) {
  if (/^Inline: /m.test(text)) return text;
  return keepLines(text, (line) => !KNOWN_TO_RUNNER.test(line) && !(line.startsWith('Brief: ') && text.includes(`Read your brief at ${line.slice(7)}.`)));
}
