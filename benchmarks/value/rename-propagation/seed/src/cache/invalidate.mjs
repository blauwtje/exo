import { LIST_PREFIX, SEARCH_PREFIX, productKey } from './keys.mjs';

// Every cached list and search result may carry any product, so they all go.
export function invalidateListings(cache) {
  cache.deletePrefix(LIST_PREFIX);
  cache.deletePrefix(SEARCH_PREFIX);
}

export function invalidateProduct(cache, id) {
  cache.delete(productKey(id));
  invalidateListings(cache);
}
