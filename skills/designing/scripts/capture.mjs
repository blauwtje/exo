// Deterministic screenshots for the ui-design skill.
//
// This file also owns the shared browser-capability ladder and the small CLI
// helpers that the skill folder's other scripts import, so the ladder and the
// flag grammar behave identically everywhere. Nothing here installs a
// dependency or writes inside the repository.
//
//   node scripts/capture.mjs --url <file:// or http:// url>
//                            [--viewport <width>x<height>]   (repeatable)
//                            [--full-page]
//                            [--color-scheme light|dark|no-preference]
//                            [--label <name>] [--out <dir>]

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { constants as fsConstants, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DISCOVERY_DISABLED_ENV = 'UI_DESIGN_TEST_DISABLE_BROWSER_DISCOVERY';

export const NO_BROWSER_MESSAGE =
  'ui-design: no browser available. Install Playwright in this project (npm i -D playwright) ' +
  'or set CHROME_PATH to a Chrome, Chromium, or Edge binary. This tool installs nothing.';

export const COLOR_SCHEMES = ['light', 'dark', 'no-preference'];

/**
 * Capabilities a caller can need beyond rendering a page and taking a picture
 * of it. Obscura is the fastest driven engine here and the only one that never
 * registers a desktop application, but it reports nothing for
 * CSS.getPlatformFontsForNode and ignores prefers-color-scheme, so a caller
 * that depends on either names it and drops to the next rung.
 */
export const BROWSER_CAPABILITIES = Object.freeze({
  darkColorScheme: 'color-scheme-dark',
  platformFonts: 'platform-fonts'
});

const OBSCURA_MISSING_CAPABILITIES = [
  BROWSER_CAPABILITIES.darkColorScheme,
  BROWSER_CAPABILITIES.platformFonts
];

const OBSCURA_READY_TIMEOUT_MS = 10_000;
const OBSCURA_STOP_GRACE_MS = 2_000;

/** Invalid arguments: the caller gets exit 2 and an empty stdout. */
export class UsageError extends Error {}

/** A required capability is missing: the caller gets exit 3. */
export class CapabilityError extends Error {
  constructor(message, payload) {
    super(message);
    this.payload = payload ?? null;
  }
}

export function parseFlags(argv, spec) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new UsageError(`unexpected argument '${token}'`);
    const name = token.slice(2);
    const kind = spec[name];
    if (!kind) throw new UsageError(`unknown flag '${token}'`);
    if (kind === 'boolean') {
      values[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`flag '${token}' needs a value`);
    }
    index += 1;
    if (kind === 'list') {
      (values[name] ??= []).push(value);
    } else {
      values[name] = value;
    }
  }
  return values;
}

// Every flag naming a JSON input fails the same three ways — absent, unreadable,
// unparseable — and each failure is a usage error, not a tool error.
export async function readJsonFlag(file, flag) {
  if (!file) throw new UsageError(`${flag} is required`);
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    throw new UsageError(`${flag} file '${file}' cannot be read`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`${flag} file '${file}' is not valid JSON`);
  }
}

export function parseViewport(text) {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(text);
  if (!match) throw new UsageError(`--viewport must be <width>x<height>, received '${text}'`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function parseColorScheme(text) {
  if (text === undefined) return 'no-preference';
  if (!COLOR_SCHEMES.includes(text)) {
    throw new UsageError(`--color-scheme must be one of ${COLOR_SCHEMES.join(', ')}`);
  }
  return text;
}

export function requireUrl(url) {
  if (!url) throw new UsageError('--url is required');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new UsageError(`--url is not a URL: '${url}'`);
  }
  if (!['file:', 'http:', 'https:'].includes(parsed.protocol)) {
    throw new UsageError(`--url must be file://, http:// or https://, received '${parsed.protocol}'`);
  }
  return parsed.href;
}

export function timestampedOutputDirectory() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return path.join(os.tmpdir(), `ui-design-${stamp}`);
}

export async function ensureDirectory(directory) {
  const resolved = path.resolve(directory);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

function chromeCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
  }
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
      .filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(root, 'Chromium', 'Application', 'chrome.exe')
    ]);
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
    '/usr/local/bin/chromium'
  ];
}

async function isExecutableFile(candidate) {
  try {
    const stats = await fs.stat(candidate);
    return stats.isFile();
  } catch {
    return false;
  }
}

