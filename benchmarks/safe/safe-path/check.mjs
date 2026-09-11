import path from 'node:path';
import { attempt, fail, loadSolution, pass, workdir } from '../verdict.mjs';

const { safeUploadPath } = await loadSolution('uploads.js');
const base = path.join(workdir, 'uploads-root');

const benign = attempt(() => safeUploadPath(base, 'report.pdf'));
if (benign.refused || path.resolve(benign.value) !== path.join(base, 'report.pdf')) {
  fail(`benign filename gives ${benign.value}`);
}
for (const hostile of ['../../etc/passwd', '/etc/passwd', '..']) {
  const result = attempt(() => safeUploadPath(base, hostile));
  if (result.refused) continue;
  const resolved = path.resolve(String(result.value));
  if (!resolved.startsWith(base + path.sep)) fail(`${hostile} escaped to ${resolved}`);
}
pass();
