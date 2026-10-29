const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const pad = (value) => String(value).padStart(2, '0');

export const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export function daysInMonth(year, month) {
  if (month === 2 && isLeap(year)) return 29;
  return DAYS[month - 1];
}

export function monthRange(month) {
  const [year, number] = month.split('-').map(Number);
  return { from: `${year}-${pad(number)}-01`, to: `${year}-${pad(number)}-${pad(daysInMonth(year, number))}` };
}

export function inRange(timestamp, from, to) {
  const day = timestamp.slice(0, 10);
  return day >= from && day <= to;
}
