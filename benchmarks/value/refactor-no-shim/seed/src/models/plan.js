import { requireText } from '../util/text.js';

export class PlanRecord {
  constructor({ code, seats = 1, priceCents = 0 }) {
    this.code = requireText(code, 'code');
    this.seats = seats;
    this.priceCents = priceCents;
  }

  static fromRow(row) {
    return new PlanRecord(row);
  }

  get price() {
    return `$${(this.priceCents / 100).toFixed(2)}`;
  }

  toJSON() {
    return { kind: 'plan', code: this.code, seats: this.seats, priceCents: this.priceCents };
  }
}
