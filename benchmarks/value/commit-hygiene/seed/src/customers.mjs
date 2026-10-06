import { CUSTOMERS } from './data/customers.mjs';
import { paginate } from './lib/paginate.mjs';

/**
 * Search customers by name. `pages` is the page count the dashboard renders in its
 * pager, so it must match what the list actually needs.
 */
export function searchCustomers(query, { page = 1, pageSize = 10 } = {}) {
  const needle = query.trim().toLowerCase();
  const matches = CUSTOMERS.filter((customer) => customer.name.toLowerCase().includes(needle));
  const result = paginate(matches, page, pageSize);
  // paginate drops a partial last page, so add it back
  const pages = result.totalPages + (matches.length % pageSize === 0 ? 0 : 1);
  return { customers: result.items, page: result.page, pages, total: matches.length };
}
