export function titleCase(text) {
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
