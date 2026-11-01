export type WatchedSink = (videoId: string, range: [number, number]) => void;

let sink: WatchedSink = () => {};

/** Task 11 wires this to IndexedDB. */
export function setWatchedSink(fn: WatchedSink): void {
  sink = fn;
}
export function recordWatched(videoId: string, range: [number, number]): void {
  sink(videoId, range);
}
