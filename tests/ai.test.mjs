import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSearchSources } from '../lib/ai.ts';

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
