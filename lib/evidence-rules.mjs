export const WORDING_PATH = /^(?:skills\/[^/]+\/(?:SKILL\.md|references\/[^/]+\.md)|agents\/[^/]+\.md|hooks\/(?:session-routing\.md|session-rules\.md|dispatch-rules\.md)|harnesses\/codex\/host-note\.md)$/;
const RESULT_VALUE = /^benchmarks\/(?:results|pressure)\/\S+$/;
const NONE_VALUE = /^none \(\s*\S.*\)$/;

export function isEvidenceValue(value) {
  return RESULT_VALUE.test(value) || NONE_VALUE.test(value);
}

export function badTrailer(value, results) {
  if (NONE_VALUE.test(value)) return '';
  if (!RESULT_VALUE.test(value)) return 'names neither a benchmarks/results or benchmarks/pressure file nor `none (<reason>)`; a command result goes in a `Proof: <command> → <result>` line';
  if (results === null) return '';
  return results.has(value) ? '' : 'names a file not added or changed in this range';
}

export function evidenceProblem(message) {
  for (const match of message.matchAll(/^Evidence:[ \t]*(.*)$/gm)) {
    const why = badTrailer(match[1].trim(), null);
    if (why !== '') return `Evidence: ${match[1].trim() || '(empty)'} ${why}`;
  }
  return null;
}

const FIGURE = /\$\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s?(?:s|sec|seconds|ms|tokens|cells|runs)\b/i;
const SOURCE = /`[^`]+`|\b[\w.-]+\/[\w./-]+|\b[\w-]+\.(?:mjs|md|json|log|jsonl)\b/;

export function unsourcedFigures(report) {
  return report
    .split('\n')
    .filter((line) => FIGURE.test(line) && !SOURCE.test(line))
    .map((line) => line.trim());
}

export const EVIDENCE_RULES = [
  {
    id: 'commit-attribution',
    harm: 'a commit with AI attribution leaves the machine under the user\'s name',
    tools: ['Bash'],
    rule: 'A commit message must not attribute the work to an AI',
    brief: 'A commit message, given by -m, -F file or heredoc, carries no Co-Authored-By trailer, "Generated with" line or tool name.',
    allowed: 'write the message without them to a file in an earlier call, then run `git commit -F <file>` or pass `-m`'
  },
  {
    id: 'commit-evidence',
    tools: ['Bash'],
    rule: 'A commit message Evidence line must name a result file or none with a reason: {problem}',
    allowed: 'write the message in an earlier call with `Evidence: benchmarks/results/<file>` or `Evidence: none (<reason>)`, then run `git commit -F <file>` or pass `-m`; a command result goes in a `Proof:` line'
  }
];
