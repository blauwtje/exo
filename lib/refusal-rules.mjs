import { BRIEF_PATH_RULES } from './brief-path-rules.mjs';
const RULES = [
  {
    id: 'orchestrator-reads',
    tools: ['Read'],
    rule: 'Before its first dispatch an orchestrator reads only its brief\'s Reads: paths ({named}), the handover template and, in a forked skill, its own .exo/<skill>/ run folder',
    brief: null,
    allowed: 'write the result file and dispatch now; give this file to a lookup worker'
  },
  {
    id: 'orchestrator-budget',
    tools: ['Read', 'Bash'],
    rule: 'This orchestrator has made {limit} Reads or Bash calls before its first dispatch',
    brief: null,
    allowed: 'write the result file and dispatch now; split the remaining reading and row checks across lookup workers'
  },
  {
    id: 'reddit-route',
    tools: ['WebFetch', 'Bash'],
    rule: 'Reddit blocks this call',
    brief: null,
    allowed: 'run node {script} --source reddit --query <text> --run <run-dir>; for a thread run search.mjs --url <thread-url>'
  },
  {
    id: 'repeat-refusal',
    tools: null,
    rule: 'This call was refused once already, so repeating it fails again',
    brief: null,
    allowed: 'follow the first refusal: {first}'
  },
  {
    id: 'repeat-stop',
    tools: null,
    rule: 'This call was refused twice already',
    brief: null,
    allowed: 'stop it and record the gap'
  },
  ...BRIEF_PATH_RULES
];

export const REFUSAL_RULES = RULES.map((entry) => ({
  ...entry,
  violation: (context) => (context?.violated?.includes(entry.id) ? entry.rule : null)
}));

export function allViolations(checks, context) {
  return checks
    .map((check) => ({ id: check.id, text: check.violation(context) }))
    .filter((found) => found.text !== null);
}
