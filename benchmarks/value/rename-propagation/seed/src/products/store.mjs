const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function createProductStore(records, now) {
  const products = new Map(records.map((record) => [record.id, { ...record }]));
  let sequence = Math.max(0, ...records.map((record) => Number(record.id.slice(1))));

  return {
    all: () => [...products.values()].map((product) => ({ ...product })),
    get: (id) => (products.has(id) ? { ...products.get(id) } : null),
    byCategory: (category) => [...products.values()].filter((product) => product.category === category).map((product) => ({ ...product })),
    findByName(name) {
      for (const product of products.values()) {
        if (sameName(product.name, name)) return { ...product };
      }
      return null;
    },
    insert(fields) {
      sequence += 1;
      const product = { id: `p${sequence}`, ...fields, updatedAt: now() };
      products.set(product.id, product);
      return { ...product };
    },
    update(id, patch) {
      const current = products.get(id);
      if (!current) return null;
      Object.assign(current, patch, { updatedAt: now() });
      return { ...current };
    },
  };
}
