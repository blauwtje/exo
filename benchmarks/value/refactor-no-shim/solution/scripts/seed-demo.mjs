// Prints the demo members for the sales deck.
import { Account } from '../src/models/account.js';

const demo = [
  { id: 1, email: 'Dana@Example.com ', name: 'Dana Fox' },
  { id: 2, email: 'eli@example.com', name: 'Eli Wu', plan: 'pro' },
];

for (const row of demo) console.log(new Account(row).displayName);
