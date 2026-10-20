// A user who types /verify gets Claude Code's bundled skill, not exo's, and
// /configure runs hookify's command. This check compares each skills/*/SKILL.md
// name with the names a user is likely to have installed beside exo: Claude
// Code's bundled skills, its built-in commands, and the commands and skills of
// plugins in the marketplace cache. Same name = clash; another name a proper
// prefix of the exo name = shadow. The clashes and shadows in BASELINE are
// accepted until a rename lands (PASS); any other clash with a pinned Claude Code
// name FAILs, and so does a new shadow of one. A clash or shadow with a
// marketplace name that is not in BASELINE is a note, because the cache differs
// per machine.
// `--strict` ignores BASELINE.
//
//   node verify/checks/name-clash.mjs [--strict] [--root <repository>] [--marketplaces <folder>]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { configDirectory } from '../../lib/config-directory.mjs';
import { readFrontmatter } from '../frontmatter.mjs';
import { createReport } from '../report.mjs';
import { createRepository } from '../repository.mjs';

// Pinned from Claude Code v2.1.304 (bundled skill list and command table); a
// subset, extended by hand when a release adds a name.
export const BUNDLED_SKILLS = ['batch', 'code-review', 'commit', 'debug', 'loop', 'pr', 'run', 'simplify', 'update-config', 'verify'];
export const BUILTIN_COMMANDS = [
  'add-dir', 'agents', 'bug', 'clear', 'compact', 'config', 'context', 'cost', 'doctor', 'exit', 'export', 'help', 'hooks', 'ide',
  'init', 'login', 'logout', 'mcp', 'memory', 'model', 'output-style', 'permissions', 'plan', 'plugin', 'pr-comments', 'release-notes',
  'resume', 'review', 'rewind', 'settings', 'skills', 'status', 'statusline', 'terminal-setup', 'theme', 'usage', 'vim'
];

const MINIMUM_PREFIX = 3;
const MAXIMUM_DEPTH = 6;

// Names a user may hold from marketplace plugins: commands/<name>.md and
// skills/<name>/SKILL.md, each tagged with the plugin folder that ships it.
export function marketplaceNames(folder) {
  const found = [];
  const relative = (directory) => path.relative(folder, directory).split(path.sep).join('/') || path.basename(folder);
  function visit(directory, depth) {
    if (depth > MAXIMUM_DEPTH || !fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      if (entry.name === 'commands') {
        for (const file of fs.readdirSync(full)) if (file.endsWith('.md')) found.push({ name: file.slice(0, -3), source: `${relative(directory)} command` });
      } else if (entry.name === 'skills') {
        for (const skill of fs.readdirSync(full, { withFileTypes: true })) {
          if (skill.isDirectory() && fs.existsSync(path.join(full, skill.name, 'SKILL.md'))) found.push({ name: skill.name, source: `${relative(directory)} skill` });
        }
      } else {
        visit(full, depth + 1);
      }
    }
  }
  visit(folder, 0);
  const seen = new Set();
  return found.filter((entry) => !/(^|\/)exo\//.test(entry.source) && !seen.has(`${entry.name} ${entry.source}`) && seen.add(`${entry.name} ${entry.source}`));
}

export function findNameClashes(ownNames, others) {
  const clashes = [];
  const shadows = [];
  for (const own of ownNames) {
    for (const other of others) {
      if (own === other.name) clashes.push({ name: own, with: other.source });
      else if (other.name.length >= MINIMUM_PREFIX && own.startsWith(other.name)) {
        shadows.push({ name: own, with: `${other.name} (${other.source})` });
      }
    }
  }
  return { clashes, shadows };
}

function skillNames(root) {
  const skillsRoot = path.join(root, 'skills');
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => readFrontmatter(fs.readFileSync(path.join(skillsRoot, entry.name, 'SKILL.md'), 'utf8').split(/\r?\n/)).values.get('name') ?? entry.name)
    .sort();
}

