export const WORDING_PATH = /^(?:skills\/[^/]+\/(?:SKILL\.md|references\/[^/]+\.md)|agents\/[^/]+\.md|hooks\/(?:session-routing\.md|session-rules\.md|dispatch-rules\.md)|harnesses\/codex\/host-note\.md)$/;
export const RESULT_VALUE = /^benchmarks\/(?:results|pressure)\/\S+$/;
export const NONE_VALUE = /^none \(\s*\S.*\)$/;

export function isEvidenceValue(value) {
  return RESULT_VALUE.test(value) || NONE_VALUE.test(value);
}