function requireFromProject(moduleName, cwd) {
  try {
    const projectRequire = createRequire(pathToFileURL(path.join(cwd, 'package.json')));
    return projectRequire(moduleName);
  } catch {
    return null;
  }
}

/**
 * Resolve a command against PATH the way a shell would, without spawning one.
 * Unlike the fixed browser paths this scans a directory list anyone can write
 * to, so the executable bit is checked here and not only the file's existence.
 */
async function findOnPath(command) {
  const directories = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const suffixes = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE').split(';')
    : [''];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, command + suffix);
      if (!(await isExecutableFile(candidate))) continue;
      const runnable = await fs.access(candidate, fsConstants.X_OK).then(() => true, () => false);
      if (runnable) return candidate;
    }
  }
  return null;
}

// Playwright keeps every downloaded browser under one root. Asking the installed
// library where its own build lives finds that root, and the revision it was
// built against, even when that revision was never downloaded. Both beat
// guessing a per-platform cache path.
function playwrightRegistryLocation(chromium) {
  let registryPath;
  try {
    registryPath = chromium.executablePath();
  } catch {
    return null;
  }
  const segments = registryPath.split(path.sep);
  const revisionIndex = segments.findIndex((segment) => /^chromium(_headless_shell)?-\d+$/.test(segment));
  if (revisionIndex < 1) return null;
  const revisionDirectory = segments[revisionIndex];
  return {
    root: segments.slice(0, revisionIndex).join(path.sep),
    revision: revisionDirectory.slice(revisionDirectory.lastIndexOf('-') + 1)
  };
}

/**
 * A full Chrome.app registers itself with the desktop and flashes an icon in the
 * macOS Dock on every headless launch; Playwright's chrome-headless-shell does
 * not. Prefer an installed shell over any browser application, and inside the
 * shared browser root prefer the revision this client was built against, because
 * only that one is guaranteed to speak its protocol.
 */
