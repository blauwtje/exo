// Confines one headless `claude` run so it cannot write outside its writable
// roots, `~/.claude` included, since such runs use the user's own home.
// The helper alone picks the permission mode per platform:
// - macOS: sandbox-exec with a profile that denies every file write except
//   under the roots' realpaths and the /dev nodes a shell needs, plus
//   bypassPermissions, since the OS confines the whole process; TMPDIR and
//   CLAUDE_CODE_TMPDIR point at a temporary directory inside the roots, and
//   HOME and the config dir stay, so keychain auth works and Claude's own
//   `~/.claude` writes fail silently.
// - Linux: dontAsk, Edit and Write allowed only under the roots, and Claude's
//   sandbox for Bash with failIfUnavailable and no unsandboxed retry; a root
//   other than the cwd is passed through --add-dir. Unverified: trialled on
//   macOS only (docs/research/evolve/plan2a-sandbox.md).
// - Windows: refused, since nothing there confines Bash.
// The caller passes its own base arguments (model, effort, prompt, output
// format, plugin flags) with no --permission-mode or --settings; its settings
// object goes in `settings`, since a second --settings flag would replace the
// first.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LINUX_SANDBOX = { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false };
// A path an Edit or Write rule holds as is: no comma, space or bracket that
// would split or end the rule.
const SAFE_RULE_PATH = /^[\w./-]+$/;

/** The message a run on `platform` is refused with, or undefined when it can be confined. */
export function confineRefusal(platform = process.platform) {
  if (platform !== 'win32') return undefined;
  return 'refusing to run claude on Windows, since nothing there confines its writes to the run folder; run it on macOS or Linux';
}

// An SBPL string literal holding `text`, so a quote or backslash in a path
// cannot end the string.
function sbplString(text) {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The sandbox-exec profile allowing file writes only under each of `roots`, already realpaths, and the shell's /dev nodes. */
export function sandboxProfile(roots) {
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    '(allow file-write*',
    ...roots.map((root) => `  (subpath ${sbplString(root)})`),
    '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper")',
    '  (regex #"^/dev/fd/") (regex #"^/dev/ttys"))',
    ''
  ].join('\n');
}

function linuxFlags(roots, cwd, settings) {
  for (const root of roots) {
    if (!SAFE_RULE_PATH.test(root)) throw new Error(`cannot scope Edit and Write to '${root}', a path a permission rule cannot hold`);
  }
  const allowed = ['Read', 'Glob', 'Grep', 'Skill', 'Agent', 'Bash', ...roots.flatMap((root) => [`Edit(/${root}/**)`, `Write(/${root}/**)`])];
  const added = roots.filter((root) => root !== cwd).flatMap((root) => ['--add-dir', root]);
  return [
    '--permission-mode', 'dontAsk',
    '--allowedTools', allowed.join(','),
    ...added,
    '--settings', JSON.stringify({ ...settings, sandbox: LINUX_SANDBOX })
  ];
}

/**
 * The confined spawn of one `claude` run: `{ command, args, env, cwd }`, `env`
 * holding only the variables to add to the caller's. `roots` are the
 * existing directories the run may write under and `cwd` (default the first
 * root) one inside them; `tmp`, an existing directory inside them, becomes
 * the macOS temporary directory, or a fresh one is made and added as a root.
 * Throws on Windows with `confineRefusal`'s message.
 */
export function confinedClaude({ args, roots, cwd = roots[0], tmp, settings, platform = process.platform }) {
  const refusal = confineRefusal(platform);
  if (refusal !== undefined) throw new Error(refusal);
  if (roots.length === 0) throw new Error('confinedClaude needs at least one writable root');
  const writable = roots.map((root) => fs.realpathSync(root));
  const realCwd = fs.realpathSync(cwd);
  if (platform !== 'darwin') {
    return { command: 'claude', args: [...linuxFlags(writable, realCwd, settings), ...args], env: {}, cwd: realCwd };
  }
  let realTmp;
  if (tmp === undefined) {
    realTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-tmp-')));
    writable.push(realTmp);
  } else {
    realTmp = fs.realpathSync(tmp);
  }
  const settingsFlags = settings === undefined ? [] : ['--settings', JSON.stringify(settings)];
  return {
    command: 'sandbox-exec',
    args: ['-p', sandboxProfile(writable), 'claude', '--permission-mode', 'bypassPermissions', ...settingsFlags, ...args],
    env: { TMPDIR: `${realTmp}/`, CLAUDE_CODE_TMPDIR: realTmp },
    cwd: realCwd
  };
}