// Accepted today: key = `<exo name> ~ <other source>`, value = why it stays.
export const BASELINE = new Map([
  ['verify ~ Claude Code bundled skill', 'rename deferred to round 2; routing eval reruns with it'],
  ['configure ~ claude-plugins-official/plugins/hookify command', 'rename deferred to round 2; hookify is optional'],
  ['configure ~ claude-plugins-official/external_plugins/discord skill', 'channel plugin, rarely installed with exo; rename deferred'],
  ['configure ~ claude-plugins-official/external_plugins/imessage skill', 'channel plugin, rarely installed with exo; rename deferred'],
  ['configure ~ claude-plugins-official/external_plugins/telegram skill', 'channel plugin, rarely installed with exo; rename deferred'],
  ['configure ~ config (Claude Code command)', 'typing /config reaches the built-in; rename deferred'],
  ['run-plan ~ run (Claude Code bundled skill)', 'typing /run reaches the bundled skill; rename deferred'],
  ['design-ui ~ design (ui-ux-pro-max-skill/cli/assets skill)', 'third-party skill; rename deferred']
]);

const keyOf = (item) => `${item.name} ~ ${item.with}`;
const describe = (items) => items.map(keyOf).join('; ');
const PINNED_SOURCE = /^(Claude Code |[\w-]+ \(Claude Code )/;

export function checkNameClash(report, repository, { strict = false, marketplaces = path.join(configDirectory(), 'plugins', 'marketplaces') } = {}) {
  const others = [
    ...BUNDLED_SKILLS.map((name) => ({ name, source: 'Claude Code bundled skill' })),
    ...BUILTIN_COMMANDS.map((name) => ({ name, source: 'Claude Code command' })),
    ...marketplaceNames(marketplaces)
  ];
  const { clashes, shadows } = findNameClashes(skillNames(repository.root), others);
  const accepted = (item) => !strict && BASELINE.has(keyOf(item));
  const unaccepted = clashes.filter((item) => !accepted(item));
  const newClashes = unaccepted.filter((item) => PINNED_SOURCE.test(item.with));
  const notedClashes = unaccepted.filter((item) => !newClashes.includes(item));
  const newShadows = shadows.filter((item) => !accepted(item));
  const failingShadows = newShadows.filter((item) => PINNED_SOURCE.test(item.with));
  const noted = newShadows.filter((item) => !failingShadows.includes(item));
  const counted = `${clashes.length - unaccepted.length} exact and ${shadows.length - newShadows.length} prefix accepted in BASELINE, ${others.length} names scanned`;
  if (newClashes.length === 0) report.result('PASS', 'name clash', `no new exo skill name equals a bundled, built-in or marketplace name; ${counted}`);
  else report.result('FAIL', 'name clash', `${newClashes.length} new exact: ${describe(newClashes)}; rename the exo skill, or accept it in BASELINE with a reason`);
  if (notedClashes.length > 0) report.note('name clash', `${notedClashes.length} exact clash found only in the local plugin cache (machine-dependent), not in BASELINE: ${describe(notedClashes)}`);
  if (failingShadows.length > 0) report.result('FAIL', 'name shadow', `${failingShadows.length} new prefix: ${describe(failingShadows)}; typing the shorter name reaches the other one first`);
  if (noted.length > 0) report.note('name shadow', `${noted.length} marketplace prefix not in BASELINE: ${describe(noted)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { values } = parseArgs({ options: { strict: { type: 'boolean', default: false }, root: { type: 'string' }, marketplaces: { type: 'string' } } });
  const report = createReport();
  const options = { strict: values.strict };
  if (values.marketplaces) options.marketplaces = path.resolve(values.marketplaces);
  checkNameClash(report, createRepository(path.resolve(values.root ?? path.join(import.meta.dirname, '..', '..'))), options);
  const counts = report.counts();
  process.exitCode = counts.FAIL > 0 ? 1 : 0;
}
