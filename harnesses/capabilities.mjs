import fs from 'node:fs';

const FILE = new URL('./capabilities.json', import.meta.url);

export function readCapabilities(file = FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function harnessNames(file = FILE) {
  return Object.keys(readCapabilities(file));
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function nameProblems(capabilities, adapterNames) {
  const rows = Object.keys(capabilities);
  const missingRows = adapterNames.filter((name) => !rows.includes(name));
  const missingAdapters = rows.filter((name) => !adapterNames.includes(name));
  return [
    ...missingRows.map((name) => `adapter ${name} has no capabilities row`),
    ...missingAdapters.map((name) => `capabilities row ${name} has no adapter`)
  ];
}

function hookProblems(capabilities, served) {
  return Object.entries(served).flatMap(([name, events]) => {
    const row = capabilities[name];
    if (row === undefined || sameSet(row.hooks, events)) return [];
    return [`${name} serves hooks ${events.join(', ')} but its row lists ${row.hooks.join(', ')}`];
  });
}

function effortProblems(capabilities, providers) {
  return Object.entries(providers).flatMap(([name, provider]) => {
    const row = capabilities[name];
    if (row === undefined) return [];
    return Object.values(provider.efforts ?? {})
      .filter((effort) => !row.efforts.includes(effort))
      .map((effort) => `provider ${name} maps to effort ${effort} that its row lacks`);
  });
}

export function findCapabilityProblems({ capabilities, adapterNames, served, providers }) {
  return [
    ...nameProblems(capabilities, adapterNames),
    ...hookProblems(capabilities, served),
    ...effortProblems(capabilities, providers)
  ];
}
