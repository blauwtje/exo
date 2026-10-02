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

// Splits totalCents over parts in proportion to weights by largest remainder:
// floored shares, then one cent each to the largest remainders, the earlier
// part first on a tie. All-zero weights split evenly. The shares sum to total.
export function allocateCents(totalCents: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) throw new RangeError('allocateCents needs at least one weight');
  if (weights.some((weight) => weight < 0)) throw new RangeError('allocateCents needs non-negative weights');
  const even = weights.every((weight) => weight === 0);
  const effective = even ? weights.map(() => 1) : weights;
  const weightSum = effective.reduce((total, weight) => total + weight, 0);
  const exact = effective.map((weight) => (totalCents * weight) / weightSum);
  const shares = exact.map((share) => Math.floor(share));
  const order = exact
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  let left = totalCents - sumCents(shares);
  for (const { index } of order) {
    if (left === 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}
