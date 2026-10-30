import { KG_PER_LB } from './units.mjs';

export function label(pounds) {
  return `${(pounds * KG_PER_LB).toFixed(2)} kg`;
}
