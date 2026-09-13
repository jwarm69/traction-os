import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSearchSources, runAI } from '../lib/ai.ts';

const completed = (text = '{"ok":true}') => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{ content: [{ type: 'output_text', text }] }],
  }),
});

await test('an explicitly supplied OpenAI key takes priority and bypasses shared budget storage', async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls.push(init);
    return completed();
  };
  try {
    const result = await runAI(
      { OPENAI_API_KEY: 'server-key' },
      'user-1',
      ' personal-key ',
      'Return a JSON object.',
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.Authorization, 'Bearer personal-key');
  } finally {
    globalThis.fetch = previous;
  }
});

await test('a failed personal-key request does not fall back to the server key', async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls.push(init);
    return {
      ok: false,
      status: 401,
      json: async () => ({}),
    };
  };
  try {
    await assert.rejects(
      runAI(
        { OPENAI_API_KEY: 'server-key' },
        'user-1',
        'personal-key',
        'Return a JSON object.',
      ),
      /AI connection needs attention/,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.Authorization, 'Bearer personal-key');
  } finally {
    globalThis.fetch = previous;
  }
});

await test('web research retains provider search and citation source URLs', () => {
  const sources = extractSearchSources({
    output: [
      {
        type: 'web_search_call',
        action: { sources: [{ url: 'https://example.com/source-a' }] },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            annotations: [
              { type: 'url_citation', url: 'https://example.org/source-b' },
              { type: 'url_citation', url_citation: { url: 'https://example.net/source-c' } },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(sources.sort(), [
    'https://example.com/source-a',
    'https://example.net/source-c',
    'https://example.org/source-b',
  ]);
});
