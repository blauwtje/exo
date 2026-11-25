import { textHits } from '../text-hits.mjs';

const RULES = [
  ['clock read', /\b(Date\.now|performance\.now|process\.hrtime|hrtime|process\.uptime)\b/],
  ['fixed sleep', /\bsetTimeout\(\s*resolve\b/],
  ['fixed sleep', /\b(sleep|pause)\(\s*\d/]
];
const TEST_FILE = /^tests\/.*\.mjs$/;

const hitsOfLine = (line) => RULES.filter(([, pattern]) => pattern.test(line)).map(([name]) => name);

export function checkTestTiming(report, repository) {
  const hits = textHits(repository, hitsOfLine)
    .filter((hit) => TEST_FILE.test(hit.slice(0, hit.indexOf(':'))));
  report.assert(
    hits.length === 0,
    'test timing',
    { pass: 'no test reads the clock or waits a fixed time', fail: hits.join('; ') }
  );
}
