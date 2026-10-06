export function createWishlistStore(records) {
  const lists = new Map(records.map((list) => [list.userId, structuredClone(list.items)]));

  return {
    get: (userId) => structuredClone(lists.get(userId) ?? []),
    add(userId, item) {
      const items = lists.get(userId) ?? [];
      if (!items.some((candidate) => candidate.productId === item.productId)) items.push({ ...item });
      lists.set(userId, items);
      return structuredClone(items);
    },
    renameProduct(productId, name) {
      for (const items of lists.values()) {
        for (const item of items) {
          if (item.productId === productId) item.name = name;
        }
      }
    },
    remove(userId, productId) {
      const items = (lists.get(userId) ?? []).filter((item) => item.productId !== productId);
      lists.set(userId, items);
      return structuredClone(items);
    },
  };
}
