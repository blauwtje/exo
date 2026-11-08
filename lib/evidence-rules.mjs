export const WORDING_PATH = /^(?:skills\/[^/]+\/(?:SKILL\.md|references\/[^/]+\.md)|agents\/[^/]+\.md|hooks\/(?:session-routing\.md|session-rules\.md|dispatch-rules\.md)|harnesses\/codex\/host-note\.md)$/;
export const RESULT_VALUE = /^benchmarks\/(?:results|pressure)\/\S+$/;
export const NONE_VALUE = /^none \(\s*\S.*\)$/;

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