async function headlessShellBinary(chromium) {
  const registry = playwrightRegistryLocation(chromium);
  if (!registry) return null;
  const entries = await fs.readdir(registry.root).catch(() => []);
  const revisionOf = (entry) => entry.slice(entry.lastIndexOf('-') + 1);
  const shells = entries.filter((entry) => /^chromium_headless_shell-\d+$/.test(entry));
  const matching = shells.filter((entry) => revisionOf(entry) === registry.revision);
  const newerFirst = shells
    .filter((entry) => revisionOf(entry) !== registry.revision)
    .sort((left, right) => Number(revisionOf(right)) - Number(revisionOf(left)));
  const binaryName = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  for (const revision of [...matching, ...newerFirst]) {
    const platformDirectories = await fs.readdir(path.join(registry.root, revision)).catch(() => []);
    for (const platformDirectory of platformDirectories) {
      const candidate = path.join(registry.root, revision, platformDirectory, binaryName);
      if (await isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The obscura server speaks CDP on a loopback port that any local process can
 * reach while it runs, so file:// access stays off unless the capture actually
 * needs it. Private-network access stays on: this tool exists to photograph a
 * development server, which is exactly what that flag permits.
 */
export function obscuraServerArguments(port, url) {
  const args = ['serve', '--port', String(port), '--host', '127.0.0.1', '--allow-private-network', '--quiet'];
  if (typeof url === 'string' && url.toLowerCase().startsWith('file://')) args.push('--allow-file-access');
  return args;
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startObscuraServer({ binary, url }) {
  const port = await reserveLoopbackPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const child = spawn(binary, obscuraServerArguments(port, url), { stdio: ['ignore', 'ignore', 'pipe'] });

  // Without a listener a spawn failure is an uncaught exception rather than the
  // capability error the ladder knows how to fall back from.
  let spawnFailure = null;
  child.on('error', (error) => { spawnFailure = error; });
  let complaint = '';
  child.stderr.on('data', (chunk) => { complaint = `${complaint}${chunk}`.slice(-400); });

  // This process owns the server: it holds an unauthenticated CDP port, so it is
  // stopped on every exit path and killed outright if it ignores the request.
  const stop = async () => {
    if (spawnFailure || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const escalation = setTimeout(() => child.kill('SIGKILL'), OBSCURA_STOP_GRACE_MS);
    try {
      await once(child, 'exit');
    } finally {
      clearTimeout(escalation);
    }
  };

  try {
    const deadline = Date.now() + OBSCURA_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnFailure) throw new CapabilityError(`obscura serve could not start: ${spawnFailure.message}`);
      if (child.exitCode !== null) {
        const detail = complaint.trim() ? `: ${complaint.trim()}` : '';
        throw new CapabilityError(`obscura serve exited with code ${child.exitCode}${detail}`);
      }
      const ready = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })
        .then((response) => response.ok, () => false);
      if (ready) return { endpoint, stop };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new CapabilityError(`obscura serve did not answer on ${endpoint} within ${OBSCURA_READY_TIMEOUT_MS}ms`);
  } catch (error) {
    await stop();
    throw error;
  }
}

// Rung 1 can be passed over for five different reasons and the caller is owed
// the one that actually applied, in the order the ladder checks them.
function obscuraSkipReason({ client, explicitBinary, unmet, excludeObscura, obscura }) {
  if (excludeObscura) return 'obscura: skipped after its server failed to start';
  if (!obscura) return 'obscura: not found on PATH';
  if (!client) return 'obscura: needs playwright or playwright-core as its CDP client';
  if (explicitBinary) return `obscura: skipped because CHROME_PATH names ${explicitBinary}`;
  if (unmet.length > 0) return `obscura: skipped because this run needs ${unmet.join(' and ')}`;
  return null;
}

/**
 * The one capability ladder. Rungs 1 to 3 drive a real page; rungs 4 and 5 can
 * only take a screenshot. Every attempt is recorded so the caller can report
 * which rung ran and why the others did not.
 */
export async function resolveBrowser({
  cwd = process.cwd(),
  colorScheme = 'no-preference',
  requires = [],
  excludeObscura = false
} = {}) {
  const attempts = [];
  if (process.env[DISCOVERY_DISABLED_ENV] === '1') {
    return {
      rung: null,
      engine: null,
      driven: false,
      chromium: null,
      executablePath: null,
      binary: null,
      attempts: [`${DISCOVERY_DISABLED_ENV}=1 disables every rung of the ladder`],
      reason: `${DISCOVERY_DISABLED_ENV}=1 disables every rung of the ladder`
    };
  }

  const playwright = requireFromProject('playwright', cwd);
  if (!playwright?.chromium) attempts.push(`playwright: not resolvable from ${cwd}`);
  const playwrightCore = playwright?.chromium ? null : requireFromProject('playwright-core', cwd);
  const client = playwright?.chromium ?? playwrightCore?.chromium ?? null;

  // CHROME_PATH is read before any rung is chosen: it names a browser on purpose,
  // so it outranks the obscura default, and a broken value is reported either way.
  const envBinary = process.env.CHROME_PATH;
  const explicitBinary = envBinary && (await isExecutableFile(envBinary)) ? envBinary : null;
  if (envBinary && !explicitBinary) attempts.push(`CHROME_PATH: '${envBinary}' is not an existing file`);

  // Rung 1: obscura renders through a CDP server of our own and registers no
  // desktop application, so nothing appears in the Dock while a capture runs.
  const needed = colorScheme === 'dark'
    ? [...requires, BROWSER_CAPABILITIES.darkColorScheme]
    : requires;
  const unmet = OBSCURA_MISSING_CAPABILITIES.filter((capability) => needed.includes(capability));
  const obscura = await findOnPath('obscura');
  const obscuraSkipped = obscuraSkipReason({ client, explicitBinary, unmet, excludeObscura, obscura });
  if (obscuraSkipped) {
    attempts.push(obscuraSkipped);
  } else {
    return {
      rung: 1,
      engine: 'obscura',
      driven: true,
      chromium: client,
      executablePath: null,
      binary: obscura,
      attempts: [...attempts, `obscura: ${obscura} driven over CDP`],
      reason: `obscura at ${obscura} driven over CDP`
    };
  }

  // Rung 2: a project that installs Playwright brings its own headless browser.
  if (playwright?.chromium) {
    return {
      rung: 2,
      engine: 'playwright',
      driven: true,
      chromium: playwright.chromium,
      executablePath: null,
      binary: null,
      attempts: [...attempts, 'playwright: resolved from the target project'],
      reason: 'playwright resolved from the target project'
    };
  }

  let binary = explicitBinary;
  if (!binary) {
    for (const candidate of chromeCandidates()) {
      if (await isExecutableFile(candidate)) {
        binary = candidate;
        break;
      }
    }
    if (!binary) attempts.push('platform-known Chrome, Chromium and Edge paths: none present');
  }

  // Rung 3: playwright-core driving a binary this machine already has. CHROME_PATH
  // names an explicit choice and keeps precedence; otherwise an installed headless
  // shell wins, because a browser application would claim a Dock icon.
  if (playwrightCore?.chromium) {
    const shell = explicitBinary ? null : await headlessShellBinary(playwrightCore.chromium);
    const drivenBinary = shell ?? binary;
    if (drivenBinary) {
      return {
        rung: 3,
        engine: 'playwright',
        driven: true,
        chromium: playwrightCore.chromium,
        executablePath: drivenBinary,
        binary: drivenBinary,
        attempts: [...attempts, `playwright-core: resolved with executablePath ${drivenBinary}`],
        reason: `playwright-core driving ${drivenBinary}`
      };
    }
    attempts.push('playwright-core: resolved but no compatible executablePath, so it is unavailable');
  } else if (!playwright?.chromium) {
    attempts.push(`playwright-core: not resolvable from ${cwd}`);
  }

  if (binary) {
    const rung = explicitBinary ? 4 : 5;
    return {
      rung,
      engine: 'chrome-cli',
      driven: false,
      chromium: null,
      executablePath: null,
      binary,
      attempts: [...attempts, `chrome-cli: ${binary}`],
      reason: `screenshot-only browser at ${binary}`
    };
  }

  return {
    rung: null,
    engine: null,
    driven: false,
    chromium: null,
    executablePath: null,
    binary: null,
    attempts,
    reason: attempts.join('; ')
  };
}

/**
 * Open a browser for a driven rung. Obscura needs a server of its own before
 * anything can connect to it, so both driven paths meet here and every caller
 * shuts down through the same close.
 */
async function launchDrivenBrowser({ capability, url }) {
  if (capability.engine !== 'obscura') {
    const launchOptions = capability.executablePath ? { executablePath: capability.executablePath } : {};
    const browser = await capability.chromium.launch(launchOptions);
    return { browser, close: () => browser.close() };
  }
  const server = await startObscuraServer({ binary: capability.binary, url });
  let browser;
  try {
    browser = await capability.chromium.connectOverCDP(server.endpoint);
  } catch (error) {
    await server.stop();
    throw error;
  }
  return {
    browser,
    close: async () => {
      try {
        await browser.close();
      } finally {
        await server.stop();
      }
    }
  };
}

/**
 * Obscura is the preferred rung but it is a server this process starts itself. A
 * stale binary or a port taken between reservation and bind must not turn a
 * working capture into a failure, so a failed start descends the ladder once and
 * reports the rung that actually ran.
 */
async function openDrivenBrowser({ capability, cwd, url, colorScheme, requires }) {
  try {
    return { capability, ...(await launchDrivenBrowser({ capability, url })) };
  } catch (error) {
    if (capability.engine !== 'obscura') throw error;
    const fallback = await resolveBrowser({ cwd, colorScheme, requires, excludeObscura: true });
    if (!fallback.driven) throw error;
    return { capability: fallback, ...(await launchDrivenBrowser({ capability: fallback, url })) };
  }
}

/**
 * Open a driven page on rungs 1 to 3. Returns null when no driven rung resolves;
 * the caller decides whether that is a diagnostic or a failure.
 */
export async function openDrivenPage({
  cwd = process.cwd(),
  url,
  viewport,
  colorScheme = 'no-preference',
  requires = []
} = {}) {
  const resolved = await resolveBrowser({ cwd, colorScheme, requires });
  if (!resolved.driven) return { capability: resolved, page: null, close: async () => {} };

  const { capability, browser, close: closeBrowser } = await openDrivenBrowser({
    capability: resolved,
    cwd,
    url,
    colorScheme,
    requires
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  return {
    capability,
    page,
    close: async () => {
      await context.close();
      await closeBrowser();
    }
  };
}

export function readPngGeometry(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const PNG_END_CHUNK = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

async function screenshotIsComplete(target) {
  const handle = await fs.open(target).catch(() => null);
  if (!handle) return false;
  try {
    const { size } = await handle.stat();
    if (size < PNG_END_CHUNK.length) return false;
    const tail = Buffer.alloc(PNG_END_CHUNK.length);
    await handle.read(tail, 0, tail.length, size - tail.length);
    return tail.equals(PNG_END_CHUNK);
  } finally {
    await handle.close();
  }
}

// Chrome writes the screenshot within about a second but then keeps a freshly
// created --user-data-dir profile alive for roughly a minute. Waiting for the
// PNG's IEND chunk rather than for process exit keeps a capture fast without
// giving up the isolated profile.
function runScreenshotBinary(binary, args, target) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'ignore' });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(deadline);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve();
    };
    const poll = setInterval(() => {
      screenshotIsComplete(target).then((complete) => {
        if (complete) finish();
      }, finish);
    }, 150);
    const deadline = setTimeout(
      () => finish(new Error(`${binary} wrote no complete screenshot within 60s`)), 60_000);
    child.on('error', finish);
    child.on('exit', (code) => {
      screenshotIsComplete(target).then((complete) => {
        if (complete) finish();
        else finish(new Error(`${binary} exited with code ${code} without writing ${target}`));
      }, finish);
    });
  });
}

