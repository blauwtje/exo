const REPAIR_TWICE = 'Then: send a fresh exo:build-task the same Prompt: plus this refusal verbatim, at most twice; a third refusal goes to exo:build-task with exo-kind: hardest.';

export const REFUSAL_HANDLERS = {
  'plan drift': { retry: true, then: 'Then: hand the drift to exo:build-task with exo-kind: hardest to repair the plan or the code; the lead edits neither.' },
  'input unreachable': { retry: false, then: 'Then: stop the run `BLOCKED` with the unreachable input and no repair delegate; no repair session can supply it.' },
  'outside Files': { retry: true, then: REPAIR_TWICE },
  'report missing': { retry: true, then: 'Then: SendMessage this refusal verbatim to the writer once; with no SendMessage, a fresh exo:build-task with the prior result path.' },
  'proof failed': { retry: true, then: REPAIR_TWICE },
  env: { retry: false, then: 'Then: run the readiness CLI for the named service once and rerun; still down ends on BLOCKED <n> ENV with no code edit.' },
  'code rule': { retry: false, then: REPAIR_TWICE },
  refused: { retry: false, then: 'Then: stop; a retry cannot change this refusal, so report it verbatim and send no repair.' },
  landed: { retry: false, then: 'Then: do not land this task again; run next-task for the next task.' },
  pin: { retry: false, then: 'Then: stop; this run is pinned to another task, so report the refusal verbatim, land nothing else and send no repair.' },
  lock: { retry: false, then: 'Then: stop; another land holds the lock past its wait, so report the refusal verbatim and send no repair.' },
  'unfinished merge': { retry: false, then: 'Then: stop; the checkout has an unfinished merge no repair session may touch, so report the refusal verbatim for the user to finish or abort it.' },
  'start stop': { retry: false, then: 'Then: do the Next: action named above, then rerun start-run.' }
};

export function refusalHandler(kind) {
  const row = REFUSAL_HANDLERS[kind];
  if (row === undefined) throw new Error(`no refusal handler for '${kind}'`);
  return row.then;
}

export function isRetryable(kind) {
  refusalHandler(kind);
  return REFUSAL_HANDLERS[kind].retry;
}

export function refusalTail(kind) {
  return `${refusalHandler(kind)}\n${isRetryable(kind) ? 'exo-retry\n' : ''}`;
}
