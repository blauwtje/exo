export const BRIEF_RULES = [
  {
    id: 'research-unnamed',
    tools: ['Agent'],
    rule: 'This agent would run web research outside the research route',
    brief: null,
    allowed: 'use `exo:research-worker` for one part, or one `exo:orchestrator` with `Workers: <n>` for two or more'
  },
  {
    id: 'research-fanout',
    tools: ['Agent'],
    rule: 'A web research dispatch was already sent from this session a moment ago',
    brief: null,
    allowed: 'send the remaining research parts to one `exo:orchestrator` with `Workers: <n>`'
  },
  {
    id: 'brief-lacks-fetches',
    tools: ['Agent'],
    rule: 'This web research brief has no `Fetches:` line and names no URL',
    brief: null,
    allowed: 'add `Fetches: <n>`, the number of pages it may fetch'
  },
  {
    id: 'brief-invalid',
    tools: ['Agent'],
    rule: 'This worker brief has an invalid {labels} line',
    brief: null,
    allowed: 'give a whole number'
  },
  {
    id: 'brief-unresolved',
    tools: ['Agent'],
    rule: 'This worker brief reads {found}',
    brief: null,
    allowed: '{worktree}write `Reads:` as items split by `,` or `;`, each a path, optionally followed by `lines N-M` or `by grep`, or `Reads: none`; an item that does not start with a path is prose and is not read'
  },
  {
    id: 'brief-lacks-reads',
    tools: ['Agent'],
    rule: 'This worker brief lacks a `Reads:` line',
    brief: null,
    allowed: 'add {reads}. Put one field per line, each label at the start of its line'
  },
  {
    id: 'brief-lacks-fields',
    tools: ['Agent'],
    rule: 'This worker brief lacks {missing}',
    brief: null,
    allowed: 'add {reads}a `Result:` line naming one `.exo/<...>.md` file. Put one field per line, each label at the start of its line'
  },
  {
    id: 'brief-over-fetches',
    tools: ['Agent'],
    rule: 'This worker brief reads about {tokens} tokens against a budget of {budget}',
    brief: null,
    allowed: 'lower the `Fetches:` count or split the fetches across more agents'
  }
];
