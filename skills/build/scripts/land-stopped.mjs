import fs from 'node:fs';
import path from 'node:path';
import { scratchPath } from '#scratch-path';

const STDIN_REPORT = 'stdin';

export const implementerReportPath = (root, number) => scratchPath(root, `implementer-${number}.md`);

function fileReportOf(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function reportFlagOf(report) {
  if (report !== '-') return { reportText: null, reportPath: report ?? null };
  return { reportText: fs.readFileSync(0, 'utf8'), reportPath: STDIN_REPORT };
}

const filled = (text) => text !== null && text.trim() !== '';

export function reportSourceOf({ root, number, reportText, reportPath }) {
  const named = reportPath ?? (reportText === null ? implementerReportPath(root, number) : STDIN_REPORT);
  if (filled(reportText)) return { reportText, reportPath: named };
  const file = named === STDIN_REPORT ? implementerReportPath(root, number) : named;
  const fromFile = fileReportOf(file);
  if (filled(fromFile)) return { reportText: fromFile, reportPath: file };
  return { reportText: null, reportPath: named };
}
