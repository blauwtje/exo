import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dockerHost, ensureServices } from '../lib/services.mjs';

const SERVICES = path.resolve(import.meta.dirname, '../lib/services.mjs');

function project(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'services-'));
  spawnSync('git', ['-C', root, 'init', '-q']);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

function fakeDocker({ probes = [], starts = true, needed = true } = {}) {
  let clock = 0;
  const calls = { probe: 0, start: 0 };
  return {
    calls,
    needed: () => needed,
    probe: () => probes[calls.probe++] ?? false,
    start: () => { calls.start += 1; return starts; },
    sleep: (ms) => { clock += ms; },
    now: () => clock,
  };
}

test('a project without compose or Testcontainers needs no Docker', () => {
  const root = project({ 'package.json': '{"name":"plain"}' });
  assert.equal(dockerHost.needed(root), false);
  assert.equal(ensureServices(root, { docker: { ...fakeDocker(), needed: dockerHost.needed } }), 'up');
});

test('a compose file or a Testcontainers dependency needs Docker', () => {
  assert.equal(dockerHost.needed(project({ 'compose.yaml': 'services: {}' })), true);
  assert.equal(dockerHost.needed(project({ 'package.json': '{"dependencies":{"testcontainers":"^10"}}' })), true);
  assert.equal(dockerHost.needed(project({ 'pom.xml': '<artifactId>testcontainers</artifactId>' })), true);
  assert.equal(dockerHost.needed(project({ 'Api.csproj': '<PackageReference Include="Testcontainers.MsSql" />' })), true);
});

test('a mention outside a dependency declaration needs no Docker', () => {
  const mentions = {
    'README.md': 'We use Testcontainers for tests.',
    'CHANGELOG.md': '- add testcontainers support',
    'Fixture.cs': 'using Testcontainers;',
    'package.json': '{"name":"testcontainers-demo","description":"testcontainers"}',
    'requirements.txt': '# testcontainers\nrequests',
  };
  assert.equal(dockerHost.needed(project(mentions)), false);
});

test('an unparsable package.json needs no Docker', () => {
  assert.equal(dockerHost.needed(project({ 'package.json': '{"devDependencies":{"testcontainers"' })), false);
});

test('Testcontainers in any package.json dependency group needs Docker', () => {
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const manifest = JSON.stringify({ [group]: { '@testcontainers/postgresql': '^10' } });
    assert.equal(dockerHost.needed(project({ 'package.json': manifest })), true, group);
  }
});

test('a nested csproj PackageReference to Testcontainers needs Docker', () => {
  const reference = '<PackageReference Include="Testcontainers" Version="3.0.0" />';
  assert.equal(dockerHost.needed(project({ 'src/Api.Tests/Api.Tests.csproj': reference })), true);
});

test('Testcontainers in other build manifests needs Docker', () => {
  const manifests = {
    'pom.xml': '<dependency><groupId>org.testcontainers</groupId></dependency>',
    'build.gradle': "testImplementation 'org.testcontainers:postgresql:1.19.0'",
    'build.gradle.kts': 'testImplementation("org.testcontainers:postgresql:1.19.0")',
    'go.mod': 'module x\n\nrequire github.com/testcontainers/testcontainers-go v0.30.0',
    'pyproject.toml': 'dependencies = [\n  "testcontainers[postgres]>=4",\n]',
    'requirements-dev.txt': 'Testcontainers==4.0.0',
  };
  for (const [name, text] of Object.entries(manifests)) {
    assert.equal(dockerHost.needed(project({ [name]: text })), true, name);
  }
});

test('a gitignored manifest is skipped', () => {
  const root = project({ '.gitignore': 'vendor/\n', 'vendor/Dep.csproj': '<PackageReference Include="Testcontainers" />' });
  assert.equal(dockerHost.needed(root), false);
});

test('the exo checkout itself needs no Docker', () => {
  assert.equal(dockerHost.needed(path.resolve(import.meta.dirname, '..')), false);
});

test('a running daemon is up without starting the app', () => {
  const docker = fakeDocker({ probes: [true] });
  assert.equal(ensureServices('/x', { docker }), 'up');
  assert.equal(docker.calls.start, 0);
});

test('a stopped daemon is started and awaited until docker info answers', () => {
  const docker = fakeDocker({ probes: [false, false, true] });
  assert.equal(ensureServices('/x', { docker }), 'up');
  assert.equal(docker.calls.start, 1);
});

test('a daemon that never answers returns one stop line naming the wait', () => {
  const docker = fakeDocker();
  const result = ensureServices('/x', { docker, env: { EXO_DOCKER_READY_MS: '6000' } });
  assert.match(result, /^docker not ready: .*within 6 s.*EXO_DOCKER_READY_MS/);
  assert.equal(result.includes('\n'), false);
});

test('no installed app to start returns one stop line', () => {
  const docker = fakeDocker({ starts: false });
  const result = ensureServices('/x', { docker });
  assert.match(result, /^docker not running: /);
  assert.equal(result.includes('\n'), false);
});

test('the command line prints up for a project that needs no services', () => {
  const run = spawnSync(process.execPath, [SERVICES, '--root', project()], { encoding: 'utf8' });
  assert.equal(run.stdout, 'up\n');
  assert.equal(run.status, 0);
});