async function captureWithCli({ binary, url, width, height, target }) {
  // A leftover file from an earlier run would otherwise satisfy the completion poll.
  await fs.rm(target, { force: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-design-profile-'));
  try {
    await runScreenshotBinary(binary, [
      '--headless',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--virtual-time-budget=2000',
      `--window-size=${width},${height}`,
      `--screenshot=${target}`,
      url
    ], target);
  } finally {
    await fs.rm(profile, { recursive: true, force: true });
  }
}

async function captureWithPlaywright({ capability, cwd, url, width, height, fullPage, colorScheme, target }) {
  const session = await openDrivenBrowser({ capability, cwd, url, colorScheme, requires: [] });
  const { browser, close } = session;
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      colorScheme,
      reducedMotion: 'no-preference'
    });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await page.screenshot({ path: target, fullPage });
    } finally {
      await context.close();
    }
  } finally {
    await close();
  }
  return session.capability;
}

export async function capture(options) {
  const { url, viewports, fullPage, colorScheme, label, outputDirectory, cwd } = options;
  let capability = await resolveBrowser({ cwd, colorScheme });
  if (!capability.engine) throw new CapabilityError(NO_BROWSER_MESSAGE);
  if (fullPage && !capability.driven) {
    throw new CapabilityError(NO_BROWSER_MESSAGE, {
      status: 'unavailable',
      reason: 'full-page capture requires Playwright',
      capability: 'full-page'
    });
  }

  const directory = await ensureDirectory(outputDirectory);
  const records = [];
  for (const { width, height } of viewports) {
    const suffix = fullPage ? '-fullpage' : '';
    const target = path.join(directory, `${label}-${width}x${height}${suffix}.png`);
    if (capability.driven) {
      // A rung that fell back stays fallen back for the remaining viewports, so
      // every record and the final report name the rung that actually ran.
      capability = await captureWithPlaywright({
        capability, cwd, url, width, height, fullPage, colorScheme, target
      });
    } else {
      await captureWithCli({ binary: capability.binary, url, width, height, target });
    }

    const bytes = await fs.readFile(target);
    const geometry = readPngGeometry(bytes);
    if (!geometry) throw new Error(`capture at ${target} is not a PNG`);
    if (geometry.width !== width) {
      throw new Error(`capture at ${target} decoded width ${geometry.width}, expected ${width}`);
    }
    if (!fullPage && geometry.height !== height) {
      throw new Error(`capture at ${target} decoded height ${geometry.height}, expected ${height}`);
    }
    records.push({
      label,
      width,
      height: geometry.height,
      fullPage,
      colorScheme,
      path: target,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      engine: capability.engine
    });
  }
  return { capability, records };
}

async function main(argv) {
  const flags = parseFlags(argv, {
    url: 'value',
    viewport: 'list',
    'full-page': 'boolean',
    'color-scheme': 'value',
    label: 'value',
    out: 'value'
  });
  const url = requireUrl(flags.url);
  const viewports = (flags.viewport ?? ['390x844', '1440x900']).map(parseViewport);
  const colorScheme = parseColorScheme(flags['color-scheme']);
  const label = flags.label ?? 'capture';
  if (!/^[A-Za-z0-9._-]+$/.test(label)) throw new UsageError('--label must be a plain file-name token');

  const { capability, records } = await capture({
    url,
    viewports,
    fullPage: Boolean(flags['full-page']),
    colorScheme,
    label,
    outputDirectory: flags.out ?? timestampedOutputDirectory(),
    cwd: process.cwd()
  });

  process.stderr.write(`ui-design: capture rung ${capability.rung} — ${capability.reason}\n`);
  for (const record of records) process.stdout.write(`${JSON.stringify(record)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof CapabilityError) {
      if (error.payload) process.stdout.write(`${JSON.stringify(error.payload)}\n`);
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 3;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
