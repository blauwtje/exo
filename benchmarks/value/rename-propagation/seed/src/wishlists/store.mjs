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
    remove(userId, productId) {
      const items = (lists.get(userId) ?? []).filter((item) => item.productId !== productId);
      lists.set(userId, items);
      return structuredClone(items);
    },
  };
}
