import { KG_PER_LB, toLb } from './units.mjs';

export function label(pounds) {
  return `${(pounds * KG_PER_LB).toFixed(2)} kg`;
}

export function lbLabel(kilograms) {
  return `${toLb(kilograms).toFixed(1)} lb`;
}
