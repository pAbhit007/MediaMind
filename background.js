// Initialize side panel when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Enable side panel
  chrome.sidePanel.setOptions({
    enabled: true,
    path: 'sidepanel.html'
  });
});

let activeVideoId = '';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'YOUTUBE_VIDEO_ID') {
        activeVideoId = message.videoId;
    }
});

// When the extension icon is clicked, open the sidepanel
chrome.action.onClicked.addListener(async (tab) => {
    // Always open the sidepanel when the extension icon is clicked
    await chrome.sidePanel.open({ windowId: tab.windowId });
    
    // If we're on a YouTube page, check for video ID
    if (tab.url && tab.url.includes('youtube.com/watch')) {
        const url = new URL(tab.url);
        const videoId = url.searchParams.get('v');
        if (videoId) {
            activeVideoId = videoId;
        }
    }
});

// When the side panel connects, send it the current video ID
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        // Send initial video ID
        port.postMessage({ 
            type: 'YOUTUBE_VIDEO_ID', 
            videoId: activeVideoId 
        });

        // Listen for disconnect
        port.onDisconnect.addListener(() => {
            // Clean up if needed
        });
    }
}); 