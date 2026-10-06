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
  return { customers: result.items, page: result.page, pages: result.totalPages, total: matches.length };
}
