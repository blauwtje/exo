export async function mapItems({ items, run, capUsd }) {
  const results = [];
  let spentUsd = 0;
  for (const item of items) {
    if (spentUsd >= capUsd) return { results, spentUsd, stopped: true, remaining: items.length - results.length };
    const outcome = await run(item);
    if (!Number.isFinite(outcome.costUsd)) throw new TypeError(`run must return a finite costUsd, got ${outcome.costUsd}`);
    spentUsd += outcome.costUsd;
    results.push(outcome.value);
  }
  return { results, spentUsd, stopped: false, remaining: 0 };
}
