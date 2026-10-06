import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCardsvc } from '../src/ingest/cardsvc.mjs';
import { loadMonth } from '../src/ingest/index.mjs';
import { parseLedger } from '../src/ingest/ledger.mjs';
import { writeData } from './fixture.mjs';

test('cardsvc refunds come out negative and statuses are mapped', () => {
  const rows = parseCardsvc([
    '{"id":7,"account":"C1","type":"charge","amount":500,"currency":"USD","status":"succeeded","created":"2026-03-01T10:00:00Z"}',
    '{"id":8,"account":"C1","type":"refund","amount":200,"currency":"USD","status":"succeeded","created":"2026-03-02T10:00:00Z"}',
    '{"id":9,"account":"C1","type":"charge","amount":300,"currency":"USD","status":"pending","created":"2026-03-03T10:00:00Z"}',
    ''
  ].join('\n'));
  assert.deepEqual(rows.map((row) => [row.id, row.amountMinor, row.status]), [['7', 500, 'settled'], ['8', -200, 'settled'], ['9', 300, 'pending']]);
  assert.equal(rows[0].source, 'cardsvc');
});

test('ledger amounts are read in major units and states are mapped', () => {
  const rows = parseLedger([
    'entry_id,customer_ref,entry_type,amount,currency,state,booked_at',
    '31,C1,invoice,12.50,GBP,posted,2026-03-01T10:00:00Z',
    '32,C1,credit_note,-3.00,GBP,void,2026-03-02T10:00:00Z',
    ''
  ].join('\n'));
  assert.deepEqual(rows.map((row) => [row.id, row.amountMinor, row.status]), [['31', 1250, 'settled'], ['32', -300, 'void']]);
  assert.equal(rows[0].customerId, 'C1');
});

test('an unknown event type is an error, not a silent skip', () => {
  assert.throws(() => parseCardsvc('{"id":1,"account":"C1","type":"dispute","amount":1,"currency":"USD","status":"succeeded","created":"2026-03-01T10:00:00Z"}'), /unknown cardsvc event/);
});

test('loadMonth returns card events first, then ledger entries', () => {
  const rows = loadMonth(writeData(), '2026-03');
  assert.equal(rows.length, 7);
  assert.deepEqual([...new Set(rows.map((row) => row.source))], ['cardsvc', 'ledger']);
});
