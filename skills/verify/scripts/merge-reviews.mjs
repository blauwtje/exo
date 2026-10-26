import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { inRun } from '#run-decision';
import { codexVerdict } from './pick-reviewer.mjs';

const LEDGER_FILE = '.exo/review-ledger.jsonl';
const VERDICT_RANK = { CLEAN: 0, FINDINGS: 1, BLOCKED: 2 };
const PROBE_LINE = /^\s*Probe:\s*\S/;
const CLASS_LINE = /^\s*Class:\s*\S/;
const SWEEP_LINE = /^\s*Sweep:\s*\S/;
const FIX_DETAIL_LINE = /^\s*(?:Probe|Class|Sweep):\s*\S/;
const MECHANICAL_REPORT = 'code-rules';
const UNREAD = /\b(defect|concern|question|note)\b.*\b(fix|report)\W*$/;
const LOCATION = /^\s*(?:[-*]\s*)?(\S+?):(\d+)(?:-(\d+))?\b(.*)$/;
const WEIGHT = /\b(defect|concern|question|note)\b/;
const FINDING = /^\s*(?:[-*]\s*)?\S+:\d+(?:-\d+)?\b.*?\b(defect|concern|question|note)\b.*\b(fix|report)\W*$/;

const USAGE = `Usage: node merge-reviews.mjs --root <checkout> --report <file> [--report <file> ...]
Merges review reports into <checkout>/.exo/branch-review.md and prints the verdict line,
then each question, note and report finding as a FINDING line, then a CODEX offer or CODEX none line.
Inside an exo run the CODEX line is none and records no decision.`;

export function parseFinding(line) {
  const at = LOCATION.exec(line);
  if (at === null) return null;
  const rest = at[4];
  const rule = rest.startsWith(';') ? rest.split(';')[2] : rest.trim().split(/\s+/)[0];
  return {
    rule: rule?.trim() || null,
    path: at[1],
    range: at[3] ? `${at[2]}-${at[3]}` : at[2],
    weight: WEIGHT.exec(rest)?.[1] ?? null
  };
}

export function ledgerPath(root) {
  return path.join(root, LEDGER_FILE);
}

export function ledgerRows(root) {
  if (!fs.existsSync(ledgerPath(root))) return [];
  return fs.readFileSync(ledgerPath(root), 'utf8').split('\n').filter(Boolean).map((row) => JSON.parse(row));
}

export function latestRound(root) {
  return Math.max(0, ...ledgerRows(root).map((row) => row.round));
}

const findingKey = (row) => `${row.rule}@${row.path}`;

export function openInLastRound(root) {
  const rows = ledgerRows(root);
  const round = latestRound(root);
  const open = new Map();
  for (const row of rows.filter((entry) => entry.round === round)) {
    if (row.state === 'open') open.set(findingKey(row), row);
    if (row.state === 'fixed') open.delete(findingKey(row));
  }
  return open;
}

export function appendLedger(root, findings, round) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const sha = head.status === 0 ? head.stdout.trim() : null;
  const entries = findings.length > 0 ? findings : [{ rule: null, path: null, range: null, weight: 0, state: 'none' }];
  const rows = entries.map((finding) => `${JSON.stringify({ round, ...finding, head: sha })}\n`);
  fs.mkdirSync(path.dirname(ledgerPath(root)), { recursive: true });
  fs.appendFileSync(ledgerPath(root), rows.join(''));
}

function verdictOf(text) {
  for (const line of text.split('\n')) {
    const match = line.match(/\b(CLEAN|FINDINGS|BLOCKED)\b/);
    if (match) return match[1];
  }
  return 'BLOCKED';
}

function hasFixDetails(lines, index, name) {
  if (!PROBE_LINE.test(lines[index + 1] ?? '')) return false;
  if (name === MECHANICAL_REPORT) return true;
  return CLASS_LINE.test(lines[index + 2] ?? '') && SWEEP_LINE.test(lines[index + 3] ?? '');
}

