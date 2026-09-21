import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAIRequest,
  extractSearchSources,
  runAI,
  selectAIProvider,
} from '../lib/ai.ts';
import { reservationMicros, usageMicros } from '../lib/ai-budget.ts';

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
    assert.deepEqual(result, {
      ok: true,
      __aiMeta: {
        provider: 'openai',
        model: 'gpt-5.4-mini-2026-03-17',
        workload: 'routine',
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.Authorization, 'Bearer personal-key');
  } finally {
    globalThis.fetch = previous;
  }
});

await test('routing is deterministic and preserves frontier boundaries', () => {
  const both = {
    OPENAI_API_KEY: 'openai',
    DEEPSEEK_API_KEY: 'deepseek',
  };
  assert.equal(selectAIProvider(both, '', { workload: 'routine' }), 'deepseek');
  assert.equal(selectAIProvider(both, '', { workload: 'strategic' }), 'openai');
  assert.equal(
    selectAIProvider(both, '', { workload: 'research', search: true }),
    'openai',
  );
  assert.equal(
    selectAIProvider(both, 'personal-openai', { workload: 'routine' }),
    'openai',
  );
  assert.throws(
    () =>
      selectAIProvider({ DEEPSEEK_API_KEY: 'deepseek' }, '', {
        workload: 'strategic',
      }),
    /frontier/i,
  );
});

await test('DeepSeek reservations and settlement use conservative peak rates', () => {
  assert.equal(reservationMicros(false, 'deepseek'), 25000);
  assert.deepEqual(
    usageMicros(
      { usage: { input_tokens: 1000000, output_tokens: 1000000 } },
      false,
      'deepseek',
    ),
    { amount: 1650000, input: 1000000, output: 1000000 },
  );
});

await test('DeepSeek payload is bounded and cannot acquire search tools', () => {
  const request = buildAIRequest('deepseek', 'Return {ok:true}.', {
    workload: 'routine',
  });
  assert.equal(request.url, 'https://api.deepseek.com/responses');
  assert.equal(request.body.model, 'deepseek-flash');
  assert.equal(request.body.max_output_tokens, 3500);
  assert.equal(request.body.reasoning.effort, 'none');
  assert.equal('tools' in request.body, false);
  assert.throws(
    () =>
      buildAIRequest('deepseek', 'Search.', {
        workload: 'research',
        search: true,
      }),
    /not allowed/i,
  );
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
              {
                type: 'url_citation',
                url_citation: { url: 'https://example.net/source-c' },
              },
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
