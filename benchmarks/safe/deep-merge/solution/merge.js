const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (BLOCKED.has(key)) continue;
    const incoming = source[key];
    if (isPlain(incoming) && isPlain(target[key]) && Object.hasOwn(target, key)) deepMerge(target[key], incoming);
    else target[key] = isPlain(incoming) ? deepMerge({}, incoming) : incoming;
  }
  return target;
}
