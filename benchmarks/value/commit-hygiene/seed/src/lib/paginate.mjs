/**
 * Split a list into pages. Pages are numbered from 1.
 *
 * @param {Array} items everything to page through
 * @param {number} page the 1-based page to return
 * @param {number} pageSize entries per page
 * @returns {{ items: Array, page: number, pageSize: number, totalPages: number, hasNext: boolean }}
 */
export function paginate(items, page = 1, pageSize = 10) {
  const totalPages = Math.floor(items.length / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
  };
}
