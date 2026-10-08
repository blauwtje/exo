// Confines one headless `claude` run so it cannot write outside its writable
// roots, `~/.claude` included, since such runs use the user's own home.
// The helper alone picks the permission mode per platform:
// - macOS: sandbox-exec with a profile that denies every file write except
//   under the roots' realpaths and the /dev nodes a shell needs and blocks
//   preferences (cfprefsd), LaunchServices, Apple Events and the launchctl,
//   open, osascript and defaults binaries, plus bypassPermissions, since the
//   OS confines the whole process; TMPDIR and CLAUDE_CODE_TMPDIR point at a
//   temporary directory inside the roots, and HOME and the config dir stay,
//   so keychain auth works and Claude's own `~/.claude` writes fail silently,
//   save its transcript: the run's own `<config dir>/projects/<slug>` folder,
//   the slug Claude Code derives from the cwd, is made beforehand and added
//   as a root, so `--resume` and the transcript readers work; a scratch cwd
//   unique per run gives a slug no other session loads. The config dir's
//   `session-env` folder is made and added as a root too, since Claude Code
//   makes `session-env/<session id>` before any SessionStart hook runs and
//   fails every hook when it cannot.
// - Linux: dontAsk, Edit and Write allowed only under the roots, and Claude's
//   sandbox for Bash with failIfUnavailable and no unsandboxed retry; a root
//   other than the cwd is passed through --add-dir. User settings never load
//   (--setting-sources project,local), so a user's permissions.allow or
//   sandbox paths cannot widen the writes; the --settings object still loads,
//   since Claude Code always adds flag and policy settings. Project and local
//   settings in the run's own cwd still merge. Claude Code's own process,
//   which makes `session-env`, stays outside that sandbox, so it needs no
//   root. Unverified-live: trialled on macOS only
//   (docs/research/evolve/plan2a-sandbox.md).
// - Windows: refused, since nothing there confines Bash.
// The caller passes its own base arguments (model, effort, prompt, output
// format, plugin flags) with no --permission-mode or --settings; its settings
// object goes in `settings`, since a second --settings flag would replace the
// first.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configDirectory } from '#config-directory';

const LINUX_SANDBOX = { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false };
const LINUX_SETTING_SOURCES = 'project,local';
const SETTING_SOURCES = '--setting-sources';
// A path an Edit or Write rule holds as is: no comma, space or bracket that
// would split or end the rule.
const SAFE_RULE_PATH = /^[\w./-]+$/;

// Claude Code cuts a slug over this length and appends a hash of the path.
const SLUG_LIMIT = 200;

/** The transcript folder Claude Code keeps for a session whose cwd is `realCwd`, a realpath: `<configDir>/projects/<slug>`. */
export function transcriptFolder(realCwd, configDir = configDirectory()) {
  const slug = realCwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (slug.length > SLUG_LIMIT) throw new Error(`cannot derive the transcript folder of '${realCwd}', a path over ${SLUG_LIMIT} characters`);
  return path.join(configDir, 'projects', slug);
}

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

/**
 * The sandbox-exec profile allowing file writes only under each of `roots`,
 * already realpaths, and the shell's /dev nodes. It also denies the cfprefsd,
 * LaunchServices and Apple Events services, so no preference, `open` or Apple
 * Event leaves the run, and the binaries that reach them or launchd. Launchd
 * itself refuses a job from a sandboxed process (seen on macOS 27), so a
 * copied launchctl gets nowhere either. The keychain and the network stay
 * reachable.
 */
export function sandboxProfile(roots) {
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    '(allow file-write*',
    ...roots.map((root) => `  (subpath ${sbplString(root)})`),
    '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper")',
    '  (regex #"^/dev/fd/") (regex #"^/dev/ttys"))',
    '(deny mach-lookup',
    '  (global-name "com.apple.cfprefsd.daemon") (global-name "com.apple.cfprefsd.agent")',
    '  (global-name "com.apple.coreservices.launchservicesd") (global-name-prefix "com.apple.lsd.")',
    '  (global-name "com.apple.coreservices.appleevents"))',
    '(deny appleevent-send)',
    '(deny process-exec',
    '  (literal "/bin/launchctl") (literal "/usr/bin/open") (literal "/usr/bin/osascript") (literal "/usr/bin/defaults"))',
    ''
  ].join('\n');
}

