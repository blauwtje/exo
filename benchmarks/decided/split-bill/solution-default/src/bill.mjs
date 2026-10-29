export function splitBill(totalCents, people) {
  const base = Math.floor(totalCents / people);
  const extra = totalCents - base * people;
  return Array.from({ length: people }, (_, index) => base + (index < extra ? 1 : 0));
}
