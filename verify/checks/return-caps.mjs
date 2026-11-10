// A delegate's report lands whole in the session that dispatched it, so every
// delegate prompt states the most lines its report may run to.

import fs from 'node:fs';

const RETURN_CAP = /\bat most (\d+|[a-z]+) lines\b/i;

// The lines a delegate's report may run to: the prompt's stated cap, or null
// when it states none in digits.
export function reportCap(promptText) {
  const cap = Number(RETURN_CAP.exec(promptText)?.[1]);
  return Number.isInteger(cap) ? cap : null;
}

const CONTRACT = 'harnesses/coordination-contract.json';
const CONTRACT_POINTER = "the contract's return cap";

function contractCaps(repository) {
  const file = repository.join(CONTRACT);
  if (!fs.existsSync(file)) return false;
  return /"maxLines":\s*\d+/.test(repository.text(file));
}

function capped(text, repository) {
  if (RETURN_CAP.test(text)) return true;
  return text.includes(CONTRACT_POINTER) && contractCaps(repository);
}

export function checkReturnCaps(report, repository) {
  const uncapped = [...repository.promptFiles(), ...repository.agentFiles()]
    .filter((file) => !capped(repository.text(file), repository))
    .map((file) => repository.relative(file));
  report.assert(
    uncapped.length === 0,
    'delegate return caps',
    'every delegate prompt and agent caps its report in lines',
    `no 'at most <n> lines' cap in ${uncapped.join(', ')}`
  );
}
