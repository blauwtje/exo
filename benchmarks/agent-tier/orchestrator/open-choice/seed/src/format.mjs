export function padCents(cents) {
  return String(Math.abs(cents) % 100).padStart(2, '0');
}
