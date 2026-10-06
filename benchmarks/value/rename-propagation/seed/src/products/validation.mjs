import { badRequest } from '../http/errors.mjs';

export const NAME_MAX = 80;
const CATEGORIES = ['mugs', 'notebooks', 'tea'];

export function validateName(value) {
  if (typeof value !== 'string') throw badRequest('name', 'name must be a string');
  const name = value.trim();
  if (name.length === 0) throw badRequest('name', 'name must not be empty');
  if (name.length > NAME_MAX) throw badRequest('name', `name must be at most ${NAME_MAX} characters`);
  return name;
}

export function validatePrice(value) {
  if (!Number.isInteger(value) || value < 0) throw badRequest('price', 'price must be a non-negative integer in cents');
  return value;
}

export function validateCategory(value) {
  if (!CATEGORIES.includes(value)) throw badRequest('category', `category must be one of ${CATEGORIES.join(', ')}`);
  return value;
}

export function validateStock(value) {
  if (!Number.isInteger(value) || value < 0) throw badRequest('stock', 'stock must be a non-negative integer');
  return value;
}

export function validateStockDelta(value) {
  if (!Number.isInteger(value) || value === 0) throw badRequest('delta', 'delta must be a non-zero integer');
  return value;
}
