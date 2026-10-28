import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { onPath } from '#on-path';
import { fixShell, SED_FUNCTION, TIMEOUT_FUNCTION } from '../lib/shell-fixes.mjs';

const fix = (command, hasTimeout = false, bsd = () => false) => fixShell({ command, description: 'd' }, hasTimeout, bsd)?.command ?? null;

test('a command without an = word or timeout is left alone', () => {
  assert.equal(fix('echo a b; x=1 ls "=no"'), null);
  assert.equal(fix("echo '=x'"), null);
  assert.equal(fix('npm test -- --timeout 5; echo timeouts'), null);
  assert.equal(fixShell({}, false), null);
});

test('an = word gets the setopt prefix and keeps the other fields', () => {
  const out = fixShell({ command: 'echo =foo; echo ok', description: 'd' }, false);
  assert.equal(out.command, '[ -n "$ZSH_VERSION" ] && setopt noequals; echo =foo; echo ok');
  assert.equal(out.description, 'd');
});

test('a timeout word gets the function prefix and the command text stays as written', () => {
  for (const command of ['timeout 5 sleep 1', 'CI=1 timeout 5 sleep 1', 'time timeout 5 sleep 1', 'for f in a; do timeout 5 x; done', "cat <<'EOF'\ntimeout 5 x\nEOF"]) {
    assert.equal(fix(command), TIMEOUT_FUNCTION + command);
  }
  assert.equal(fix('echo =x; timeout 5 y'), '[ -n "$ZSH_VERSION" ] && setopt noequals; ' + TIMEOUT_FUNCTION + 'echo =x; timeout 5 y');
});

test('an unquoted $NAME list in a for loop adds shwordsplit; other commands keep the prefix', () => {
  const split = '[ -n "$ZSH_VERSION" ] && setopt noequals shwordsplit; ';
  for (const command of ['for f in $P; do echo $f; done', 'echo =x; for f in $FILES\ndo echo $f; done']) {
    assert.equal(fix(command), split + command, command);
  }
  for (const command of ['for f in "$P"; do echo $f; done', 'for f in a b; do echo $f; done', 'for f in $(ls); do echo $f; done']) {
    assert.equal(fix(command), null, command);
  }
  assert.equal(fix('echo =x; for f in "$P"; do :; done'), '[ -n "$ZSH_VERSION" ] && setopt noequals; echo =x; for f in "$P"; do :; done');
});

test('zsh splits an unquoted for-loop list after the fix', { skip: !onPath('zsh', process.env) }, () => {
  const out = spawnSync('zsh', ['-f', '-c', fix('P="a b"; for f in $P; do echo "[$f]"; done')], { encoding: 'utf8' }).stdout;
  assert.equal(out, '[a]\n[b]\n');
});

test('a word starting with == gets the setopt prefix', () => {
  assert.match(fix('echo ==== ; echo ok'), /^\[ -n "\$ZSH_VERSION" \] && setopt noequals; echo ====/);
});

test('timeout stays when the hook finds one on PATH', () => {
  assert.equal(fix('timeout 5 sleep 1', true), null);
});

test('zsh runs every part of the fixed chain with an = word', { skip: !onPath('zsh', process.env) }, () => {
  const run = (command) => spawnSync('zsh', ['-f', '-c', command], { encoding: 'utf8' });
  const raw = 'echo =nonexistentcmd; echo after';
  assert.doesNotMatch(run(raw).stdout, /after/);
  const result = run(fix(raw));
  assert.match(result.stdout, /=nonexistentcmd\nafter/);
});

test('the fixed timeout stops a long sleep under bash', () => {
  const started = Date.now();
  const result = spawnSync('bash', ['-c', fix('timeout 1 sleep 5; echo after')], { encoding: 'utf8' });
  assert.match(result.stdout, /after/);
  assert.ok(Date.now() - started < 4000, 'timing-ok: hang guard, timeout 1 ends near 1 s while an unfixed chain sleeps 5 s');
});

