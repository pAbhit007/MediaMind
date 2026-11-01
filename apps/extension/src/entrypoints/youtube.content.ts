import { ensureNonce, getCaptions } from '../youtube/captions';
import { watchVideo } from '../youtube/player';
import type { BackgroundToPage, PageMessage } from '../messaging';

// Isolated world: page side of messaging. Events go to the background, which relays them to the
// side panel (or the watched-range sink).
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    ensureNonce();
    const send = (m: PageMessage) => {
      try {
        void chrome.runtime.sendMessage(m).catch(() => {});
      } catch {
        /* extension context invalidated */
      }
    };
    const player = watchVideo((e) => send(e));

    send({ t: 'hello' });
    chrome.runtime.onMessage.addListener((raw: BackgroundToPage, _sender, sendResponse) => {
      switch (raw.t) {
        case 'panel':
          player.setPanelConnected(raw.connected);
          break;
        case 'getState':
          player.emitState();
          break;
        case 'seek':
          player.seek(raw.time, raw.play);
          break;
        case 'pause':
          player.pause();
          break;
        case 'pauseGetTime':
          player.pause();
          sendResponse({ time: player.currentTime() });
          break;
        case 'getCaptions': {
          const id = player.videoId();
          if (!id) {
            send({ t: 'captions', result: { kind: 'none', videoId: '', title: '', reason: 'failed' } });
            break;
          }
          void getCaptions(id, navigator.language).then((result) => {
            if (player.videoId() !== id) return; // navigated away while fetching
            send({ t: 'captions', result: { ...result, videoId: id } });
          });
          break;
        }
      }
    });
  },
});
