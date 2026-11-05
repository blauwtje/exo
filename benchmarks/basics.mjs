import { readFileSync } from 'node:fs';

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export const mean = (values) => sum(values) / values.length;

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
