import { startMainWorld } from '../youtube/main-world';

// MAIN world, document_start: hooks fetch/XHR before the player requests captions.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    startMainWorld(window);
  },
});