// Each --setting-sources value in `args`, in either the `--setting-sources
// <list>` or the `--setting-sources=<list>` form.
function settingSourcesValues(args) {
  return args.flatMap((arg, at) => {
    if (arg === SETTING_SOURCES) return [args[at + 1] ?? ''];
    if (arg.startsWith(`${SETTING_SOURCES}=`)) return [arg.slice(SETTING_SOURCES.length + 1)];
    return [];
  });
}

// The --setting-sources pair a Linux run adds, none when the caller's own
// value already leaves out `user`. Throws on a value naming `user` or naming
// no source, since either may load user settings.
function linuxSettingSources(args) {
  const values = settingSourcesValues(args);
  for (const value of values) {
    const sources = value.split(',').map((source) => source.trim()).filter((source) => source !== '');
    if (sources.length === 0 || sources.includes('user')) {
      throw new Error(`refusing ${SETTING_SOURCES} '${value}' on Linux, since user settings could widen the run's writes; pass ${LINUX_SETTING_SOURCES} or leave it out`);
    }
  }
  return values.length === 0 ? [SETTING_SOURCES, LINUX_SETTING_SOURCES] : [];
}

function linuxFlags(roots, cwd, settings, args) {
  for (const root of roots) {
    if (!SAFE_RULE_PATH.test(root)) throw new Error(`cannot scope Edit and Write to '${root}', a path a permission rule cannot hold`);
  }
  if (settings !== undefined && Object.hasOwn(settings, 'permissions')) {
    throw new Error('refusing a settings object with permissions on Linux, since its rules could widen the run\'s writes');
  }
  const allowed = ['Read', 'Glob', 'Grep', 'Skill', 'Agent', 'Bash', ...roots.flatMap((root) => [`Edit(/${root}/**)`, `Write(/${root}/**)`])];
  const added = roots.filter((root) => root !== cwd).flatMap((root) => ['--add-dir', root]);
  return [
    '--permission-mode', 'dontAsk',
    '--allowedTools', allowed.join(','),
    ...added,
    ...linuxSettingSources(args),
    '--settings', JSON.stringify({ ...settings, sandbox: LINUX_SANDBOX })
  ];
}

/**
 * The confined spawn of one `claude` run: `{ command, args, env, cwd }`, `env`
 * holding only the variables to add to the caller's. `roots` are the
 * existing directories the run may write under and `cwd` (default the first
 * root) one inside them; `tmp`, an existing directory inside them, becomes
 * the macOS temporary directory, or a fresh one is made and added as a root.
 * On macOS the cwd's transcript folder and the `session-env` folder under
 * `configDir` are made and added as roots. Throws on Windows with
 * `confineRefusal`'s message, and on Linux when `args` carry a --setting-sources value naming `user` or no source, or
 * `settings` carries `permissions`.
 */
export function confinedClaude({ args, roots, cwd = roots[0], tmp, settings, platform = process.platform, configDir = configDirectory() }) {
  const refusal = confineRefusal(platform);
  if (refusal !== undefined) throw new Error(refusal);
  if (roots.length === 0) throw new Error('confinedClaude needs at least one writable root');
  const writable = roots.map((root) => fs.realpathSync(root));
  const realCwd = fs.realpathSync(cwd);
  if (platform !== 'darwin') {
    return { command: 'claude', args: [...linuxFlags(writable, realCwd, settings, args), ...args], env: {}, cwd: realCwd };
  }
  let realTmp;
  if (tmp === undefined) {
    realTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-tmp-')));
    writable.push(realTmp);
  } else {
    realTmp = fs.realpathSync(tmp);
  }
  const transcripts = transcriptFolder(realCwd, configDir);
  fs.mkdirSync(transcripts, { recursive: true });
  writable.push(fs.realpathSync(transcripts));
  const sessionEnv = path.join(configDir, 'session-env');
  fs.mkdirSync(sessionEnv, { recursive: true });
  writable.push(fs.realpathSync(sessionEnv));
  const settingsFlags = settings === undefined ? [] : ['--settings', JSON.stringify(settings)];
  return {
    command: 'sandbox-exec',
    args: ['-p', sandboxProfile(writable), 'claude', '--permission-mode', 'bypassPermissions', ...settingsFlags, ...args],
    env: { TMPDIR: `${realTmp}/`, CLAUDE_CODE_TMPDIR: realTmp },
    cwd: realCwd
  };
}
