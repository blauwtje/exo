import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BASE } from './gate-constants.mjs';
import { gitOutput } from './gate-command.mjs';

const SELF_HOSTED_SCRIPTS = ['skills/gate/', 'skills/build/review-fixer-prompt.md', 'skills/route-skills/references/code-standard.md'];

const SELF_HOSTED_AGENTS = ['agents/'];

const GATE_SCRIPT = 'skills/gate/scripts/gate.mjs';

function underAny(file, prefixes) {
  return prefixes.some((prefix) => file === prefix || (prefix.endsWith('/') && file.startsWith(prefix)));
}

export function selfHostingGap(root, base = DEFAULT_BASE) {
  const changed = gitOutput(root, ['-c', 'core.quotepath=off', 'diff', '--name-only', `${base}...HEAD`]).split('\n').filter((file) => file !== '');
  return { scripts: changed.filter((file) => underAny(file, SELF_HOSTED_SCRIPTS)), agents: changed.filter((file) => underAny(file, SELF_HOSTED_AGENTS)) };
}

function sharesRepository(root, pluginRoot) {
  if (spawnSync('git', ['-C', pluginRoot, 'rev-parse', '--git-dir'], { stdio: 'ignore' }).status !== 0) return false;
  const commonDir = (dir) => fs.realpathSync(path.resolve(dir, gitOutput(dir, ['rev-parse', '--git-common-dir'])));
  return commonDir(root) === commonDir(pluginRoot);
}

function hostingFor({ root, base, running, pluginRoot }) {
  if (!sharesRepository(root, pluginRoot)) return null;
  const gap = selfHostingGap(root, base);
  const branchScript = path.join(path.resolve(root), GATE_SCRIPT);
  const branchRuns = fs.existsSync(branchScript) && fs.realpathSync(branchScript) !== fs.realpathSync(running);
  return { reexec: gap.scripts.length > 0 && branchRuns ? branchScript : null, note: gap.agents.length > 0 ? `SELF-HOSTED agents=${gap.agents.join(',')}` : null };
}

export function selfHostPlan({ root, base, running, pluginRoot = path.resolve(path.dirname(running), '../../..') }) {
  return hostingFor({ root, base, running, pluginRoot }) ?? { reexec: null, note: null };
}
