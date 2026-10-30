export const KG_PER_LB = 0.45359237;

export function toKg(pounds) {
  return pounds * KG_PER_LB;
}

export function toLb(kilograms) {
  return kilograms / KG_PER_LB;
}
