import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { adapters } from '../harnesses/registry.mjs';
import { findCapabilityProblems, harnessNames, readCapabilities } from '../harnesses/capabilities.mjs';
import { codexHookEntries } from '../harnesses/codex/hooks.mjs';
import { currentHost } from '../lib/host.mjs';
import { readKindTable } from '../lib/model-kinds.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function repositoryState() {
  return {
    capabilities: readCapabilities(),
    adapterNames: adapters.map((adapter) => adapter.name),
    served: { codex: Object.keys(codexHookEntries(ROOT)) },
    providers: readKindTable(fileURLToPath(new URL('../lib/model-kinds.json', import.meta.url))).providers
  };
}

test('the repository has no capability problems', () => {
  const state = repositoryState();
  state.adapterNames = harnessNames();
  assert.deepEqual(findCapabilityProblems(state), []);
});

test('a row without an adapter fails', () => {
  const state = repositoryState();
  state.adapterNames = ['claude'];
  assert.match(findCapabilityProblems(state).join('\n'), /codex has no adapter/);
});

test('an adapter without a row fails', () => {
  const state = repositoryState();
  state.adapterNames = [...harnessNames(), 'extra'];
  assert.match(findCapabilityProblems(state).join('\n'), /extra has no capabilities row/);
});

test('hook events that differ from the row fail', () => {
  const state = repositoryState();
  state.adapterNames = harnessNames();
  state.served.codex = ['SessionStart'];
  assert.match(findCapabilityProblems(state).join('\n'), /codex serves hooks/);
});

test('an effort the row lacks fails', () => {
  const state = repositoryState();
  state.adapterNames = harnessNames();
  state.capabilities.codex.efforts = ['low'];
  assert.match(findCapabilityProblems(state).join('\n'), /provider codex maps to effort/);
});

test('hosts come from the row names', () => {
  for (const name of harnessNames()) assert.equal(currentHost({ EXO_HOST: name }), name);
  assert.equal(currentHost({ EXO_HOST: 'other' }), 'claude');
});
