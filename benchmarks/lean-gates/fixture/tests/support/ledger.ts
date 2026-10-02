// A stand-in for the accounting ledger invoices post to. Every post waits out
// a fixed round trip, as the real store's network write does, so a property
// test that posts each generated case runs as long as it would against it.
import { setTimeout as sleep } from 'node:timers/promises';
import type { Cents } from '../../src/money.ts';

export const ROUND_TRIP_MS = 40;
// How many generated cases each property test posts.
export const PROPERTY_CASES = 130;

export interface LedgerEntry {
  readonly account: string;
  readonly cents: Cents;
}

export class SimulatedLedger {
  readonly #entries: LedgerEntry[] = [];

  // Stores the entry and returns the balance the store reports back.
  async post(entry: LedgerEntry): Promise<Cents> {
    await sleep(ROUND_TRIP_MS);
    this.#entries.push(entry);
    return this.balance(entry.account);
  }

  balance(account: string): Cents {
    return this.#entries.filter((entry) => entry.account === account).reduce((total, entry) => total + entry.cents, 0);
  }
}

// mulberry32: a small seeded generator, so a failing case replays exactly.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function randomInteger(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
