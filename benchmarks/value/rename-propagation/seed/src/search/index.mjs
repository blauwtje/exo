import { tokenize } from './tokenize.mjs';

export function toSearchDoc(product) {
  return { id: product.id, name: product.name, category: product.category, price: product.price, inStock: product.stock > 0 };
}

// Inverted index over name and category. Callers keep it current with upsert
// and remove; it never reads the product store itself.
export function createSearchIndex() {
  const docs = new Map();
  const postings = new Map();
  const tokensOf = new Map();

  function unlink(id) {
    for (const token of tokensOf.get(id) ?? []) {
      const ids = postings.get(token);
      ids.delete(id);
      if (ids.size === 0) postings.delete(token);
    }
    tokensOf.delete(id);
  }

  return {
    upsert(doc) {
      unlink(doc.id);
      const tokens = [...new Set(tokenize(`${doc.name} ${doc.category}`))];
      docs.set(doc.id, { ...doc });
      tokensOf.set(doc.id, tokens);
      for (const token of tokens) {
        if (!postings.has(token)) postings.set(token, new Set());
        postings.get(token).add(doc.id);
      }
    },
    remove(id) {
      unlink(id);
      docs.delete(id);
    },
    query(text) {
      const terms = tokenize(text);
      if (terms.length === 0) return [];
      let ids = null;
      terms.forEach((term, position) => {
        const isLast = position === terms.length - 1;
        const matches = new Set();
        for (const [token, set] of postings) {
          if (token === term || (isLast && token.startsWith(term))) for (const id of set) matches.add(id);
        }
        ids = ids === null ? matches : new Set([...ids].filter((id) => matches.has(id)));
      });
      return [...ids].map((id) => ({ ...docs.get(id) })).sort((a, b) => a.name.localeCompare(b.name));
    },
    size: () => docs.size,
  };
}
