import path from 'node:path';
import process from 'node:process';
import { sharedStateDenyRules } from '../../../lib/git-deny.mjs';
import { loopCommands } from '#plan-frame';
import { PLUGIN_ROOT, SCRIPT, spellings } from './run-session-paths.mjs';

export const DENY_RULES = [
  'Bash(git push *)', 'Bash(gh *)', 'Bash(git reset *)', 'Bash(git rebase *)', 'Bash(git cherry-pick *)',
  'Bash(git merge *)', 'Bash(git tag *)', 'Bash(git switch *)', 'Bash(git checkout *)', ...sharedStateDenyRules(),
  'Bash(git commit *)', 'Bash(git clean *)', 'Bash(git restore *)', 'Bash(node *settings.mjs*)',
  'Bash(npm publish*)', 'Bash(npm *publish*)', 'Bash(vercel*)', 'Bash(npx vercel*)',
  'Bash(netlify deploy*)', 'Bash(fly deploy*)', 'Bash(flyctl deploy*)'
];

const READ_ONLY_GIT = ['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'grep', 'branch --show-current', 'worktree list'];
export const SESSION_RULES = 'cwd is the run root: no `cd`. Chain Bash commands only when each part is allowed. Change files only with Edit/Write under the root, never a heredoc, python or `sed -i`. Record decisions only with the run-decision command.';
const READ_ONLY_INSPECT = ['ls', 'cat', 'grep', 'head', 'tail', 'wc', 'sed -n'];

const ruleSpelling = (spelling) => `/${spelling.split(path.sep).join('/')}`;
const pathRule = (tool, directory) => spellings(directory).map((spelling) => `${tool}(${ruleSpelling(spelling)}/**)`);
const fileRule = (tool, file) => spellings(file).map((spelling) => `${tool}(${ruleSpelling(spelling)})`);
const scriptRules = (files) => files.flatMap((file) => spellings(file).flatMap((spelling) => [`Bash(node "${spelling}" *)`, `Bash(node ${spelling} *)`]));

export const unsandboxedScripts = (tail) => [...(tail ? [SCRIPT.gate, SCRIPT.landTask] : [SCRIPT.landTask]), SCRIPT.runDecision];

export function allowRules({ root, planPath, plan, tail = false, repair = false, pluginRoot = PLUGIN_ROOT, sandbox = false, decisions = Boolean(process.env.EXO_RUN_DIR) }) {
  const paths = [
    ...[root, pluginRoot, path.dirname(planPath)].flatMap((directory) => pathRule('Read', directory)),
    ...pathRule('Edit', root),
    ...pathRule('Write', root),
    ...(repair ? fileRule('Edit', planPath) : [])
  ];
  if (sandbox) return [...new Set([...paths, ...scriptRules(unsandboxedScripts(tail))])];
  const scripts = [...(tail ? [SCRIPT.gate, SCRIPT.landTask] : [SCRIPT.landTask]), ...(decisions ? [SCRIPT.runDecision] : [])];
  const commands = loopCommands(plan)
    .filter((entry) => entry.field !== 'Success criterion')
    .flatMap((entry) => entry.parts.map((part) => `Bash(${part} *)`));
  return [...new Set([
    ...paths,
    ...scriptRules(scripts),
    ...commands,
    ...READ_ONLY_GIT.map((command) => `Bash(git ${command} *)`),
    ...READ_ONLY_INSPECT.flatMap((command) => [`Bash(${command})`, `Bash(${command} *)`])
  ])];
}

export function denyRules({ planPath, repair = false }) {
  if (repair) return [...DENY_RULES];
  return [...new Set([...DENY_RULES, ...fileRule('Edit', planPath), ...fileRule('Write', planPath)])];
}