test('a PATH holding only gtimeout still gets the timeout function', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gtimeout-'));
  const savedPath = process.env.PATH;
  try {
    writeFileSync(join(dir, 'gtimeout'), '#!/bin/sh\n', { mode: 0o755 });
    process.env.PATH = dir;
    assert.equal(fixShell({ command: 'timeout 5 sleep 1' })?.command, `${TIMEOUT_FUNCTION}timeout 5 sleep 1`);
    writeFileSync(join(dir, 'timeout'), '#!/bin/sh\n', { mode: 0o755 });
    assert.equal(fixShell({ command: 'timeout 5 sleep 1' }), null);
  } finally {
    process.env.PATH = savedPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

const runBounded = (command) => {
  const started = Date.now();
  const result = spawnSync('bash', ['-c', fix(command)], { encoding: 'utf8', timeout: 10000 });
  return { ...result, ms: Date.now() - started };
};

test('the fixed timeout exits 127 when the command is missing', { timeout: 20000 }, () => {
  assert.equal(runBounded('timeout 5 exo-no-such-command-xyz').status, 127);
});

test('the fixed timeout refuses a flag with exit 125 rather than misread it', { timeout: 20000 }, () => {
  const result = runBounded('timeout -k 2 1 sleep 5');
  assert.equal(result.status, 125);
  assert.match(result.stderr, /only timeout DURATION COMMAND/);
});

test('the fixed timeout exits with the command status', { timeout: 20000 }, () => {
  assert.equal(runBounded("timeout 5 sh -c 'exit 3'").status, 3);
});

const runBoundedAsync = (command) => new Promise((resolve) => {
  const started = Date.now();
  const child = spawn('bash', ['-c', fix(command)], { timeout: 10000 });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.on('close', (status) => resolve({ status, stdout, ms: Date.now() - started }));
});

const gone = (pid) => {
  for (let round = 0; round < 20; round++) {
    try {
      process.kill(pid, 0);
      spawnSync('sleep', ['0.1']);
    } catch {
      return true;
    }
  }
  return false;
};

test('the fixed timeout ends a child holding stdout open and exits 124', { timeout: 20000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'perl-bound-'));
  const pidFile = join(dir, 'pid');
  let pid;
  try {
    const result = runBounded(`timeout 1 sh -c 'sleep 30 & echo $! > ${pidFile}; wait'`);
    pid = Number(readFileSync(pidFile, 'utf8'));
    assert.ok(result.ms < 5000, `returned after ${result.ms} ms`);
    assert.equal(result.status, 124);
    assert.ok(gone(pid), 'child sleep still running');
  } finally {
    if (pid) try { process.kill(pid, 'SIGKILL'); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the fixed timeout leaves no child behind when the bash group is killed', { timeout: 20000 }, () => {
  const result = spawnSync('node', ['lib/stall-guard.mjs', '--', fix('timeout 3 sh -c "sleep 15"')], {
    env: { ...process.env, EXO_STALL_MS: '1000' },
    timeout: 12000
  });
  assert.equal(result.status, 124);
});

test('a timeout anywhere the shell runs one is bounded: after do, after a fake heredoc opener, before more commands, with a unit', { timeout: 20000 }, async () => {
  const commands = [
    'for f in a; do timeout 1 sleep 15; echo "done $?"; done',
    'echo "a <<b"\ntimeout 1 sleep 15; echo "done $?"',
    'echo $((1<<2))\ntimeout 1 sleep 15; echo "done $?"',
    'timeout 1 sh -c "sleep 15"; echo "done $?"',
    'timeout 0.01m sleep 15; echo "done $?"'
  ];
  const results = await Promise.all(commands.map(runBoundedAsync));
  results.forEach((result, index) => {
    const command = commands[index];
    assert.match(result.stdout, /done 124/, command);
    assert.ok(result.ms < 5000, `${command}: ${result.ms} ms`);
  });
});

test('a timeout word in any command position or as an argument gets the prefix on a host without timeout', () => {
  for (const command of ['case x in a) timeout 5 y;; esac', 'X=$(date +%s) timeout 5 y', 'for i in 1; do timeout 5 y; done', 'grep -n timeout src/a.js']) {
    assert.equal(fix(command), TIMEOUT_FUNCTION + command, command);
  }
});

test('--timeout and timeouts are not a timeout word', () => {
  for (const command of ['curl --timeout 5 x', 'cat timeouts.log', 'run --no-timeout']) {
    assert.equal(fixShell({ command }, false), null, command);
  }
});

test('a bare sed -i gets the sed function only on BSD sed', () => {
  assert.equal(fix("sed -i 's/a/b/' f", false, () => true), SED_FUNCTION + "sed -i 's/a/b/' f");
  assert.equal(fix("sed -i 's/a/b/' f", false, () => false), null);
  for (const command of ["sed -i '' 's/a/b/' f", "sed -i.bak 's/a/b/' f", "sed -i'' 's/a/b/' f", "sed -n 's/a/b/p' f"]) {
    assert.equal(fix(command, false, () => true), null);
  }
});

test('the sed function turns a bare -i into -i with an empty suffix and keeps other arguments', { skip: process.platform !== 'darwin' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sedfix-'));
  try {
    const file = join(dir, 'f.txt');
    writeFileSync(file, 'a a\n');
    const result = spawnSync('bash', ['-c', fix(`sed -i 's/a/b/g' ${file}`, false, () => true)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, 'utf8'), 'b b\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const runSedFunction = (script) => {
  const dir = mkdtempSync(join(tmpdir(), 'sedargs-'));
  try {
    writeFileSync(join(dir, 'sed'), `#!/bin/sh\nprintf '[%s]' "$@"\n`, { mode: 0o755 });
    return spawnSync('bash', ['-c', SED_FUNCTION + script], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('the sed function leaves the caller variables n and a as they were', () => {
  assert.equal(runSedFunction('n=keep a=keep; sed -n p f >/dev/null; echo "$n $a"').stdout, 'keep keep\n');
});

test('the sed function passes a correct -i empty suffix through beside a bare -i', () => {
  assert.equal(runSedFunction("sed -i -i '' -e x f").stdout, '[-i][][-i][][-e][x][f]');
});
