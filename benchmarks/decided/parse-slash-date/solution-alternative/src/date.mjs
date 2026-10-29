export function parseDate(text) {
  const [month, day, year] = text.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
