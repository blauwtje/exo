export const LIST_PREFIX = 'products:list:';
export const SEARCH_PREFIX = 'search:';

export const productKey = (id) => `product:${id}`;
export const listKey = (category) => `${LIST_PREFIX}${category ?? 'all'}`;
export const searchKey = (q) => `${SEARCH_PREFIX}${q.toLowerCase()}`;
