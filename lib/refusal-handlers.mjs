const REPAIR_TWICE = 'Then: send a fresh exo:build-task the same Prompt: plus this refusal verbatim, at most twice; a third refusal goes to exo:solve-hard.';

export const REFUSAL_HANDLERS = {
  'plan drift': 'Then: hand the drift to exo:solve-hard to repair the plan or the code; the lead edits neither.',
  'input unreachable': 'Then: stop the run `BLOCKED` with the unreachable input and no repair delegate; no repair session can supply it.',
  'outside Files': REPAIR_TWICE,
  'report missing': 'Then: SendMessage this refusal verbatim to the writer once; with no SendMessage, a fresh exo:build-task with the prior result path.',
  'proof failed': REPAIR_TWICE,
  env: 'Then: run the readiness CLI for the named service once and rerun; still down ends on BLOCKED <n> ENV with no code edit.',
  'code rule': REPAIR_TWICE,
  'start stop': 'Then: do the Next: action named above, then rerun start-run.'
};

export function refusalHandler(kind) {
  const line = REFUSAL_HANDLERS[kind];
  if (line === undefined) throw new Error(`no refusal handler for '${kind}'`);
  return line;
}
