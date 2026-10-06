export class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class CouponError extends OrderError {}
export class RefundError extends OrderError {}
export class QuoteError extends OrderError {}
