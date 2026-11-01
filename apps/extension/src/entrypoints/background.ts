import { createRouter, type ChromeLike } from '../background/router';
import { setWatchedSink } from '../background/watched';
import { addWatchedRange } from '../db/repo';

// Top level so the sink is set on every service-worker start. IndexedDB is shared with the side panel.
setWatchedSink((videoId, range) => {
  void addWatchedRange(videoId, range).catch(() => {});
});

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  const router = createRouter(chrome as unknown as ChromeLike);
  chrome.runtime.onConnect.addListener((port) => void router.onPanelConnect(port));
  chrome.runtime.onMessage.addListener((msg, sender) => {
    router.onRuntimeMessage(msg, sender);
  });
  chrome.tabs.onActivated.addListener((info) => void router.onTabActivated(info));
  chrome.tabs.onRemoved.addListener((id) => router.onTabRemoved(id));
  chrome.tabs.onUpdated.addListener((id, change, tab) => void router.onTabUpdated(id, change, tab));
  chrome.commands.onCommand.addListener((command, tab) => router.onCommand(command, tab));
});
