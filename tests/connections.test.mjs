import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeMail,
  verifyGmail,
  sendGmail,
  findSentGmail,
  readGmailThread,
  fetchGA4,
} from '../lib/connections.ts';

const draft = {
  from: 'owner@example.com',
  to: 'prospect@example.com',
  subject: 'A useful question — café',
  body: 'Hello,\nHere is a note.\nThanks!',
  messageId: 'unique-outreach-1@traction.local',
};
await test('email serializes UTF-8 and rejects header injection and multiple recipients', () => {
  const mime = Buffer.from(encodeMail(draft), 'base64url').toString();
  assert.match(mime, /Message-ID: <unique-outreach-1@traction.local>/);
  assert.match(mime, /Content-Transfer-Encoding: base64/);
  assert.equal(
    Buffer.from(
      mime.split('\r\n\r\n')[1].replaceAll('\r\n', ''),
      'base64',
    ).toString(),
    draft.body,
  );
  assert.throws(() =>
    encodeMail({ ...draft, subject: 'hi\r\nBcc: other@example.com' }),
  );
  assert.throws(() =>
    encodeMail({ ...draft, to: 'one@example.com,two@example.com' }),
  );
  assert.throws(() => encodeMail({ ...draft, messageId: 'x\r\nInjected: y' }));
});
await test('Google adapters use fixed endpoints and sanitize errors without retrying sends', async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return Response.json({ emailAddress: draft.from });
    };
    assert.deepEqual(await verifyGmail('test-token'), { email: draft.from });
    assert.equal(
      calls[0].url,
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    );
    assert.equal(calls[0].options.redirect, 'error');
    globalThis.fetch = async () => {
      calls.push('send');
      return new Response('token secret provider diagnostic', { status: 503 });
    };
    await assert.rejects(
      () => sendGmail('test-token', draft),
      /Google could not complete/,
    );
    assert.equal(calls.filter((c) => c === 'send').length, 1);
    globalThis.fetch = async () => Response.json({ messages: [] });
    assert.equal(await findSentGmail('test-token', draft.messageId), null);
    globalThis.fetch = async () => Response.json({ id: 'm1', threadId: 't1' });
    assert.deepEqual(await sendGmail('test-token', draft), {
      id: 'm1',
      threadId: 't1',
    });
  } finally {
    globalThis.fetch = original;
  }
});
await test('reply sync counts only new inbound messages from intended recipient', async () => {
  const original = globalThis.fetch;
  const sentAt = '2026-09-09T10:00:00Z';
  const at = Date.parse(sentAt) + 1000;
  const message = (sender, labels = [], time = at) => ({
    internalDate: String(time),
    labelIds: labels,
    snippet: 'a reply',
    payload: { headers: [{ name: 'From', value: sender }] },
  });
  try {
    globalThis.fetch = async () =>
      Response.json({
        messages: [
          message('Prospect <prospect@example.com>'),
          message('prospect@example.com', ['SENT']),
          message('other@example.com'),
          message('prospect@example.com', [], at - 10000),
        ],
      });
    const r = await readGmailThread('test-token', 'thread1', draft.to, sentAt);
    assert.equal(r.replyCount, 1);
    assert.equal(r.snippets.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
await test('GA4 report retains provenance and rejects malformed dates and property paths', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(url, /properties\/123:runReport$/);
      assert.equal(JSON.parse(options.body).metrics[0].name, 'sessions');
      return Response.json({
        rows: [
          {
            metricValues: [
              { value: '200' },
              { value: '150' },
              { value: '330' },
              { value: '4' },
            ],
          },
        ],
        metadata: { subjectToThresholding: true },
      });
    };
    const r = await fetchGA4('test-token', '123', '2026-09-01', '2026-09-08');
    assert.equal(r.sessions, 200);
    assert.equal(r.warnings.length, 1);
    assert.match(r.source, /not necessarily leads/);
    await assert.rejects(() =>
      fetchGA4('test-token', '../x', '2026-09-01', '2026-09-08'),
    );
    await assert.rejects(() =>
      fetchGA4('test-token', '123', '2026-02-30', '2026-09-08'),
    );
    await assert.rejects(() =>
      fetchGA4('test-token', '123', '2026-09-09', '2026-09-01'),
    );
  } finally {
    globalThis.fetch = original;
  }
});
