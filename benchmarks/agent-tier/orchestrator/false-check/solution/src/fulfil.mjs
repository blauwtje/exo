import { reserve } from './stock.mjs';

export function fulfil(stock, order) {
  return order.reduce((state, { sku, qty }) => {
    try {
      return { ...state, stock: reserve(state.stock, sku, qty) };
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { ...state, short: [...state.short, sku] };
    }
  }, { stock, short: [] });
}
