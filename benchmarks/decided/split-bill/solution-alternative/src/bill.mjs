export function splitBill(totalCents, people) {
  const base = Math.floor(totalCents / people);
  const extra = totalCents - base * people;
  return Array.from({ length: people }, (_, index) => base + (index >= people - extra ? 1 : 0));
}
