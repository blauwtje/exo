export function paginate(items, page) {
  return items.slice((page - 1) * 10, page * 10);
}
