const thousands = (tokens) => Math.round(tokens / 1000);

export function cacheLines({ cacheRead, cacheWrite, firstCacheWrite }, bar) {
  const lines = [];
  if (cacheRead !== null && cacheWrite !== null && cacheRead + cacheWrite > 0) lines.push(`cache read ${Math.round((cacheRead / (cacheRead + cacheWrite)) * 100)}% (${thousands(cacheRead)}k read, ${thousands(cacheWrite)}k written)`);
  if (firstCacheWrite !== null && firstCacheWrite > bar) lines.push(`warning: turn 1 wrote ${thousands(firstCacheWrite)}k tokens to the cache, over the ${thousands(bar)}k bar`);
  return lines;
}

export function cacheFields(parsed) {
  const { cacheRead, cacheWrite, firstCacheWrite, inputTokens } = parsed;
  return { cacheRead, cacheWrite, firstCacheWrite, inputTokens };
}

export function cacheTokenText(records) {
  if (!records.some((record) => typeof record.cacheRead === 'number')) return '';
  const total = (read) => records.reduce((sum, record) => sum + (read(record) ?? 0), 0);
  const hit = total((record) => record.cacheRead);
  const miss = total((record) => (record.inputTokens ?? 0) + (record.cacheWrite ?? 0));
  return `, cacheHitTokens ${hit}, cacheMissTokens ${miss}`;
}
