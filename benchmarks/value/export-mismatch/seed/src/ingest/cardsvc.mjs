const SIGN = { charge: 1, refund: -1 };
const STATUS = { succeeded: 'settled', pending: 'pending', failed: 'failed' };

// One JSON event per line; amounts are positive minor units and the type says
// which way the money moved.
export function parseCardsvc(text) {
  return text.split('\n').filter((line) => line.trim() !== '').map((line) => {
    const event = JSON.parse(line);
    if (!(event.type in SIGN) || !(event.status in STATUS)) throw new Error(`unknown cardsvc event: ${line}`);
    return {
      source: 'cardsvc',
      id: String(event.id),
      customerId: event.account,
      amountMinor: SIGN[event.type] * event.amount,
      currency: event.currency,
      status: STATUS[event.status],
      bookedAt: event.created
    };
  });
}
