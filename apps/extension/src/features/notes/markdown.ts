import type { Note, VideoMeta } from '../../db/schema';
import { formatTime } from '../../ui/cards';

const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** Notes as Markdown (Task 16 format), ordered by timestamp. */
export function toMarkdown(meta: Pick<VideoMeta, 'id' | 'title' | 'channel'>, notes: Note[]): string {
  const blocks = [`# ${meta.title}\n${meta.channel} · ${watch(meta.id)}`];
  for (const n of [...notes].sort((a, b) => a.t - b.t || a.createdAt - b.createdAt)) {
    const lines = [`## [${formatTime(n.t)}](${watch(meta.id)}&t=${Math.floor(n.t)}s)`];
    if (n.text) lines.push(n.text);
    if (n.quote) lines.push('', n.quote.split('\n').map((l) => `> ${l}`).join('\n'));
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}
