const formatters = new Map();

// The calendar date (YYYY-MM-DD) an instant falls on in an IANA time zone.
export function localDate(instant, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(instant));
}

export function isMonth(text) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}
