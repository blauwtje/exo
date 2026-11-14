import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_ROOTS = ['skills', 'lib', 'hooks', 'agents'];
const COUNTED = '(?:retr(?:y|ies)|rounds?|attempts?|reruns?|repair)';
const BOUND = '(?:max|cap|limit|bound)';
const CAP_NAME = `\\w*(?:${COUNTED}\\w*${BOUND}|${BOUND}\\w*${COUNTED}|retries|reruns?)\\w*`;
const CAP_LITERAL = new RegExp(`\\b(?:const|let)\\s+(${CAP_NAME})\\s*=\\s*\\d+\\b`, 'gi');
const RULE_CHAIN = /\w+(?:Fields|Denial|Refusal|Violation)s?\([^()]*\)\s*\?\?\s*\w+(?:Fields|Denial|Refusal|Violation)s?\(/;
const RERUN_PROSE = /\b(?:rerun|re-run|retry|rewrite)\b[^.\n]{0,40}\b(?:once|twice|\d+ times)\b|\bat most (?:one|two|three|\d+) (?:round|retry|retries|rerun|attempt)|\bup to (?:two|three|\d+) (?:rounds|retries|attempts)|\bRound: n\/\d/i;
const POLL_PROSE = /\b(?:poll(?:s|ing)?\b|sleep[- ]loop|check again (?:every|until)|keep (?:checking|waiting)|wait in a loop)/i;
const POLL_FORBIDDEN = /\b(?:no|not|never|nothing|without)\b[^.\n]{0,40}poll|polling loop|poll\w*\b[^.\n]{0,20}\b(?:nothing|never)/i;
const WAIT_HELPER = 'lib/loop-budget.mjs';
const SLEEP_CALL = /setInterval\(|setTimeout\(|Atomics\.wait\(|\bsleep\(|\bdelay\(/;
const PROBE_CALL = /existsSync\(|statSync\(|accessSync\(|process\.kill\([^)]*,\s*0\)|readFileSync\(|\bpgrep\b/;
const LOOP_HEAD = /\b(?:while|for)\s*\(|\bdo\s*\{|setInterval\(/;
const LOOP_WINDOW = 12;
const CAPPED_AT_TWO = ['fix'];

function kindNames(kinds) {
  return Object.keys(kinds);
}

function namesKind(line, names) {
  return names.some((name) => line.includes(`\`${name}\``) || line.includes(`kind ${name}`));
}

function pollsOutsideBudget(text) {
  const lines = text.split('\n');
  return lines.some((line, index) => {
    if (!LOOP_HEAD.test(line)) return false;
    const body = lines.slice(index, index + LOOP_WINDOW).join('\n');
    return SLEEP_CALL.test(body) && PROBE_CALL.test(body);
  });
}

function scriptFindings(repository) {
  const findings = [];
  const scripts = repository.trackedFiles().filter((file) => {
    const relative = repository.relative(file);
    return file.endsWith('.mjs') && SCRIPT_ROOTS.some((root) => relative.startsWith(`${root}/`));
  });
  for (const file of scripts) {
    const relative = repository.relative(file);
    const text = repository.text(file);
    if (relative !== WAIT_HELPER && pollsOutsideBudget(text)) findings.push(`${relative}: sleep or interval poll loop outside ${WAIT_HELPER}`);
    if ([...text.matchAll(CAP_LITERAL)].some((match) => !/_?ms$/i.test(match[1]))) findings.push(`${relative}: numeric cap literal outside lib/loop-kinds.json`);
    if (RULE_CHAIN.test(text)) findings.push(`${relative}: refusing rules chained with ?? return only the first violation`);
  }
  return findings;
}

function proseFindings(repository, names) {
  const skipped = (file) => repository.relative(file).startsWith('skills/write-docs/');
  const findings = [];
  const files = new Set([...repository.processFiles(), ...repository.promptFiles(), ...repository.agentFiles(), ...repository.everySkillFile()]);
  for (const file of files) {
    if (skipped(file)) continue;
    const lines = repository.text(file).split('\n');
    lines.forEach((line, index) => {
      if (POLL_PROSE.test(line) && !POLL_FORBIDDEN.test(line) && !namesKind(line, names)) findings.push(`${repository.relative(file)}:${index + 1}: prose tells an agent to poll or rerun a wait`);
      if (!RERUN_PROSE.test(line) || namesKind(line, names)) return;
      findings.push(`${repository.relative(file)}:${index + 1}: rerun or round count names no loop kind`);
    });
  }
  return findings;
}

function readsKind(ownerText, name) {
  const call = new RegExp(`\\b(?:roundCap|decide|budgetDecision|recordRound|kindWallMs)\\([^)]*['"]${name}['"]|kind:\\s*['"]${name}['"]`);
  return call.test(ownerText);
}

function kindFindings(repository, kinds) {
  const findings = [];
  const tests = repository.trackedFiles().filter((file) => /^tests\/.*\.test\.mjs$/.test(repository.relative(file)));
  for (const name of CAPPED_AT_TWO) {
    if (kinds[name] && kinds[name].cap !== 2) findings.push(`loop kind ${name}: cap must be 2`);
  }
  for (const [name, entry] of Object.entries(kinds)) {
    const owner = path.join(repository.root, entry.owner);
    if (!fs.existsSync(owner)) {
      findings.push(`loop kind ${name}: owner ${entry.owner} does not exist`);
      continue;
    }
    if (!readsKind(repository.text(owner), name)) findings.push(`loop kind ${name}: owner ${entry.owner} never reads it through the loop budget`);
    const base = path.basename(entry.owner, '.mjs');
    const named = tests.some((file) => {
      const text = repository.text(file);
      return (file.includes(base) || text.includes(base)) && (text.includes(`'${name}'`) || text.includes(`"${name}"`));
    });
    if (!named) findings.push(`loop kind ${name}: no test of ${entry.owner} names it`);
  }
  return findings;
}

export function checkLoopKinds(report, repository) {
  const kindsFile = path.join(repository.root, 'lib', 'loop-kinds.json');
  if (!fs.existsSync(kindsFile)) {
    report.assert(false, 'loop kinds', 'every loop cap lives in lib/loop-kinds.json', 'lib/loop-kinds.json is missing');
    return;
  }
  const kinds = JSON.parse(repository.text(kindsFile));
  const names = kindNames(kinds);
  const errors = [...scriptFindings(repository), ...proseFindings(repository, names), ...kindFindings(repository, kinds)];
  report.assert(
    errors.length === 0,
    'loop kinds',
    'every loop cap lives in lib/loop-kinds.json and every kind has a consumer and a test',
    errors.join('; ')
  );
}
