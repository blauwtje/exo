// Tags by how many tasks carry them, most used first, ties by name.
export function tagCounts(store) {
  const counts = new Map();
  for (const task of store.list()) {
    for (const tag of task.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function tasksWithTag(store, tag) {
  return store.list().filter((task) => task.tags.includes(tag));
}
