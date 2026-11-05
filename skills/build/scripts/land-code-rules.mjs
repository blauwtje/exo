import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { CODE_RULE_LIMITS, codeRuleFindings } from '#code-rules';
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

const CODE_RULE_FIXES = {
  'max-depth': 'less nesting',
  'max-params': 'one options object',
  'no-nested-ternary': 'an if or a lookup',
  'no-else-return': 'drop the else after return',
  comment: 'remove it or make the code clearer',
  suppression: 'remove it or make the code clearer',
};

function codeRuleHints(fails) {
  return Object.entries(CODE_RULE_FIXES)
    .filter(([rule]) => fails.some((fail) => fail.split(' ')[1] === rule))
    .map(([rule, fix]) => `Fix for ${rule}: ${fix}.\n`)
    .join('');
}

export function runCodeRules(files, root) {
  const { fails, warns } = codeRuleFindings({ root, base: 'HEAD', paths: files.filter((file) => !file.endsWith('/')) });
  if (fails.length > 0) {
    throw new CodeRuleError(`the added code breaks the code rules:\n${fails.join('\n')}\n${codeRuleHints(fails)}The ${CODE_RULE_LIMITS}.`);
  }
  return warns.map((warn) => `Code rule warning: ${warn}\n`).join('');
}
