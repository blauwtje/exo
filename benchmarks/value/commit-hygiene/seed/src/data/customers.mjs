const FIRST = ['Ada', 'Brian', 'Chen', 'Dara', 'Elif', 'Femi', 'Gita', 'Hugo'];

// 23 deterministic customers: ids 1..23, every name ends in "Lopez" or "Okafor".
export const CUSTOMERS = Array.from({ length: 23 }, (_, i) => ({
  id: i + 1,
  name: `${FIRST[i % FIRST.length]} ${i % 2 === 0 ? 'Lopez' : 'Okafor'}`,
}));
