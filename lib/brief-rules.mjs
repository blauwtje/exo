import { FETCH_UNIT } from './brief-fetches.mjs';
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
    warn: true,
    tools: ['Agent'],
    rule: 'This web research brief has no `Fetches:` line and names no URL',
    brief: null,
    allowed: `add the line \`Fetches: <n>\` with a whole number first, the pages it may fetch; on the reddit route one search.mjs call, so the threads you want divided by the call's --limit (${FETCH_UNIT}), rounded up`
  },
  {
    id: 'brief-invalid',
    warn: true,
    tools: ['Agent'],
    rule: 'This worker brief has an invalid {labels} line',
    brief: null,
    allowed: 'give a whole number'
  },
  {
    id: 'brief-unresolved',
    warn: true,
    tools: ['Agent'],
    rule: 'This worker brief reads {found}',
    brief: null,
    allowed: '{worktree}write `Reads:` as items split by `,` or `;`, each a path, optionally followed by `lines N-M`, `by grep` or a trailing (note) or [note], or `Reads: none`; name only files that exist now and no glob, and an item that does not start with a path is prose and is not read'
  },
  {
    id: 'brief-lacks-reads',
    warn: true,
    tools: ['Agent'],
    rule: 'This worker brief lacks a `Reads:` line',
    brief: null,
    allowed: 'add {reads}. Put one field per line, each label at the start of its line'
  },
  {
    id: 'brief-lacks-fields',
    warn: true,
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
    allowed: 'split the fetches across more agents'
  },
  {
    id: 'brief-cuts-page',
    warn: true,
    tools: ['Agent'],
    rule: 'This research brief tells the worker to cut a fetched page with `head -c`, `head --bytes` or `cut -c`',
    brief: null,
    allowed: 'name the source and the question only, because the worker saves the page whole with `fetch.mjs` and reads it in ranges'
  }
];
