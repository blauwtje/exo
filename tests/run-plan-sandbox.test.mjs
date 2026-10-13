import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { childEnv, projectEcosystems, sandboxMode, sandboxSettings } from '../skills/build/scripts/run-session.mjs';
import { fixture } from './harness.mjs';

const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const mode = { enabled: true, allowedDomains: [] };

async function repo(files) {
  const root = await fixture();
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(root, name), content);
  return root;
}

const provider = { name: 'claude', effort: 'medium', env: {} };

test('sandbox: run.json domains are added without duplicates, and a repo without manifests opens no registry', async () => {
  const root = await repo({ 'README.md': 'x\n' });
  const merged = sandboxMode({ defaults: { sandbox: { allowedDomains: ['example.com', 'example.com'] } } }, { platform: 'linux', root });
  assert.deepEqual(merged.allowedDomains, ['example.com']);
  assert.deepEqual(sandboxSettings(merged).sandbox.network.allowedDomains, merged.allowedDomains);
  assert.deepEqual(sandboxMode({}, { platform: 'linux', root }).allowedDomains, []);
});

test('sandbox: a package.json repo opens npm and its .npmrc registries, not NuGet, and sets no dotnet env', async () => {
  const root = await repo({ 'package.json': '{}\n', '.npmrc': 'registry=https://npm.corp.example/\n@acme:registry=https://acme.example/npm/\n' });
  const { allowedDomains } = sandboxMode({}, { platform: 'linux', root });
  for (const host of ['registry.npmjs.org', 'npm.corp.example', 'acme.example']) assert.ok(allowedDomains.includes(host), host);
  assert.ok(!allowedDomains.includes('api.nuget.org'));
  assert.ok(!allowedDomains.includes('registry.yarnpkg.com'));
  assert.equal(childEnv(null, provider, { ecosystemEnv: projectEcosystems({ root }).env }).MSBUILDDISABLENODEREUSE, undefined);
});

test('sandbox: yarn.lock and .yarnrc.yml add the yarn registry and its npmRegistryServer', async () => {
  const root = await repo({ 'package.json': '{}\n', 'yarn.lock': '\n', '.yarnrc.yml': 'npmRegistryServer: "https://yarn.corp.example"\n' });
  const { allowedDomains } = sandboxMode({}, { platform: 'linux', root });
  for (const host of ['registry.npmjs.org', 'registry.yarnpkg.com', 'yarn.corp.example']) assert.ok(allowedDomains.includes(host), host);
});

test('sandbox: a .csproj repo opens NuGet and nuget.config sources and gets the dotnet env, a user value winning', async () => {
  const root = await repo({ 'App.csproj': '<Project/>\n', 'nuget.config': '<configuration><packageSources><add key="corp" value="https://nuget.corp.example/v3/index.json" /></packageSources></configuration>\n' });
  const { allowedDomains } = sandboxMode({}, { platform: 'linux', root });
  for (const host of ['api.nuget.org', 'nuget.corp.example']) assert.ok(allowedDomains.includes(host), host);
  assert.ok(!allowedDomains.includes('registry.npmjs.org'));
  const { env } = projectEcosystems({ root });
  const before = process.env.MSBUILDDISABLENODEREUSE;
  try {
    delete process.env.MSBUILDDISABLENODEREUSE;
    assert.equal(childEnv(null, provider, { ecosystemEnv: env }).MSBUILDDISABLENODEREUSE, '1');
    assert.equal(childEnv(null, provider, { ecosystemEnv: env }).DOTNET_NOLOGO, '1');
    process.env.MSBUILDDISABLENODEREUSE = '0';
    assert.equal(childEnv(null, provider, { ecosystemEnv: env }).MSBUILDDISABLENODEREUSE, '0');
  } finally {
    if (before === undefined) delete process.env.MSBUILDDISABLENODEREUSE;
    else process.env.MSBUILDDISABLENODEREUSE = before;
  }
});

test('sandbox: pip.conf index URLs join PyPI for a Python repo', async () => {
  const root = await repo({ 'pyproject.toml': '\n', 'pip.conf': '[global]\nindex-url = https://pypi.corp.example/simple\nextra-index-url = https://extra.example/simple\n' });
  const { allowedDomains } = sandboxMode({}, { platform: 'linux', root });
  for (const host of ['pypi.org', 'files.pythonhosted.org', 'pypi.corp.example', 'extra.example']) assert.ok(allowedDomains.includes(host), host);
});

test('sandbox: a plan whose Files name Cargo.toml opens the crates hosts in an empty repo', async () => {
  const root = await repo({});
  const { allowedDomains } = sandboxMode({}, { platform: 'linux', root, planFiles: ['crates/app/Cargo.toml', 'src/main.rs'] });
  assert.deepEqual(allowedDomains, ['index.crates.io', 'static.crates.io']);
  assert.deepEqual(sandboxMode({}, { platform: 'linux', root, planFiles: ['go.mod'] }).allowedDomains, ['proxy.golang.org', 'sum.golang.org']);
});

test('sandbox: each unsandboxed script is excluded with and without arguments', () => {
  const landTask = path.join(PLUGIN_ROOT, 'skills', 'build', 'scripts', 'land-task.mjs');
  const verify = path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs');
  const task = sandboxSettings(mode).sandbox.excludedCommands;
  const tail = sandboxSettings(mode, { tail: true }).sandbox.excludedCommands;
  for (const command of [`node "${landTask}"`, `node ${landTask}`, `node "${landTask}":*`, `node ${landTask}:*`]) {
    assert.ok(task.includes(command), command);
    assert.ok(tail.includes(command), command);
  }
  for (const command of [`node "${verify}"`, `node ${verify}`, `node "${verify}":*`, `node ${verify}:*`]) {
    assert.ok(!task.includes(command), command);
    assert.ok(tail.includes(command), command);
  }
});
