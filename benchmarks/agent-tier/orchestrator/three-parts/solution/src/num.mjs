export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function clamp(value, min, max) {
  if (min > max) throw new RangeError(`min ${min} is above max ${max}`);
  return Math.min(Math.max(value, min), max);
}
