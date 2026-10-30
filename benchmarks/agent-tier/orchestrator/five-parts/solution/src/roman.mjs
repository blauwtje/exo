const NUMERALS = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

export function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new RangeError(`out of range: ${n}`);
  let rest = n;
  let numeral = '';
  for (const [value, letters] of NUMERALS) {
    while (rest >= value) {
      numeral += letters;
      rest -= value;
    }
  }
  return numeral;
}
