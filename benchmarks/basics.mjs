import { readFileSync } from 'node:fs';

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export const mean = (values) => sum(values) / values.length;

export const meanOrNull = (values) => (values.length === 0 ? null : mean(values));

export const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export const readJsonOrNull = (file) => {
  try {
    return readJson(file);
  } catch {
    return null;
  }
};
