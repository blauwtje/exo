import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { codeRuleFindings, codeRuleRefusal } from '#code-rules';
import { LandingError, CodeRuleError } from './land-errors.mjs';

export function runLint(lint, files, root) {
  if (lint === null || lint === 'none') return;
  const paths = files
    .filter((file) => !file.endsWith('/') && SCRIPT_EXTENSIONS.has(path.extname(file)) && fs.existsSync(path.join(root, file)));
  if (paths.length === 0) return;
  const [command, ...args] = [...lint.split(/\s+/), ...paths];
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`.trim();
    throw new LandingError(`Lint "${lint}" failed:\n${output}`);
  }
}

export function runCodeRules(files, root) {
  const { fails, warns } = codeRuleFindings({ root, base: 'HEAD', paths: files.filter((file) => !file.endsWith('/')) });
  if (fails.length > 0) {
    throw new CodeRuleError(codeRuleRefusal(fails));
  }
  return warns.map((warn) => `Code rule warning: ${warn}\n`).join('');
}
