// Data, not code: API list prices in USD per million tokens per model family,
// keyed like the usage counts in token-weights.mjs. A model id prices as the
// longest family it starts with, so a dated id such as
// claude-haiku-4-5-20251001 prices as claude-haiku-4-5; an unlisted model is
// unpriced. A subscription is not billed this way: the figure is what the same
// tokens cost on the API.
export default {
  source: 'platform.claude.com/docs/en/about-claude/pricing, read 2026-09-11',
  models: {
    'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cache5m: 12.5, cache1h: 20 },
    'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cache5m: 6.25, cache1h: 10 },
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cache5m: 6.25, cache1h: 10 },
    'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cache5m: 2.5, cache1h: 4 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cache5m: 3.75, cache1h: 6 },
    'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cache5m: 1.25, cache1h: 2 }
  }
};
