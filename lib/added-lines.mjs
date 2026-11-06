function lineCounts(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

function take(counts, line) {
  const left = counts.get(line) ?? 0;
  if (left === 0) return false;
  counts.set(line, left - 1);
  return true;
}

function commonPrefix(before, after) {
  let length = 0;
  while (length < before.length && length < after.length && before[length] === after[length]) length++;
  return length;
}

function commonSuffix(before, after, prefix) {
  let length = 0;
  while (length < before.length - prefix && length < after.length - prefix && before.at(-1 - length) === after.at(-1 - length)) length++;
  return length;
}

export function addedLineNumbers(beforeText, afterText) {
  const before = beforeText.split('\n');
  const after = afterText.split('\n');
  const prefix = commonPrefix(before, after);
  const suffix = commonSuffix(before, after, prefix);
  const unmatched = lineCounts(before.slice(prefix, before.length - suffix));
  const added = new Set();
  for (let index = prefix; index < after.length - suffix; index++) {
    if (!take(unmatched, after[index])) added.add(index + 1);
  }
  return added;
}
