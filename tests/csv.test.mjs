import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSignalsCsv } from '../lib/csv.ts';
await test('CSV supports quoted commas, quotes and multiline notes', () => {
  const rows = parseSignalsCsv(
    'metric,value,period,note,source\r\nSessions,120,2026-09,"A comma, a ""quote""\nand newline",GA4',
  );
  assert.equal(rows[0].value, 120);
  assert.equal(rows[0].note, 'A comma, a "quote"\nand newline');
});
await test('CSV rejects invalid rows atomically and does not turn unknowns into zero', () => {
  for (const csv of [
    'metric,value,period\nSessions,,Sep',
    'metric,value,period\nSessions,-1,Sep',
    'metric,value,period\nSessions,1,Sep\nLeads,bad,Sep',
    'metric,value,period\n"Sessions,1,Sep',
    'metric,value,period',
    'metric,value,period\nSessions,1,Sep,extra',
  ])
    assert.throws(() => parseSignalsCsv(csv));
  assert.equal(parseSignalsCsv('metric,value,period\nLeads,0,Sep')[0].value, 0);
});
await test('CSV campaign columns parse as a pair and reject unknown metrics', () => {
  const rows = parseSignalsCsv(
    'metric,value,period,campaign,campaign_metric\nAd spend,250,Aug,cmp001,Spend\nSessions,9,Aug,,',
  );
  assert.equal(rows[0].campaign, 'CMP001');
  assert.equal(rows[0].campaignMetric, 'spend');
  assert.equal('campaign' in rows[1], false);
  for (const csv of [
    'metric,value,period,campaign,campaign_metric\nAd spend,250,Aug,CMP001,',
    'metric,value,period,campaign,campaign_metric\nAd spend,250,Aug,,spend',
    'metric,value,period,campaign,campaign_metric\nAd spend,250,Aug,CMP001,clicks',
    'metric,value,period,campaign,campaign_metric\nAd spend,250,Aug,THISCODEISTOOLONG,spend',
  ])
    assert.throws(() => parseSignalsCsv(csv), /campaign/);
});
