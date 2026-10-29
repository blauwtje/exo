export function paginate(items, page) {
  return items.slice(page * 10, (page + 1) * 10);
}
