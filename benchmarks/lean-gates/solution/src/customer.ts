export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly taxExempt: boolean;
  // Days after the order date the invoice falls due, 0 to 120.
  readonly paymentTermsDays: number;
}

export function createCustomer(fields: Customer): Customer {
  const days = fields.paymentTermsDays;
  if (!Number.isInteger(days) || days < 0 || days > 120) {
    throw new RangeError(`customer ${fields.id} has invalid payment terms ${days}`);
  }
  return { ...fields };
}

// The ISO date an invoice for an order placed on placedOn falls due.
export function dueDate(placedOn: string, customer: Customer): string {
  const date = new Date(`${placedOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid date ${placedOn}`);
  date.setUTCDate(date.getUTCDate() + customer.paymentTermsDays);
  return date.toISOString().slice(0, 10);
}
