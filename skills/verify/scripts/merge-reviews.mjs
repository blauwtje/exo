import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';

const VERDICT_RANK = { CLEAN: 0, FINDINGS: 1, BLOCKED: 2 };
const PROBE_LINE = /^\s*Probe:\s*\S/;
const UNREAD = /\b(defect|concern|question)\b.*\b(fix|report)\W*$/;
const FINDING = /^\s*(?:[-*]\s*)?\S+:\d+(?:-\d+)?\b.*?\b(defect|concern|question)\b.*\b(fix|report)\W*$/;

const USAGE = `Usage: node merge-reviews.mjs --root <checkout> --report <file> [--report <file> ...]
Merges review reports into <checkout>/.exo/branch-review.md and prints the verdict line.`;

function verdictOf(text) {
  for (const line of text.split('\n')) {
    const match = line.match(/\b(CLEAN|FINDINGS|BLOCKED)\b/);
    if (match) return match[1];
  }
  return 'BLOCKED';
}

export function mergeReviews(reports) {
  const counts = { defect: 0, concern: 0, question: 0, fix: 0 };
  let demoted = 0;
  let unread = 0;
  let unreadFix = 0;
  let verdict = 'CLEAN';
  const sections = [];
  for (const { name, text } of reports) {
    const own = verdictOf(text);
    if (VERDICT_RANK[own] > VERDICT_RANK[verdict]) verdict = own;
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const match = line.match(FINDING);
      if (!match) {
        const loose = PROBE_LINE.test(line) ? null : line.match(UNREAD);
        if (loose) {
          unread += 1;
          if (loose[2] === 'fix') unreadFix += 1;
        }
        return;
      }
      counts[match[1]] += 1;
      if (match[2] !== 'fix') return;
      if (PROBE_LINE.test(lines[index + 1] ?? '')) {
        counts.fix += 1;
      } else {
        demoted += 1;
        lines[index] = line.replace(/\bfix(\W*)$/, 'report$1');
      }
    });
    sections.push(`## ${name}\n\n${lines.join('\n').trim()}\n`);
  }
  if (verdict === 'CLEAN' && counts.defect + counts.concern +counts.question + unread > 0) verdict = 'FINDINGS';
  const head = `${verdict}\n\n`;
  const tail = `Count: defect=${counts.defect} concern=${counts.concern}question=${counts.question} fix=${counts.fix}\n`;
  return { verdict, counts, demoted, unread, unreadFix, text: `${head}${sections.join('\n')}\n${tail}` };
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', report: 'list' }, { usage: USAGE });
  if (!flags.root) throw new UsageError('--root is required');
  if (!flags.report?.length) throw new UsageError('--report is required');
  const reports = flags.report.map((file) => ({
    name: path.basename(file, '.md'),
    text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'BLOCKED: report missing\n'
  }));
  const { verdict, counts, demoted, unread, unreadFix, text } = mergeReviews(reports);
  const target = path.join(flags.root, '.exo', 'branch-review.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  process.stdout.write(
    `verdict=${verdict} defect=${counts.defect} concern=${counts.concern} question=${counts.question} fix=${counts.fix} report=${target}\n`
  );
  if (demoted > 0) process.stdout.write(`DEMOTED ${demoted} fix finding(s) to report: no Probe: line under them\n`);
  if (unread > 0) process.stdout.write(`UNREAD ${unread} finding line(s) not in the one-line shape, ${unreadFix} marked fix\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`merge-reviews: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
