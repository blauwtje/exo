import fs from 'node:fs';
import path from 'node:path';
import { mainCheckout } from '#checkout';
import { proofsReport } from '#proofs-report';
import { answerOf, renderRunReport } from './gate-report.mjs';
import { transcriptFolder } from '#confine-claude';
import { agentContextTarget } from '#context-limits';
import { contextPeaks } from '#context-decisions';
import { gitText } from '#git';

function contextSection(planPath, root) {
  try {
    let since;
    try {
      since = Number(gitText(root, ['log', '--diff-filter=A', '--format=%ct', '--', planPath]).split('\n').filter(Boolean).pop()) * 1000;
    } catch { }
    if (!Number.isFinite(since) || since <= 0) since = fs.statSync(planPath).mtimeMs;
    const main = mainCheckout(root);
    const folders = new Set([fs.realpathSync(main), fs.realpathSync(root)]);
    const rows = [...folders].flatMap((folder) => contextPeaks({ folder: transcriptFolder(folder), since }));
    rows.sort((a, b) => b.peak - a.peak);
    const limit = agentContextTarget();
    return rows.map(({ label, peak }) => `- ${label}: ${Math.round(peak / 1000)}k${peak >= limit ? ` (over ${Math.round(limit / 1000)}k)` : ''}`);
  } catch (error) {
    return [`- not read: ${error.message.split('\n')[0]}`];
  }
}

export function writeRunReport(lines, { planPath, planText, root }) {
  const manual = lines.filter((line) => line.startsWith('MANUAL '));
  const checks = lines.filter((line) => !line.startsWith('MANUAL '));
  const reportPath = path.join(root, '.exo', 'run-report.md');
  const text = renderRunReport({
    answer: answerOf(checks, manual.length),
    proofs: proofsReport({ planPath, planText, root }).trimEnd(),
    checks,
    context: contextSection(planPath, root),
    manual: manual.map((line) => line.slice('MANUAL '.length))
  });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, text);
  return reportPath;
}
