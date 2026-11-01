import { PANEL_PORT, isPageToBackground, isPageToPanel, type BackgroundToPage, type PageToPanel, type PanelToPage } from '../messaging';
import { recordWatched } from './watched';

type PortLike = {
  name: string;
  postMessage(m: unknown): void;
  onMessage: { addListener(f: (m: unknown) => void): void };
  onDisconnect: { addListener(f: () => void): void };
};

type TabLike = { id?: number; windowId?: number; url?: string };

const isYouTube = (url?: string) => !!url && /^https:\/\/www\.youtube\.com\//.test(url);

export type ChromeLike = {
  sidePanel: { open(o: { tabId: number }): Promise<void> | void };
  tabs: {
    query(q: { active: true; lastFocusedWindow: true } | { active: true; windowId: number }): Promise<TabLike[]>;
    sendMessage(tabId: number, msg: BackgroundToPage): Promise<unknown>;
  };
};

export function createRouter(api: ChromeLike, opts: { bufferMs?: number } = {}) {
  const bufferMs = opts.bufferMs ?? 5000;
  let panel: PortLike | null = null;
  let tabId: number | null = null;
  let windowId: number | null = null;
  let pending: { msg: PageToPanel; at: number } | null = null;

  const toTab = (id: number | null, msg: BackgroundToPage): Promise<unknown> =>
    id == null ? Promise.resolve(undefined) : api.tabs.sendMessage(id, msg).catch(() => undefined);

  /** Like toTab but reports whether a content script answered the message. */
  const reach = async (id: number, msg: BackgroundToPage): Promise<boolean> => {
    try {
      await api.tabs.sendMessage(id, msg);
      return true;
    } catch {
      return false;
    }
  };

  const clearPanelVideo = () => toPanel({ t: 'video', videoId: null });

  const toPanel = (msg: PageToPanel) => {
    try {
      panel?.postMessage(msg);
    } catch {
      /* panel gone */
    }
  };

  async function attach(id: number | null) {
    tabId = id;
    if (id == null || !(await reach(id, { t: 'panel', connected: true }))) {
      if (tabId === id) clearPanelVideo(); // no content script: never leave stale state
      return;
    }
    await toTab(id, { t: 'getState' });
  }

  async function onPanelConnect(port: PortLike) {
    if (port.name !== PANEL_PORT) return;
    panel = port;
    port.onMessage.addListener((m) => {
      void toTab(tabId, m as PanelToPage);
    });
    port.onDisconnect.addListener(() => {
      if (panel !== port) return;
      panel = null;
      const old = tabId;
      tabId = null;
      windowId = null;
      void toTab(old, { t: 'panel', connected: false });
    });
    const [active] = await api.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => [] as TabLike[]);
    tabId = active?.id ?? null;
    windowId = active?.windowId ?? null;
    if (pending) {
      const p = pending;
      pending = null;
      if (Date.now() - p.at <= bufferMs) toPanel(p.msg);
    }
    await attach(tabId);
  }

  function onRuntimeMessage(msg: unknown, sender: { tab?: { id?: number } }) {
    if (isPageToBackground(msg)) {
      if (msg.t === 'hello') {
        // A (re)loaded content script starts with panel=false; tell it if we follow its tab.
        if (panel && sender.tab?.id === tabId && tabId != null) void attach(tabId);
        return;
      }
      recordWatched(msg.videoId, msg.range);
    } else if (isPageToPanel(msg) && sender.tab?.id === tabId) {
      toPanel(msg);
    }
  }

  async function onTabActivated(info: { tabId: number; windowId?: number }) {
    if (!panel || info.tabId === tabId) return;
    if (windowId != null && info.windowId != null && info.windowId !== windowId) return;
    await toTab(tabId, { t: 'panel', connected: false });
    await attach(info.tabId);
  }

  function onTabRemoved(id: number) {
    if (!panel || id !== tabId) return;
    tabId = null;
    clearPanelVideo();
  }

  async function onTabUpdated(id: number, change: { status?: string; url?: string }, tab: TabLike) {
    if (!panel || id !== tabId) return;
    if (!isYouTube(change.url ?? tab.url)) {
      if (change.url || change.status === 'complete') clearPanelVideo();
      return;
    }
    if (change.status === 'complete') await attach(id);
  }

  function onCommand(command: string, tab?: TabLike) {
    if (command !== 'new-note') return;
    const id = tab?.id;
    if (id == null) return;
    // Must run synchronously inside the user-gesture window, before any await.
    void Promise.resolve(api.sidePanel.open({ tabId: id })).catch(() => {});
    void (async () => {
      const changed = id !== tabId;
      tabId = id;
      if (tab?.windowId != null) windowId = tab.windowId;
      if (panel && changed) await attach(id);
      const res = (await toTab(id, { t: 'pauseGetTime' })) as { time?: number } | undefined;
      const msg: PageToPanel = { t: 'newNote', time: res?.time ?? 0 };
      if (panel) toPanel(msg);
      else pending = { msg, at: Date.now() };
    })();
  }

  return { onPanelConnect, onRuntimeMessage, onTabActivated, onTabRemoved, onTabUpdated, onCommand };
}
