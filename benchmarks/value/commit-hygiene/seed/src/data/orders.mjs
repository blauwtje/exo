const STATUSES = ['open', 'shipped', 'cancelled'];

// 47 deterministic orders: ids 1..47, status cycling open, shipped, cancelled.
export const ORDERS = Array.from({ length: 47 }, (_, i) => ({
  id: i + 1,
  customerId: (i % 23) + 1,
  status: STATUSES[i % STATUSES.length],
  totalCents: 1500 + i * 275,
}));
