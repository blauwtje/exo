export const BRIEF_PATH_RULES = [
  {
    id: 'brief-ambiguous-name',
    tools: ['Agent'],
    rule: 'names that match several tracked files, so give the full path: {matches}',
    brief: null,
    allowed: null
  },
  {
    id: 'brief-missing-path',
    tools: ['Agent'],
    rule: 'paths that do not exist: {names} (searched {searched}; name a pasted image by its full path)',
    brief: null,
    allowed: null
  },
  {
    id: 'brief-worktree',
    warn: true,
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: 'the paths exist under {dir}, so add a `Worktree: {dir}` line, then '
  },
  {
    id: 'brief-reads-label',
    warn: true,
    tools: ['Agent'],
    rule: 'it has `{found}`; rename it to `Reads:`',
    brief: null,
    allowed: null
  },
  {
    id: 'brief-reads-none',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: '`Reads: none`'
  },
  {
    id: 'brief-reads-named',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: '`Reads: {files}` (the files this brief names), or `Reads: none`'
  },
  {
    id: 'brief-reads-any',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: '`Reads: none`, or `Reads:` with the paths the worker must read'
  },
  {
    id: 'brief-range',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: 'to keep {path} in this brief write `Reads: {path} lines 1-{last}` (about {room} tokens), or locate the part with `grep -n <term> {path}` and write `Reads: {path} lines <a>-<b>` for that range; otherwise '
  },
  {
    id: 'brief-over-budget',
    tools: ['Agent'],
    rule: 'This worker brief reads about {tokens} tokens against a budget of {budget}',
    brief: null,
    allowed: '{range}give the largest read its own agent, or cut it: a qualifier is only `lines N-M` or `by grep` right after the path (other words cut nothing), and split the rest by path so each agent\'s `Reads:` stays under {budget} with its own `Result:`'
  }
];