function recurringOf(findings, prior) {
  return findings.filter((finding) => finding.state === 'open' && prior.has(findingKey(finding)))
    .map((finding) => ({ now: finding, before: prior.get(findingKey(finding)) }));
}

const reading = ({ round, path: file, range, weight }) => `round ${round}: ${file}:${range} ${weight}`;

export function mergeReviews(reports, prior = new Map()) {
  const counts = { defect: 0, concern: 0, question: 0, note: 0, fix: 0 };
  let demoted = 0;
  let unread = 0;
  let unreadFix = 0;
  let verdict = 'CLEAN';
  const sections = [];
  const shown = [];
  const findings = [];
  for (const { name, text } of reports) {
    const own = verdictOf(text);
    if (VERDICT_RANK[own] > VERDICT_RANK[verdict]) verdict = own;
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const match = line.match(FINDING);
      if (!match) {
        const loose = FIX_DETAIL_LINE.test(line) ? null : line.match(UNREAD);
        if (loose) {
          unread += 1;
          if (loose[2] === 'fix') unreadFix += 1;
          shown.push(`unread: ${line.trim()}`);
        }
        return;
      }
      counts[match[1]] += 1;
      let reported = match[2] !== 'fix';
      if (!reported && hasFixDetails(lines, index, name)) {
        counts.fix += 1;
      } else if (!reported) {
        demoted += 1;
        reported = true;
        lines[index] = line.replace(/\bfix(\W*)$/, 'report$1');
      }
      findings.push({ ...parseFinding(line), weight: match[1], state: reported ? 'reported' : 'open' });
      if (reported || match[1] === 'question' || match[1] === 'note') shown.push(lines[index].trim());
    });
    sections.push(`## ${name}\n\n${lines.join('\n').trim()}\n`);
  }
  const recurring = recurringOf(findings, prior);
  if (recurring.length > 0) verdict = 'BLOCKED';
  if (verdict === 'CLEAN' && counts.defect + counts.concern + counts.question + counts.note + unread > 0) verdict = 'FINDINGS';
  const head = `${verdict}\n\n`;
  const tail = `Count: defect=${counts.defect} concern=${counts.concern} question=${counts.question} note=${counts.note} fix=${counts.fix}\n`;
  return { verdict, counts, demoted, unread, unreadFix, shown, findings, recurring, text: `${head}${sections.join('\n')}\n${tail}` };
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', report: 'list' }, { usage: USAGE });
  if (!flags.root) throw new UsageError('--root is required');
  if (!flags.report?.length) throw new UsageError('--report is required');
  const reports = flags.report.map((file) => ({
    name: path.basename(file, '.md'),
    text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'BLOCKED: report missing\n'
  }));
  const round = latestRound(flags.root) + 1;
  const { verdict, counts, demoted, unread, unreadFix, shown, findings, recurring, text } = mergeReviews(reports, openInLastRound(flags.root));
  const target = path.join(flags.root, '.exo', 'branch-review.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  appendLedger(flags.root, findings, round);
  process.stdout.write(
    `verdict=${verdict} defect=${counts.defect} concern=${counts.concern} question=${counts.question} note=${counts.note} fix=${counts.fix} report=${target}\n`
  );
  for (const { now, before } of recurring) {
    process.stdout.write(`BLOCKED recurring ${now.rule} ${now.path}\n  ${reading(before)}\n  ${reading({ ...now, round })}\n`);
  }
  if (demoted > 0) process.stdout.write(`DEMOTED ${demoted} fix finding(s) to report: no Probe:, Class: and Sweep: lines under them\n`);
  if (unread > 0) process.stdout.write(`UNREAD ${unread} finding line(s) not in the one-line shape, ${unreadFix} marked fix\n`);
  for (const line of shown) process.stdout.write(`FINDING ${line}\n`);
  process.stdout.write(`CODEX ${inRun() ? 'none' : codexVerdict()}\n`);
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
