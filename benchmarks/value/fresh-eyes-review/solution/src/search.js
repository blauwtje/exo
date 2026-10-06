// Case-insensitive substring match over a task's title and tags.
export function search(store, query) {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const hits = [];
  for (const task of store.list()) {
    const haystack = [task.title, ...task.tags].join('\n').toLowerCase();
    if (haystack.includes(needle)) hits.push({ ...task });
  }
  return hits.sort((a, b) => a.id - b.id);
}
