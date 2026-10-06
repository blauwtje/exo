// Tiny hand-worked datasets, one per kind of defect the export can have. Each
// runs through `bin/export.mjs --data <dir>`; `expect` maps a customer id to
// [total in EUR minor units, transaction count].
const HEADER = 'id,name,timezone,currency,plan';
const LEDGER = 'entry_id,customer_ref,entry_type,amount,currency,state,booked_at';
const card = (id, account, type, amount, currency, status, created) => JSON.stringify({ id, account, type, amount, currency, status, created });
const lines = (...rows) => `${rows.join('\n')}\n`;
const fx = (...rows) => lines('date,currency,rate', ...rows);

export const FAULTS = [
  {
    name: 'booking day in the customer time zone',
    month: '2026-03',
    files: {
      'customers.csv': lines(HEADER, 'D1,Dune Labs,America/Los_Angeles,USD,standard', 'D2,Tokyo Tea,Asia/Tokyo,USD,standard'),
      'fx/2026-03.csv': fx('2026-03-04,USD,0.8500', '2026-03-05,USD,0.9000', '2026-03-06,USD,0.9500', '2026-03-07,USD,1.0000', '2026-03-08,USD,1.0500', '2026-03-09,USD,1.1000', '2026-03-10,USD,1.1500'),
      'sources/cardsvc/2026-03.jsonl': lines(
        card(7001, 'D1', 'charge', 10000, 'USD', 'succeeded', '2026-03-06T03:30:00Z'),
        card(7002, 'D2', 'charge', 10000, 'USD', 'succeeded', '2026-03-05T16:00:00Z'),
        card(7003, 'D1', 'charge', 10000, 'USD', 'succeeded', '2026-03-08T07:30:00Z'),
        card(7004, 'D1', 'charge', 10000, 'USD', 'succeeded', '2026-03-09T07:30:00Z')
      ),
      'sources/ledger/2026-03.csv': lines(LEDGER)
    },
    expect: { D1: [30000, 3], D2: [9500, 1] }
  },
  {
    name: 'refunds and credit notes count',
    month: '2026-03',
    files: {
      'customers.csv': lines(HEADER, 'R1,Rowan Mills,Europe/Berlin,EUR,standard', 'R2,Reed Freight,Europe/Paris,EUR,standard'),
      'fx/2026-03.csv': fx('2026-03-10,USD,0.9000'),
      'sources/cardsvc/2026-03.jsonl': lines(
        card(7101, 'R1', 'charge', 5000, 'EUR', 'succeeded', '2026-03-10T12:00:00Z'),
        card(7102, 'R1', 'charge', 7000, 'EUR', 'succeeded', '2026-03-10T12:05:00Z'),
        card(7103, 'R1', 'refund', 2000, 'EUR', 'succeeded', '2026-03-10T12:10:00Z'),
        card(7104, 'R1', 'refund', 900, 'EUR', 'failed', '2026-03-10T12:15:00Z'),
        card(7105, 'R2', 'refund', 2500, 'EUR', 'succeeded', '2026-03-10T12:20:00Z'),
        card(7106, 'R2', 'refund', 3000, 'EUR', 'failed', '2026-03-10T12:25:00Z')
      ),
      'sources/ledger/2026-03.csv': lines(
        LEDGER,
        '9101,R1,credit_note,-15.00,EUR,posted,2026-03-11T09:00:00Z',
        '9102,R1,invoice,12.00,EUR,void,2026-03-11T09:30:00Z'
      )
    },
    expect: { R1: [8500, 4], R2: [-2500, 1] }
  },
  {
    name: 'ids reused across the two sources',
    month: '2026-03',
    files: {
      'customers.csv': lines(HEADER, 'S1,Stone Bakery,Europe/Berlin,EUR,standard', 'S2,Sparrow Cycles,Europe/Madrid,EUR,standard'),
      'fx/2026-03.csv': fx('2026-03-10,USD,0.9000'),
      'sources/cardsvc/2026-03.jsonl': lines(
        card(8001, 'S1', 'charge', 3000, 'EUR', 'succeeded', '2026-03-10T10:00:00Z'),
        card(8002, 'S1', 'charge', 1000, 'EUR', 'succeeded', '2026-03-10T10:05:00Z'),
        card(8002, 'S1', 'charge', 1000, 'EUR', 'succeeded', '2026-03-10T10:05:00Z')
      ),
      'sources/ledger/2026-03.csv': lines(
        LEDGER,
        '8001,S2,invoice,40.00,EUR,posted,2026-03-10T11:00:00Z',
        '8002,S1,invoice,15.00,EUR,posted,2026-03-10T11:05:00Z',
        '8003,S2,invoice,22.00,EUR,posted,2026-03-10T11:10:00Z',
        '8003,S2,invoice,22.00,EUR,posted,2026-03-10T11:10:00Z'
      )
    },
    expect: { S1: [5500, 3], S2: [6200, 2] }
  }
];
