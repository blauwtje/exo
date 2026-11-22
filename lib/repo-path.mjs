import fs from 'node:fs';
import path from 'node:path';

const FILE_EXTENSION = /\.[a-z][a-z0-9]*$/;

export function looksLikeRepoPath(span, root) {
  if (/^[/~$]/.test(span)) return false;
  if (span.includes('/') && fs.existsSync(path.join(root, span.split('/')[0]))) return true;
  return FILE_EXTENSION.test(span);
}
