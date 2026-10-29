export function parseDate(text) {
  const [day, month, year] = text.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
