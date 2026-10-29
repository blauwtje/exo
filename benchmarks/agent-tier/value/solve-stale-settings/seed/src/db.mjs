export function createDb(rows = {}) {
  const table = new Map(Object.entries(rows).map(([id, row]) => [String(id), { ...row }]));
  return {
    reads: 0,
    read(id) {
      this.reads += 1;
      const row = table.get(String(id));
      return row ? { ...row } : null;
    },
    write(id, patch) {
      table.set(String(id), { ...table.get(String(id)), ...patch });
    },
    remove(id) {
      table.delete(String(id));
    }
  };
}
