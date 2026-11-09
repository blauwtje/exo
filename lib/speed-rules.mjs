export const SPEED_RULES = [
  {
    id: 'sleep',
    tools: ['Bash'],
    rule: 'No sleep polling',
    brief: 'Poll with no sleep: end the turn and wait for the notification. A subagent never sleeps; it returns and the lead waits.',
    allowed: 'interactive: end your turn and wait for the notification; run session: wait-report.mjs with Bash timeout 600000; subagent: return at once and let the lead wait with a background wait-checks call'
  },
  {
    id: 'suite',
    tools: ['Bash'],
    rule: null,
    brief: 'Run the Proof: and Checks: proof|final tiers once; a whole suite only in a final worker. A round is fix, proof, review of the fix diff; cap `Round: n/3`; at the cap run the final tier, report what still fails and stop. A brief gives scope, Files:, Proof:, Checks:, Reads:, Result:, and points to the spec or handover by path:range.',
    allowed: null
  },
  {
    id: 'watch',
    tools: ['Bash'],
    rule: null,
    brief: 'Run no `gh pr checks --watch`: return and let the lead wait with background wait-checks.',
    allowed: null
  },
  {
    id: 'suite-passed',
    tools: ['Bash'],
    rule: 'A whole suite that already passed on this tree is not rerun',
    allowed: 'read the earlier result of the passed run'
  }
];
