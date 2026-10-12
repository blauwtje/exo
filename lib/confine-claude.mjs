import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { configDirectory } from '#config-directory';

const LINUX_SANDBOX = { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false };
const LINUX_SETTING_SOURCES = 'project,local';
const SETTING_SOURCES = '--setting-sources';
const SAFE_RULE_PATH = /^[\w./-]+$/;

const SLUG_LIMIT = 200;

export function transcriptFolder(realCwd, configDir = configDirectory()) {
  const slug = realCwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (slug.length > SLUG_LIMIT) throw new Error(`cannot derive the transcript folder of '${realCwd}', a path over ${SLUG_LIMIT} characters`);
  return path.join(configDir, 'projects', slug);
}

export function confineRefusal(platform = process.platform) {
  if (platform !== 'win32') return undefined;
  return 'refusing to run claude on Windows, since nothing there confines its writes to the run folder; run it on macOS or Linux';
}

function sbplString(text) {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

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

function settingSourcesValues(args) {
  return args.flatMap((arg, at) => {
    if (arg === SETTING_SOURCES) return [args[at + 1] ?? ''];
    if (arg.startsWith(`${SETTING_SOURCES}=`)) return [arg.slice(SETTING_SOURCES.length + 1)];
    return [];
  });
}

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

function flagValues(args, flags) {
  return args.flatMap((arg, at) => {
    const flag = flags.find((name) => arg === name || arg.startsWith(`${name}=`));
    if (flag === undefined) return [];
    return [arg === flag ? args[at + 1] : arg.slice(flag.length + 1)];
  });
}

function sessionOf(args) {
  const forked = args.includes('--fork-session');
  const ids = flagValues(args, ['--session-id']);
  const resumes = flagValues(args, ['--resume', '-r']);
  if (ids.length > 1 || resumes.length > 1) throw new Error('cannot scope the session-env root to a repeated --session-id or --resume; pass each once');
  if (!forked && (args.includes('--continue') || args.includes('-c'))) {
    throw new Error('cannot scope the session-env root to --continue without --fork-session, since the session id is not known beforehand; pass --resume <id>');
  }
  const given = ids[0] ?? (forked ? undefined : resumes[0]);
  const id = given ?? crypto.randomUUID();
  if (!/^[\w-]+$/.test(id)) throw new Error(`cannot scope the session-env root to '${id}', not a session id`);
  return { id, added: given === undefined ? ['--session-id', id] : [] };
}

function githubIsolation(parent) {
  const [gh, zsh] = ['gh', 'zsh'].map((name) => {
    const folder = path.join(parent, `isolated-${name}`);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  });
  return {
    GH_CONFIG_DIR: gh,
    GH_TOKEN: '',
    GITHUB_TOKEN: '',
    GH_ENTERPRISE_TOKEN: '',
    GITHUB_ENTERPRISE_TOKEN: '',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_TERMINAL_PROMPT: '0',
    ZDOTDIR: zsh
  };
}

export function confinedClaude({ args, roots, cwd = roots[0], tmp, settings, platform = process.platform, configDir = configDirectory() }) {
  const refusal = confineRefusal(platform);
  if (refusal !== undefined) throw new Error(refusal);
  if (roots.length === 0) throw new Error('confinedClaude needs at least one writable root');
  if (tmp === undefined) throw new Error('confinedClaude needs a tmp directory, an existing folder the caller removes');
  const writable = roots.map((root) => fs.realpathSync(root));
  const realCwd = fs.realpathSync(cwd);
  if (platform !== 'darwin') {
    const isolation = githubIsolation(fs.realpathSync(tmp));
    return { command: 'claude', args: [...linuxFlags(writable, realCwd, settings, args), ...args], env: isolation, cwd: realCwd };
  }
  const realTmp = fs.realpathSync(tmp);
  const transcripts = transcriptFolder(realCwd, configDir);
  fs.mkdirSync(transcripts, { recursive: true });
  writable.push(fs.realpathSync(transcripts));
  const session = sessionOf(args);
  const sessionEnv = path.join(configDir, 'session-env', session.id);
  fs.mkdirSync(sessionEnv, { recursive: true });
  writable.push(fs.realpathSync(sessionEnv));
  const settingsFlags = settings === undefined ? [] : ['--settings', JSON.stringify(settings)];
  return {
    command: 'sandbox-exec',
    args: ['-p', sandboxProfile(writable), 'claude', '--permission-mode', 'bypassPermissions', ...settingsFlags, ...session.added, ...args],
    env: { TMPDIR: `${realTmp}/`, CLAUDE_CODE_TMPDIR: realTmp, ...githubIsolation(realTmp) },
    cwd: realCwd
  };
}
