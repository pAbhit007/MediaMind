import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src/features/notes/markdown';
import type { Note } from '../src/db/schema';
import { makeMeta } from './fixtures/video';

const note = (o: Partial<Note>): Note => ({ id: 'x', videoId: 'v1', t: 0, text: '', kind: 'note', createdAt: 1, updatedAt: 1, ...o });

describe('toMarkdown', () => {
  it('renders the exact export format, notes ordered by time, quote only when present', () => {
    const md = toMarkdown(makeMeta({ id: 'abc123', title: 'Neural nets', channel: '3B1B' }), [
      note({ id: 'b', t: 724.6, text: 'Backprop is the chain rule.', quote: 'so backpropagation is just the chain rule' }),
      note({ id: 'a', t: 195, text: 'Learning rate too high overshoots' }),
    ]);
    expect(md).toBe(
      [
        '# Neural nets',
        '3B1B · https://www.youtube.com/watch?v=abc123',
        '',
        '## [3:15](https://www.youtube.com/watch?v=abc123&t=195s)',
        'Learning rate too high overshoots',
        '',
        '## [12:04](https://www.youtube.com/watch?v=abc123&t=724s)',
        'Backprop is the chain rule.',
        '',
        '> so backpropagation is just the chain rule',
        '',
      ].join('\n'),
    );
  });
});
