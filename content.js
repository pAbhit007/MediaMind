// Function to extract video ID from URL
function getYouTubeVideoId(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v');
}

// Function to get video title
function getVideoTitle() {
    // Try different selectors as YouTube's structure might vary
    const titleElement = document.querySelector([
        'h1.ytd-video-primary-info-renderer',
        'h1.title.style-scope.ytd-video-primary-info-renderer',
        'h1.watch-title'
    ].join(','));
    return titleElement ? titleElement.textContent.trim() : '';
}

// Function to check if we're on a YouTube video page
function isYouTubeVideoPage() {
    return window.location.hostname.includes('youtube.com') && 
           window.location.pathname.includes('/watch');
}

// Function to send video information to background script
function sendVideoInfo() {
    if (isYouTubeVideoPage()) {
        const videoId = getYouTubeVideoId(window.location.href);
        const videoTitle = getVideoTitle();
        
        console.log('Detected video:', { videoId, videoTitle });
        
        if (videoId && videoTitle) {
            try {
                chrome.runtime.sendMessage({
                    type: 'VIDEO_INFO',
                    data: {
                        videoId,
                        videoTitle,
                        url: window.location.href
                    }
                });
            } catch (error) {
                console.log('Extension context may be invalidated:', error);
            }
        }
    }
}

// Monitor URL changes for single-page app
function checkForVideoId() {
    if (isYouTubeVideoPage()) {
        const videoId = getYouTubeVideoId(window.location.href);
        if (videoId) {
            try {
                chrome.runtime.sendMessage({
                    type: 'YOUTUBE_VIDEO_ID',
                    videoId: videoId
                });
            } catch (error) {
                console.log('Extension context may be invalidated:', error);
            }
        }
    }
}

// Initial check
checkForVideoId();

// Listen for URL changes
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        checkForVideoId();
    }
}).observe(document, { subtree: true, childList: true });

// Watch for title changes specifically
new MutationObserver(() => {
    if (isYouTubeVideoPage()) {
        sendVideoInfo();
    }
}).observe(
    document.head, 
    { subtree: true, childList: true }
); 