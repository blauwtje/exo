// Amounts are integer cents, so sums never drift the way floating euros do.
export type Cents = number;

// numerator / denominator rounded to whole cents, a tie to the even cent, so
// a long run of half-cent results does not bias the total upward.
export function divideHalfEven(numerator: number, denominator: number): Cents {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    throw new RangeError(`divideHalfEven needs integers and a positive denominator, got ${numerator}/${denominator}`);
  }
  const quotient = Math.floor(numerator / denominator);
  const twiceRemainder = (numerator - quotient * denominator) * 2;
  if (twiceRemainder > denominator) return quotient + 1;
  if (twiceRemainder < denominator) return quotient;
  return quotient % 2 === 0 ? quotient : quotient + 1;
}

export function sumCents(amounts: readonly Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, 0);
}

// `EUR 1,234.56`, with a leading minus for a credit.
export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const euros = Math.floor(absolute / 100).toLocaleString('en-US');
  const rest = String(absolute % 100).padStart(2, '0');
  return `${sign}EUR ${euros}.${rest}`;
}
