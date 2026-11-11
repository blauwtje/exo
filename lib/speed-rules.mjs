import { contractRow } from '../harnesses/coordination-contract.mjs';

const WAIT_PHRASES = {
  notification: 'end your turn and wait for the notification',
  foreground: 'send the work in a foreground Agent call, or start a background shell'
};

function waitAllowed() {
  const interactive = WAIT_PHRASES[contractRow('claude', 'main').wait];
  const runSession = WAIT_PHRASES[contractRow('claude', 'run-session').wait];
  return `interactive: ${interactive}; run session: ${runSession}; subagent: start the long command in the background, end the turn, and write the final result only after all your own shells have ended`;
}

export const SPEED_RULES = [
  {
    id: 'sleep',
    tools: ['Bash'],
    rule: 'No sleep polling',
    brief: null,
    allowed: waitAllowed()
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
    rule: 'A subagent does not poll checks',
    brief: 'Run no `gh pr checks --watch`: return and let the lead wait with background wait-checks.',
    allowed: 'return and let the lead wait with background wait-checks'
  },
  {
    id: 'suite-passed',
    warn: true,
    tools: ['Bash'],
    rule: 'A whole suite that already passed on this tree is not rerun',
    allowed: 'read the earlier result of the passed run'
  }
];
