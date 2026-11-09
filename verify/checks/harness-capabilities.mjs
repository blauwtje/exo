import fs from 'node:fs';
import path from 'node:path';
import { adapters } from '../../harnesses/registry.mjs';
import { findCapabilityProblems, readCapabilities } from '../../harnesses/capabilities.mjs';
import { codexHookEntries } from '../../harnesses/codex/hooks.mjs';

function readJson(root, ...parts) {
  return JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

function gather(root) {
  return {
    capabilities: readCapabilities(path.join(root, 'harnesses', 'capabilities.json')),
    adapterNames: adapters.map((adapter) => adapter.name),
    served: {
      claude: Object.keys(readJson(root, 'hooks', 'hooks.json').hooks),
      codex: Object.keys(codexHookEntries(root))
    },
    providers: readJson(root, 'lib', 'model-kinds.json').providers
  };
}

export function checkHarnessCapabilities(report, repository) {
  const name = 'harness capabilities';
  let problems;
  try {
    problems = findCapabilityProblems(gather(repository.root));
  } catch (error) {
    report.result('FAIL', name, error.message);
    return;
  }
  if (problems.length === 0) {
    report.result('PASS', name, 'every adapter, hook list and effort column matches harnesses/capabilities.json');
    return;
  }
  for (const problem of problems) report.result('FAIL', name, problem);
}
