// sidepanel.js

// -- CONSTANTS --
const BACKEND_URL = 'http://localhost:5000';

// -- STATE --
const state = {
    videoId: '',
    blogUrl: '',
    currentContentType: 'video', // 'video' or 'blog'
    apiKey: '',
    modelName: 'gemini-2.0-flash-lite',
    temperature: 0.2,
    chatActive: false,
    isProcessing: false,
    currentSection: 'selection',
    isDarkMode: true,
    isSettingsOpen: false,
    hasTranscript: false,
    hasContent: false
};

// -- DOM ELEMENTS --
function initializeDOMElements() {
    return {
        // Selection interface
        selectionSection: document.getElementById('selectionSection'),
        videoMindSection: document.getElementById('videoMindSection'),
        blogQuerySection: document.getElementById('blogQuerySection'),
        backButton: document.getElementById('backButton'),
        videoMindOption: document.getElementById('videoMindOption'),
        blogQueryOption: document.getElementById('blogQueryOption'),

        // Global controls
        globalThemeToggle: document.getElementById('global-theme-toggle'),
        globalRefreshButton: document.getElementById('global-refresh-button'),
        globalSettingsToggle: document.getElementById('global-settings-toggle'),

        // YouTube RAG Assistant interface
        videoIdInput: document.getElementById('video-id'),
        videoForm: document.getElementById('video-form'),
        videoIdValid: document.getElementById('video-id-valid'),
        videoIdInvalid: document.getElementById('video-id-invalid'),
        videoIdError: document.getElementById('video-id-error'),
        transcriptStatus: document.getElementById('transcript-status'),
        apiKeyInput: document.getElementById('api-key'),
        processButton: document.getElementById('process-button'),
            tabbedInterface: document.getElementById('tabbed-interface'),
    chatContainer: document.getElementById('chat-container'),
    chatInputContainer: document.getElementById('chat-input-container'),
    generateMindmapBtn: document.getElementById('generate-mindmap'),
    regenerateMindmapBtn: document.getElementById('regenerate-mindmap'),
    downloadMindmapBtn: document.getElementById('download-mindmap'),
    mindmapContent: document.getElementById('mindmap-content'),
    mindmapNoTranscript: document.getElementById('mindmap-no-transcript'),
    mindmapAvailable: document.getElementById('mindmap-available'),
    mindmapDisplay: document.getElementById('mindmap-display'),
    generateQuizBtn: document.getElementById('generate-quiz'),
    customQuizTopic: document.getElementById('custom-quiz-topic'),
    generateCustomQuizBtn: document.getElementById('generate-custom-quiz'),
    quizForm: document.getElementById('quiz-form'),
    quizQuestions: document.getElementById('quiz-questions'),
    submitQuizBtn: document.getElementById('submit-quiz'),
    retakeQuizBtn: document.getElementById('retake-quiz'),
    newQuizBtn: document.getElementById('new-quiz'),
    quizNoTranscript: document.getElementById('quiz-no-transcript'),
    quizAvailable: document.getElementById('quiz-available'),
    quizDisplay: document.getElementById('quiz-display'),
    quizResults: document.getElementById('quiz-results'),
    footer: document.getElementById('footer'),
    footerModeStatus: document.getElementById('footer-mode-status'),
    saveSettingsBtn: document.getElementById('save-settings'),
        videoInputContainer: document.getElementById('video-input-container'),
        questionInput: document.getElementById('question-input'),
        sendButton: document.getElementById('send-button'),
        loadingIndicator: document.getElementById('loading-indicator'),
        notificationContainer: document.getElementById('notification-container'),
        notificationAlert: document.querySelector('#notification-container .alert'),
        notificationMessage: document.querySelector('#notification-container .message'),
        settingsToggle: document.getElementById('settings-toggle'),
        settingsDrawer: document.getElementById('settings-drawer'),
        closeSettings: document.querySelector('.close-settings'),
        modelSelect: document.getElementById('model-select'),
        temperatureInput: document.getElementById('temperature'),
        tempValue: document.getElementById('temp-value'),
        themeToggle: document.getElementById('theme-toggle'),
        refreshButton: document.getElementById('refresh-button'),

        // BlogQuery interface
        blogUrlInput: document.getElementById('blog-url'),
        blogForm: document.getElementById('blog-form'),
        blogUrlValid: document.getElementById('blog-url-valid'),
        blogUrlInvalid: document.getElementById('blog-url-invalid'),
        blogUrlError: document.getElementById('blog-url-error'),
        blogContentStatus: document.getElementById('blog-content-status'),
        processBlogButton: document.getElementById('process-blog-button'),
        blogTabbedInterface: document.getElementById('blog-tabbed-interface'),
        blogChatContainer: document.getElementById('blog-chat-container'),
        blogChatInputContainer: document.getElementById('blog-chat-input-container'),
        blogQuestionInput: document.getElementById('blog-question-input'),
        blogSendButton: document.getElementById('blog-send-button'),
        blogInputContainer: document.getElementById('blog-input-container'),
        
        // Blog Mindmap elements
        generateBlogMindmapBtn: document.getElementById('generate-blog-mindmap'),
        blogMindmapContent: document.getElementById('blog-mindmap-content'),
        blogMindmapNoContent: document.getElementById('blog-mindmap-no-content'),
        blogMindmapAvailable: document.getElementById('blog-mindmap-available'),
        blogMindmapActions: document.getElementById('blog-mindmap-actions'),
        regenerateBlogMindmapBtn: document.getElementById('regenerate-blog-mindmap'),
        downloadBlogMindmapBtn: document.getElementById('download-blog-mindmap'),
        
        // Blog Quiz elements
        generateBlogQuizBtn: document.getElementById('generate-blog-quiz'),
        blogQuizForm: document.getElementById('blog-quiz-form'),
        blogQuizQuestions: document.getElementById('blog-quiz-questions'),
        submitBlogQuizBtn: document.getElementById('submit-blog-quiz'),
        retakeBlogQuizBtn: document.getElementById('retake-blog-quiz'),
        newBlogQuizBtn: document.getElementById('new-blog-quiz'),
        blogQuizNoContent: document.getElementById('blog-quiz-no-content'),
        blogQuizAvailable: document.getElementById('blog-quiz-available'),
        blogQuizDisplay: document.getElementById('blog-quiz-display'),
        blogQuizResults: document.getElementById('blog-quiz-results'),
        
        // Blog controls
        themeToggleBlog: document.getElementById('theme-toggle-blog'),
        refreshButtonBlog: document.getElementById('refresh-button-blog'),
        settingsToggleBlog: document.getElementById('settings-toggle-blog'),
        blogFooter: document.getElementById('blog-footer'),
        blogFooterModeStatus: document.getElementById('blog-footer-mode-status'),
        blogNotificationContainer: document.getElementById('blog-notification-container')
    };
}

let DOMElements = null;

// -- UI FUNCTIONS --

function render() {
    if (!DOMElements) return;

    // Only update elements that exist
    if (DOMElements.processButton) {
        const shouldDisable = state.isProcessing || !state.videoId || !state.apiKey;
        console.log('Render - Process button disabled:', shouldDisable, {
            isProcessing: state.isProcessing,
            videoId: state.videoId,
            apiKey: !!state.apiKey // Don't log actual API key for security
        });
        DOMElements.processButton.disabled = shouldDisable;
    }
    
    if (DOMElements.sendButton) {
        DOMElements.sendButton.disabled = state.isProcessing || !state.chatActive;
    }
    
    if (DOMElements.questionInput) {
        DOMElements.questionInput.disabled = state.isProcessing || !state.chatActive;
    }

    if (DOMElements.processButton && !state.chatActive) {
        DOMElements.processButton.innerHTML = state.isProcessing ? 
            '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...' : 
            'Process Video';
    }

    if (DOMElements.loadingIndicator) {
        DOMElements.loadingIndicator.style.display = state.isProcessing && state.chatActive ? 'flex' : 'none';
    }
    
    if (DOMElements.chatContainer) {
        DOMElements.chatContainer.style.display = state.chatActive ? 'block' : 'none';
    }
    
    if (DOMElements.chatInputContainer) {
        DOMElements.chatInputContainer.style.display = state.chatActive ? 'block' : 'none';
    }
    
    if (DOMElements.videoInputContainer) {
        DOMElements.videoInputContainer.style.display = state.chatActive ? 'none' : 'block';
    }
}

function appendMessage(role, content) {
    if (!DOMElements?.chatContainer) return;

    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        // Create message header with avatar
        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? 'U' : 'AI';
        
        const userName = document.createElement('span');
        userName.textContent = role === 'user' ? 'You' : 'Assistant';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'message-time';
        timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (role === 'user') {
            messageHeader.appendChild(timestamp);
            messageHeader.appendChild(userName);
            messageHeader.appendChild(avatar);
        } else {
            messageHeader.appendChild(avatar);
            messageHeader.appendChild(userName);
            messageHeader.appendChild(timestamp);
        }
        
        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Format the content for better readability
        if (role === 'assistant') {
            messageContent.innerHTML = formatAIResponse(content);
        } else {
            messageContent.textContent = content;
        }
        
        // Append elements
        messageDiv.appendChild(messageHeader);
        messageDiv.appendChild(messageContent);
        DOMElements.chatContainer.appendChild(messageDiv);
        
        // Smooth scroll to bottom
        setTimeout(() => {
            DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
        }, 100);
    } catch (error) {
        console.error('Error appending message:', error);
    }
}

function resetUI() {
    if (!DOMElements) return;

    state.videoId = '';
    state.chatActive = false;
    state.isProcessing = false;
    state.hasTranscript = false;

    if (DOMElements.videoIdInput) DOMElements.videoIdInput.value = '';
    if (DOMElements.questionInput) DOMElements.questionInput.value = '';
    if (DOMElements.chatContainer) DOMElements.chatContainer.innerHTML = '';
    
    // Reset validation state
    resetValidation();
    
    // Hide transcript status
    hideTranscriptStatus();
    
    render();
}

function globalReset() {
    if (!DOMElements) return;

    // Reset all state
    updateState({
        videoId: '',
        blogUrl: '',
        currentContentType: 'video',
        chatActive: false,
        isProcessing: false,
        currentSection: 'selection',
        hasTranscript: false,
        hasContent: false
    });

    // Clear all inputs
    if (DOMElements.videoIdInput) DOMElements.videoIdInput.value = '';
    if (DOMElements.questionInput) DOMElements.questionInput.value = '';
    if (DOMElements.blogUrlInput) DOMElements.blogUrlInput.value = '';
    if (DOMElements.blogQuestionInput) DOMElements.blogQuestionInput.value = '';

    // Clear all chat containers
    if (DOMElements.chatContainer) DOMElements.chatContainer.innerHTML = '';
    if (DOMElements.blogChatContainer) DOMElements.blogChatContainer.innerHTML = '';

    // Reset validation states
    resetValidation();
    resetBlogValidation();

    // Hide status indicators
    hideTranscriptStatus();
    hideFooter();

    // Hide all tabbed interfaces
    if (DOMElements.tabbedInterface) DOMElements.tabbedInterface.style.display = 'none';
    if (DOMElements.blogTabbedInterface) DOMElements.blogTabbedInterface.style.display = 'none';

    // Show input containers
    if (DOMElements.videoInputContainer) DOMElements.videoInputContainer.style.display = 'block';
    if (DOMElements.blogInputContainer) DOMElements.blogInputContainer.style.display = 'block';

    // Return to selection screen
    showSelection();
    
    render();
}

// -- FORM VALIDATION --

function extractVideoId(url) {
    if (!url) return null;
    
    // If it's already a video ID (11 characters), return it
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }
    
    // Regular YouTube URL patterns
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

function validateVideoInput(input) {
    const value = input.trim();
    if (!value) {
        return { isValid: false, message: 'Please enter a YouTube URL or video ID' };
    }
    
    const videoId = extractVideoId(value);
    if (!videoId) {
        return { isValid: false, message: 'Please enter a valid YouTube URL or video ID' };
    }
    
    return { isValid: true, videoId };
}

function updateValidationUI(isValid, message = '') {
    if (!DOMElements.videoIdInput || !DOMElements.videoIdValid || !DOMElements.videoIdInvalid || !DOMElements.videoIdError) {
        return;
    }
    
    const input = DOMElements.videoIdInput;
    const validIcon = DOMElements.videoIdValid;
    const invalidIcon = DOMElements.videoIdInvalid;
    const errorDiv = DOMElements.videoIdError;
    
    // Reset classes
    input.classList.remove('is-valid', 'is-invalid');
    validIcon.classList.add('d-none');
    invalidIcon.classList.add('d-none');
    errorDiv.classList.add('d-none');
    
    if (input.value.trim()) {
        if (isValid) {
            input.classList.add('is-valid');
            validIcon.classList.remove('d-none');
        } else {
            input.classList.add('is-invalid');
            invalidIcon.classList.remove('d-none');
            errorDiv.classList.remove('d-none');
            errorDiv.querySelector('.error-message').textContent = message;
        }
    }
}

function resetValidation() {
    if (DOMElements.videoIdInput) {
        updateValidationUI(false);
    }
}

function handleVideoInputChange() {
    const input = DOMElements.videoIdInput.value;
    const validation = validateVideoInput(input);
    
    updateValidationUI(validation.isValid, validation.message);
    
    if (validation.isValid) {
        state.videoId = validation.videoId;
    } else {
        state.videoId = '';
    }
    
    render();
}

function updateTranscriptStatus(hasTranscript) {
    if (!DOMElements.transcriptStatus) return;
    
    const statusElement = DOMElements.transcriptStatus;
    const statusText = statusElement.querySelector('.status-text');
    const statusIcon = statusElement.querySelector('i');
    
    // Reset classes
    statusElement.classList.remove('has-transcript', 'no-transcript');
    
    if (hasTranscript) {
        statusElement.classList.add('has-transcript');
        statusText.textContent = 'Transcript Available';
        statusIcon.className = 'bi bi-file-text-fill';
        statusElement.style.display = 'flex';
    } else {
        statusElement.classList.add('no-transcript');
        statusText.textContent = 'General AI Mode';
        statusIcon.className = 'bi bi-chat-dots-fill';
        statusElement.style.display = 'flex';
    }
}

function hideTranscriptStatus() {
    if (DOMElements.transcriptStatus) {
        DOMElements.transcriptStatus.style.display = 'none';
    }
}

function updateFooter(hasTranscript) {
    if (!DOMElements.footer || !DOMElements.footerModeStatus) {
        return;
    }
    
    // Show footer when chat is active
    DOMElements.footer.classList.add('visible');
    
    // Update mode status
    if (hasTranscript) {
        DOMElements.footerModeStatus.innerHTML = `
            <i class="bi bi-file-text"></i>
            Transcript Mode
        `;
        DOMElements.footerModeStatus.className = 'footer-mode transcript-mode';
    } else {
        DOMElements.footerModeStatus.innerHTML = `
            <i class="bi bi-robot"></i>
            General AI Mode
        `;
        DOMElements.footerModeStatus.className = 'footer-mode general-mode';
    }
}

function hideFooter() {
    if (DOMElements.footer) {
        DOMElements.footer.classList.remove('visible');
    }
}

function showTypingIndicator() {
    if (!DOMElements?.chatContainer) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-message';
    typingDiv.id = 'typing-indicator-message';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    
    const userName = document.createElement('span');
    userName.textContent = 'Assistant';
    
    messageHeader.appendChild(avatar);
    messageHeader.appendChild(userName);
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    
    messageContent.appendChild(typingIndicator);
    typingDiv.appendChild(messageHeader);
    typingDiv.appendChild(messageContent);
    
    DOMElements.chatContainer.appendChild(typingDiv);
    DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
}

function hideTypingIndicator() {
    const typingMessage = document.getElementById('typing-indicator-message');
    if (typingMessage) {
        typingMessage.remove();
    }
}

// Format AI response for better readability
function formatAIResponse(text) {
    // Escape HTML to prevent XSS
    let formatted = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Convert markdown-style formatting
    // Bold text: **text** or __text__
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic text: *text* or _text_
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Convert line breaks to HTML
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Handle bullet points
    formatted = formatted.replace(/^\* (.*?)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Handle numbered lists
    formatted = formatted.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    
    // Wrap in paragraphs if not already wrapped
    if (!formatted.includes('<p>') && !formatted.includes('<ul>') && !formatted.includes('<ol>')) {
        formatted = '<p>' + formatted + '</p>';
    } else if (formatted.includes('</p><p>')) {
        formatted = '<p>' + formatted + '</p>';
    }
    
    return formatted;
}

// -- TAB FUNCTIONALITY --

function initializeTabs() {
    // Add event listeners to tab headers
    const tabHeaders = document.querySelectorAll('.tab-header');
    tabHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const tabId = header.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update tab headers
    const tabHeaders = document.querySelectorAll('.tab-header');
    tabHeaders.forEach(header => {
        if (header.getAttribute('data-tab') === tabId) {
            header.classList.add('active');
        } else {
            header.classList.remove('active');
        }
    });
    
    // Update tab panes
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => {
        if (pane.id === `${tabId}-tab`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
}

// -- MINDMAP FUNCTIONALITY --

function updateMindmapTab(hasTranscript) {
    if (hasTranscript) {
        if (DOMElements.mindmapNoTranscript) {
            DOMElements.mindmapNoTranscript.style.display = 'none';
        }
        if (DOMElements.mindmapAvailable) {
            DOMElements.mindmapAvailable.style.display = 'block';
        }
    } else {
        if (DOMElements.mindmapAvailable) {
            DOMElements.mindmapAvailable.style.display = 'none';
        }
        if (DOMElements.mindmapNoTranscript) {
            DOMElements.mindmapNoTranscript.style.display = 'block';
        }
    }
}

async function generateMindmap() {
    if (!state.videoId || !state.apiKey) {
        showNotification('Missing video ID or API key', 'error');
        return;
    }
    
    if (!state.hasTranscript) {
        showNotification('Cannot generate mindmap without transcript', 'error');
        return;
    }

    // Show loading state
    if (DOMElements.generateMindmapBtn) {
        DOMElements.generateMindmapBtn.classList.add('loading');
        DOMElements.generateMindmapBtn.disabled = true;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/generate_mindmap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: state.videoId,
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate mindmap');
        }
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to generate mindmap');
        }

        // Display the mindmap
        displayMindmap(data.mindmap);
        
        showNotification('Mindmap generated successfully!', 'success');

    } catch (error) {
        console.error('Mindmap generation error:', error);
        showNotification(error.message, 'error');
    } finally {
        // Reset loading state
        if (DOMElements.generateMindmapBtn) {
            DOMElements.generateMindmapBtn.classList.remove('loading');
            DOMElements.generateMindmapBtn.disabled = false;
        }
    }
}

function displayMindmap(mindmapData) {
    if (DOMElements.mindmapContent) {
        // Create a unique ID for this mermaid diagram
        const diagramId = `video-mermaid-${Date.now()}`;
        
        // Set the mindmap content with a simplified structure
        DOMElements.mindmapContent.innerHTML = `
            <div class="mermaid-container">
                <div class="mermaid-controls">
                    <button class="mermaid-control-btn zoom-out-btn" title="Zoom Out">-</button>
                    <button class="mermaid-control-btn reset-zoom-btn" title="Reset Zoom">100%</button>
                    <button class="mermaid-control-btn zoom-in-btn" title="Zoom In">+</button>
                    <button class="mermaid-control-btn download-btn">↓</button>
                </div>
                <div class="mermaid-viewport">
                    <div id="${diagramId}" class="mermaid-diagram">${mindmapData}</div>
                </div>
            </div>
        `;
        
        // Render Mermaid diagram
        renderMermaidDiagram(diagramId, mindmapData);
        
        // Add zoom and pan functionality after rendering
        setTimeout(() => {
            addMindmapInteractivity(diagramId);
        }, 500);
    }
    
    if (DOMElements.mindmapDisplay) {
        DOMElements.mindmapDisplay.style.display = 'flex';
    }
}

function downloadMindmap() {
    if (!DOMElements.mindmapContent || !DOMElements.mindmapContent.innerHTML) {
        showNotification('No mindmap to download', 'error');
        return;
    }
    
    const content = DOMElements.mindmapContent.innerText;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${state.videoId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Mindmap downloaded!', 'success');
}

// -- QUIZ FUNCTIONALITY --

// Store quiz data globally
let currentQuiz = null;

function updateQuizTab(hasTranscript) {
    if (hasTranscript) {
        if (DOMElements.quizNoTranscript) {
            DOMElements.quizNoTranscript.style.display = 'none';
        }
        if (DOMElements.quizAvailable) {
            DOMElements.quizAvailable.style.display = 'block';
        }
    } else {
        if (DOMElements.quizAvailable) {
            DOMElements.quizAvailable.style.display = 'none';
        }
        if (DOMElements.quizNoTranscript) {
            DOMElements.quizNoTranscript.style.display = 'block';
        }
    }
}

async function generateQuiz() {
    if (!state.videoId || !state.apiKey) {
        showNotification('Missing video ID or API key', 'error');
        return;
    }
    
    if (!state.hasTranscript) {
        showNotification('Cannot generate quiz without transcript', 'error');
        return;
    }

    // Show loading state
    if (DOMElements.generateQuizBtn) {
        DOMElements.generateQuizBtn.classList.add('loading');
        DOMElements.generateQuizBtn.disabled = true;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/generate_quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: state.videoId,
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate quiz');
        }
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to generate quiz');
        }

        // Store quiz data and display
        currentQuiz = data.quiz;
        displayQuiz(currentQuiz);
        
        showNotification('Quiz generated successfully!', 'success');

    } catch (error) {
        console.error('Quiz generation error:', error);
        showNotification(error.message, 'error');
    } finally {
        // Reset loading state
        if (DOMElements.generateQuizBtn) {
            DOMElements.generateQuizBtn.classList.remove('loading');
            DOMElements.generateQuizBtn.disabled = false;
        }
    }
}

function displayQuiz(quizData) {
    if (!DOMElements.quizQuestions || !quizData || !quizData.questions) {
        return;
    }
    
    // Clear previous quiz
    DOMElements.quizQuestions.innerHTML = '';
    
    // Generate quiz HTML
    quizData.questions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'quiz-question';
        questionDiv.innerHTML = `
            <div class="question-header">
                <div class="question-number">${index + 1}</div>
                <p class="question-text">${question.question}</p>
            </div>
            <div class="question-options">
                ${question.options.map((option, optIndex) => `
                    <label class="option-item" for="q${index}_opt${optIndex}">
                        <input type="radio" id="q${index}_opt${optIndex}" name="question_${index}" value="${optIndex}">
                        <span class="option-text">${option}</span>
                    </label>
                `).join('')}
            </div>
        `;
        DOMElements.quizQuestions.appendChild(questionDiv);
    });
    
    // Show quiz display
    if (DOMElements.quizDisplay) {
        DOMElements.quizDisplay.style.display = 'flex';
    }
    
    // Reset quiz state
    if (DOMElements.quizResults) {
        DOMElements.quizResults.style.display = 'none';
    }
    if (DOMElements.submitQuizBtn) {
        DOMElements.submitQuizBtn.style.display = 'block';
    }
    if (DOMElements.retakeQuizBtn) {
        DOMElements.retakeQuizBtn.style.display = 'none';
    }
    
    // Add option selection handlers
    addOptionHandlers();
}

function addOptionHandlers() {
    const optionItems = document.querySelectorAll('.option-item');
    optionItems.forEach(item => {
        item.addEventListener('click', () => {
            const radio = item.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                
                // Update visual selection
                const questionDiv = item.closest('.quiz-question');
                const allOptions = questionDiv.querySelectorAll('.option-item');
                allOptions.forEach(opt => opt.classList.remove('selected'));
                item.classList.add('selected');
            }
        });
    });
}

function submitQuiz() {
    if (!currentQuiz || !currentQuiz.questions) {
        showNotification('No quiz available to submit', 'error');
        return;
    }
    
    // Collect answers
    const formData = new FormData(DOMElements.quizForm);
    const answers = [];
    let answeredCount = 0;
    
    for (let i = 0; i < currentQuiz.questions.length; i++) {
        const answer = formData.get(`question_${i}`);
        if (answer !== null) {
            answers[i] = parseInt(answer);
            answeredCount++;
        } else {
            answers[i] = -1; // No answer selected
        }
    }
    
    // Check if all questions are answered
    if (answeredCount < currentQuiz.questions.length) {
        showNotification(`Please answer all questions (${answeredCount}/${currentQuiz.questions.length} answered)`, 'warning');
        return;
    }
    
    // Calculate score
    let correctCount = 0;
    const results = [];
    
    currentQuiz.questions.forEach((question, index) => {
        const userAnswer = answers[index];
        const correctAnswer = question.correctAnswer;
        const isCorrect = userAnswer === correctAnswer;
        
        if (isCorrect) correctCount++;
        
        results.push({
            question: question.question,
            userAnswer: userAnswer,
            correctAnswer: correctAnswer,
            isCorrect: isCorrect,
            options: question.options
        });
    });
    
    // Display results
    displayQuizResults(correctCount, currentQuiz.questions.length, results);
    
    // Update visual feedback on questions
    updateQuestionVisuals(results);
}

function displayQuizResults(correctCount, totalCount, results) {
    const percentage = Math.round((correctCount / totalCount) * 100);
    
    // Update score display
    const scorePercentage = document.getElementById('score-percentage');
    const scoreFraction = document.getElementById('score-fraction');
    const scoreTitle = document.getElementById('score-title');
    const scoreDescription = document.getElementById('score-description');
    
    if (scorePercentage) scorePercentage.textContent = `${percentage}%`;
    if (scoreFraction) scoreFraction.textContent = `${correctCount}/${totalCount}`;
    
    // Set score message based on performance
    let title, description;
    if (percentage >= 90) {
        title = 'Excellent!';
        description = 'Outstanding performance! You have mastered the content.';
    } else if (percentage >= 80) {
        title = 'Great Job!';
        description = 'Well done! You have a strong understanding of the material.';
    } else if (percentage >= 70) {
        title = 'Good Work!';
        description = 'Good effort! Review the areas you missed to improve further.';
    } else if (percentage >= 60) {
        title = 'Keep Learning!';
        description = 'You\'re on the right track. Consider reviewing the video content again.';
    } else {
        title = 'Keep Trying!';
        description = 'Don\'t give up! Review the video and try again to improve your score.';
    }
    
    if (scoreTitle) scoreTitle.textContent = title;
    if (scoreDescription) scoreDescription.textContent = description;
    
    // Display detailed results
    const detailedResults = document.getElementById('detailed-results');
    if (detailedResults) {
        detailedResults.innerHTML = results.map((result, index) => `
            <div class="result-item ${result.isCorrect ? 'correct' : 'incorrect'}">
                <div class="result-icon">
                    <i class="bi bi-${result.isCorrect ? 'check-circle-fill' : 'x-circle-fill'}"></i>
                </div>
                <div class="result-content">
                    <div class="result-question">Question ${index + 1}: ${result.question}</div>
                    <div class="result-answer">
                        ${result.isCorrect 
                            ? `Correct! You selected: ${result.options[result.userAnswer]}` 
                            : `Incorrect. You selected: ${result.options[result.userAnswer]}. Correct answer: ${result.options[result.correctAnswer]}`
                        }
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // Show results
    if (DOMElements.quizResults) {
        DOMElements.quizResults.style.display = 'block';
    }
    
    // Update buttons - check if it's a custom quiz
    const isCustomQuiz = document.querySelector('.quiz-info h5')?.textContent?.includes('Custom Quiz:');
    
    if (DOMElements.submitQuizBtn) {
        DOMElements.submitQuizBtn.style.display = 'none';
    }
    if (DOMElements.retakeQuizBtn) {
        DOMElements.retakeQuizBtn.style.display = 'block';
    }
    if (DOMElements.newQuizBtn) {
        DOMElements.newQuizBtn.style.display = isCustomQuiz ? 'block' : 'none';
    }
    
    // Scroll to results
    DOMElements.quizResults.scrollIntoView({ behavior: 'smooth' });
}

function updateQuestionVisuals(results) {
    results.forEach((result, index) => {
        const questionDiv = document.querySelectorAll('.quiz-question')[index];
        if (questionDiv) {
            const options = questionDiv.querySelectorAll('.option-item');
            options.forEach((option, optIndex) => {
                option.classList.remove('selected');
                if (optIndex === result.correctAnswer) {
                    option.classList.add('correct');
                } else if (optIndex === result.userAnswer && !result.isCorrect) {
                    option.classList.add('incorrect');
                }
                
                // Disable further selection
                const radio = option.querySelector('input[type="radio"]');
                if (radio) radio.disabled = true;
                option.style.pointerEvents = 'none';
            });
        }
    });
}

function retakeQuiz() {
    if (!currentQuiz) {
        generateQuiz();
        return;
    }
    
    // Reset form
    if (DOMElements.quizForm) {
        DOMElements.quizForm.reset();
    }
    
    // Reset visuals
    const optionItems = document.querySelectorAll('.option-item');
    optionItems.forEach(item => {
        item.classList.remove('selected', 'correct', 'incorrect');
        item.style.pointerEvents = 'auto';
        const radio = item.querySelector('input[type="radio"]');
        if (radio) radio.disabled = false;
    });
    
    // Hide results
    if (DOMElements.quizResults) {
        DOMElements.quizResults.style.display = 'none';
    }
    
    // Show submit button
    if (DOMElements.submitQuizBtn) {
        DOMElements.submitQuizBtn.style.display = 'block';
    }
    if (DOMElements.retakeQuizBtn) {
        DOMElements.retakeQuizBtn.style.display = 'none';
    }
    if (DOMElements.newQuizBtn) {
        DOMElements.newQuizBtn.style.display = 'none';
    }
    
    // Re-add handlers
    addOptionHandlers();
    
    // Scroll to top of quiz
    DOMElements.quizDisplay.scrollIntoView({ behavior: 'smooth' });
}

// -- CUSTOM QUIZ FUNCTIONALITY --

function handleCustomTopicInput() {
    if (!DOMElements.customQuizTopic || !DOMElements.generateCustomQuizBtn) return;
    
    const topic = DOMElements.customQuizTopic.value.trim();
    DOMElements.generateCustomQuizBtn.disabled = topic.length < 3; // Minimum 3 characters
}

function showNewQuizInput() {
    // Show the custom quiz input section again
    if (DOMElements.quizNoTranscript) {
        DOMElements.quizNoTranscript.style.display = 'block';
    }
    
    // Hide quiz display and results
    if (DOMElements.quizDisplay) {
        DOMElements.quizDisplay.style.display = 'none';
    }
    if (DOMElements.quizResults) {
        DOMElements.quizResults.style.display = 'none';
    }
    
    // Clear the previous topic input
    if (DOMElements.customQuizTopic) {
        DOMElements.customQuizTopic.value = '';
        DOMElements.customQuizTopic.focus();
    }
    
    // Reset button states
    if (DOMElements.generateCustomQuizBtn) {
        DOMElements.generateCustomQuizBtn.disabled = true;
    }
    
    // Reset quiz state
    currentQuiz = null;
    
    // Scroll to top
    document.querySelector('.quiz-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function generateCustomQuiz() {
    if (!DOMElements.customQuizTopic || !DOMElements.generateCustomQuizBtn) return;
    
    const topic = DOMElements.customQuizTopic.value.trim();
    if (topic.length < 3) {
        showNotification('Please enter a topic with at least 3 characters', 'error');
        return;
    }
    
    if (!state.apiKey || state.apiKey.trim() === '') {
        showNotification('Please configure your Google API Key in settings first.', 'error');
        toggleSettings(true);
        return;
    }
    
    try {
        // Show loading state
        const loadingSpan = DOMElements.generateCustomQuizBtn.querySelector('.btn-loading');
        if (loadingSpan) {
            loadingSpan.classList.remove('d-none');
        }
        DOMElements.generateCustomQuizBtn.disabled = true;
        
        hideNotification();
        
        console.log('Making custom quiz request to:', `${BACKEND_URL}/generate_custom_quiz`);
        
        const response = await fetch(`${BACKEND_URL}/generate_custom_quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: topic,
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature,
            }),
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response received:', text);
            throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
        }
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to generate custom quiz');
        }
        
        currentQuiz = data.quiz;
        displayQuiz(data.quiz);
        
        // Update quiz header for custom quiz
        const quizInfo = document.querySelector('.quiz-info h5');
        if (quizInfo) {
            quizInfo.innerHTML = `<i class="bi bi-lightbulb me-2"></i>Custom Quiz: ${topic}`;
        }
        
        // Hide the custom quiz input section (dropdown-like behavior)
        if (DOMElements.quizNoTranscript) {
            DOMElements.quizNoTranscript.style.display = 'none';
        }
        
        showNotification('Custom quiz generated successfully!', 'success', 3000);
        
    } catch (error) {
        console.error('Error generating custom quiz:', error);
        showNotification(error.message, 'error');
    } finally {
        // Reset loading state
        const loadingSpan = DOMElements.generateCustomQuizBtn.querySelector('.btn-loading');
        if (loadingSpan) {
            loadingSpan.classList.add('d-none');
        }
        DOMElements.generateCustomQuizBtn.disabled = false;
    }
}

// -- STATE MANAGEMENT --

function updateState(newState) {
    Object.assign(state, newState);
    
    // Update UI based on state changes
    if (DOMElements.questionInput) {
        DOMElements.questionInput.disabled = state.isProcessing;
    }
    if (DOMElements.sendButton) {
        DOMElements.sendButton.disabled = state.isProcessing;
    }
    
    render();
}

// -- API CALLS --

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await fn();
        } catch (error) {
            retries++;
            if (retries === maxRetries) throw error;
            
            const delay = baseDelay * Math.pow(2, retries - 1);
            showNotification(`Retrying video processing (attempt ${retries + 1}/${maxRetries})...`, 'warning');
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function processVideo(event) {
    if (event) {
        event.preventDefault();
    }
    
    // Validate input before processing
    const validation = validateVideoInput(DOMElements.videoIdInput?.value || '');
    if (!validation.isValid) {
        updateValidationUI(false, validation.message);
        showNotification(validation.message, 'error');
        return;
    }
    
    if (!state.apiKey || state.apiKey.trim() === '') {
        showNotification('Please configure your Google API Key in settings first. Click the gear icon to open settings.', 'error', 7000);
        // Optionally open settings automatically
        setTimeout(() => {
            toggleSettings(true);
        }, 500);
        return;
    }

    // Update video ID from validation
    state.videoId = validation.videoId;

    // Reset any existing chat state
    resetChatInterface();

    // Update UI to show processing state
    updateState({ isProcessing: true });
    if (DOMElements.processButton) {
        DOMElements.processButton.classList.add('loading');
        DOMElements.processButton.disabled = true;
    }
    hideNotification();

    try {
        const response = await fetch(`${BACKEND_URL}/process_video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: state.videoId,
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature,
            }),
        });

        const data = await response.json();

        // Always check response.ok first
        if (!response.ok) {
            throw new Error(data.error || 'Failed to process video');
        }
        
        // Then check for success flag
        if (!data.success) {
            throw new Error(data.error || 'Failed to process video');
        }

        // Only proceed if we got a successful response
        updateState({ 
            chatActive: true,
            hasTranscript: data.has_transcript || false
        });
        
        // Show chat interface without notification
        showChatInterface();
        
        // Update transcript status indicator
        updateTranscriptStatus(data.has_transcript);
        
        // Add initial message from assistant
        const welcomeMessage = data.has_transcript 
            ? "Hi! I've processed the video transcript and I'm ready to answer your questions about the video content. What would you like to know?"
            : "Hi! I've identified the video, but no transcript is available. I can still help you with general questions about the video or topic. Feel free to ask me anything!";
        
        appendMessage('assistant', welcomeMessage);

    } catch (error) {
        console.error('Processing error:', error);
        // Reset UI state on error
        updateState({ chatActive: false });
        showNotification(error.message, 'error');
        resetChatInterface();
        
        // Ensure video input is visible
        if (DOMElements.videoInputContainer) {
            DOMElements.videoInputContainer.style.display = 'block';
        }
    } finally {
        // Reset processing state
        updateState({ isProcessing: false });
        if (DOMElements.processButton) {
            DOMElements.processButton.classList.remove('loading');
            DOMElements.processButton.disabled = false;
        }
    }
}

// Reset chat interface
function resetChatInterface() {
    if (DOMElements.tabbedInterface) {
        DOMElements.tabbedInterface.style.display = 'none';
    }
    if (DOMElements.chatContainer) {
        DOMElements.chatContainer.innerHTML = '';
    }
    if (DOMElements.questionInput) {
        DOMElements.questionInput.value = '';
        DOMElements.questionInput.disabled = true;
    }
    if (DOMElements.sendButton) {
        DOMElements.sendButton.disabled = true;
    }
    
    // Reset mindmap display
    if (DOMElements.mindmapDisplay) {
        DOMElements.mindmapDisplay.style.display = 'none';
    }
    if (DOMElements.mindmapContent) {
        DOMElements.mindmapContent.innerHTML = '';
    }
    
    // Reset quiz display
    if (DOMElements.quizDisplay) {
        DOMElements.quizDisplay.style.display = 'none';
    }
    if (DOMElements.quizQuestions) {
        DOMElements.quizQuestions.innerHTML = '';
    }
    if (DOMElements.quizResults) {
        DOMElements.quizResults.style.display = 'none';
    }
    if (DOMElements.quizNoTranscript) {
        DOMElements.quizNoTranscript.style.display = 'none';
    }
    currentQuiz = null;
    
    // Hide footer
    hideFooter();
}

// Show chat interface
function showChatInterface() {
    // Switch to chat mode
    showChatMode();
    
    // Enable chat input and send button
    if (DOMElements.questionInput) {
        DOMElements.questionInput.disabled = false;
        DOMElements.questionInput.value = '';
    }
    if (DOMElements.sendButton) {
        DOMElements.sendButton.disabled = false;
    }
    
    // Update mindmap and quiz tabs based on transcript availability
    updateMindmapTab(state.hasTranscript);
    updateQuizTab(state.hasTranscript);
    
    // Update footer
    updateFooter(state.hasTranscript);
    
    // Don't add a message here - it's handled in processVideo with appropriate context
}

// Handle question submission
async function handleQuestion() {
    if (!state.videoId || !state.apiKey || !DOMElements.questionInput?.value) {
        showNotification('Please enter a question', 'error');
        return;
    }

    const question = DOMElements.questionInput.value.trim();
    if (!question) {
        showNotification('Please enter a valid question', 'error');
        return;
    }

    DOMElements.questionInput.value = '';
    
    // Show user's question in chat
    appendMessage('user', question);
    
    // Show typing indicator
    showTypingIndicator();
    
    // Show loading state
    updateState({ isProcessing: true });
    if (DOMElements.sendButton) {
        DOMElements.sendButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        DOMElements.sendButton.disabled = true;
    }
    if (DOMElements.questionInput) {
        DOMElements.questionInput.disabled = true;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: state.videoId,
                question: question,
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature,
            }),
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get response');
        }

        if (!data.answer) {
            throw new Error('Could not generate a response. Please try again.');
        }

        // Remove typing indicator and show response
        hideTypingIndicator();
        appendMessage('assistant', data.answer);
    } catch (error) {
        hideTypingIndicator();
        showNotification(error.message, 'error');
        appendMessage('assistant', 'Sorry, I encountered an error processing your question. Please try again.');
    } finally {
        // Reset UI state
        updateState({ isProcessing: false });
        if (DOMElements.sendButton) {
            DOMElements.sendButton.innerHTML = '<i class="bi bi-send-fill"></i>';
            DOMElements.sendButton.disabled = false;
        }
        if (DOMElements.questionInput) {
            DOMElements.questionInput.disabled = false;
            DOMElements.questionInput.focus();
        }
    }
}

// -- SETTINGS MANAGEMENT --

function toggleSettings(force = null) {
    if (!DOMElements?.settingsDrawer) return;

    state.isSettingsOpen = force !== null ? force : !state.isSettingsOpen;
    DOMElements.settingsDrawer.classList.toggle('open', state.isSettingsOpen);
}

function saveSettings() {
    // Get current values from inputs
    if (DOMElements.apiKeyInput) {
        state.apiKey = DOMElements.apiKeyInput.value.trim();
        console.log('Save Settings - API Key updated:', !!state.apiKey);
    }
    if (DOMElements.modelSelect) {
        state.modelName = DOMElements.modelSelect.value;
    }
    if (DOMElements.temperatureInput) {
        state.temperature = parseFloat(DOMElements.temperatureInput.value);
    }
    
    const settings = {
        apiKey: state.apiKey,
        modelName: state.modelName,
        temperature: state.temperature,
        isDarkMode: state.isDarkMode
    };
    
    chrome.storage.local.set(settings, () => {
        showNotification('Settings saved successfully!', 'success', 2000);
        // Close settings drawer after saving
        toggleSettings(false);
        // Update UI to reflect the new settings
        render();
    });
}

function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    document.body.classList.toggle('light-theme', !state.isDarkMode);
    
    // Update all theme toggle icons
    const themeButtons = [
        DOMElements.globalThemeToggle,
        DOMElements.themeToggle,
        DOMElements.themeToggleBlog
    ];
    
    themeButtons.forEach(button => {
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = state.isDarkMode ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
            }
        }
    });
    
    // Save theme preference
    chrome.storage.local.set({ isDarkMode: state.isDarkMode });
}

// -- EVENT LISTENERS --

function initializeEventListeners() {
    if (!DOMElements) return;

    // Selection buttons
    if (DOMElements.videoMindOption) {
        DOMElements.videoMindOption.addEventListener('click', showVideoMindSection);
    }
    if (DOMElements.blogQueryOption) {
        DOMElements.blogQueryOption.addEventListener('click', () => {
            // Show BlogQuery section
            showBlogQuerySection();
        });
    }
    if (DOMElements.backButton) {
        DOMElements.backButton.addEventListener('click', showSelection);
    }

    // Video processing form
    if (DOMElements.videoForm) {
        DOMElements.videoForm.addEventListener('submit', processVideo);
    }
    if (DOMElements.processButton) {
        DOMElements.processButton.addEventListener('click', processVideo);
    }
    if (DOMElements.videoIdInput) {
        // Handle input validation in real-time
        DOMElements.videoIdInput.addEventListener('input', handleVideoInputChange);
        DOMElements.videoIdInput.addEventListener('paste', () => {
            // Handle paste with a slight delay to allow the paste to complete
            setTimeout(handleVideoInputChange, 10);
        });
        DOMElements.videoIdInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                DOMElements.processButton.click();
            }
        });
    }

    // Chat
    if (DOMElements.sendButton) {
        DOMElements.sendButton.addEventListener('click', handleQuestion);
    }
    if (DOMElements.questionInput) {
        DOMElements.questionInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') DOMElements.sendButton.click();
        });
    }

    // Settings
    if (DOMElements.settingsToggle) {
        DOMElements.settingsToggle.addEventListener('click', () => toggleSettings());
    }
    if (DOMElements.closeSettings) {
        DOMElements.closeSettings.addEventListener('click', () => toggleSettings(false));
    }
    if (DOMElements.saveSettingsBtn) {
        DOMElements.saveSettingsBtn.addEventListener('click', saveSettings);
    }
    if (DOMElements.apiKeyInput) {
        DOMElements.apiKeyInput.addEventListener('input', (e) => {
            // Don't auto-save, just validate
            const apiKey = e.target.value.trim();
            if (apiKey.length > 0) {
                e.target.classList.add('is-valid');
                e.target.classList.remove('is-invalid');
            } else {
                e.target.classList.remove('is-valid');
                e.target.classList.add('is-invalid');
            }
        });
    }
    if (DOMElements.modelSelect) {
        DOMElements.modelSelect.addEventListener('change', (e) => {
            // Don't auto-save, wait for save button
        });
    }
    if (DOMElements.temperatureInput) {
        DOMElements.temperatureInput.addEventListener('input', (e) => {
            if(DOMElements.tempValue) DOMElements.tempValue.textContent = e.target.value;
            // Don't auto-save, wait for save button
        });
    }

    // Theme toggle
    if (DOMElements.themeToggle) {
        DOMElements.themeToggle.addEventListener('click', toggleTheme);
    }

    // Refresh button
    if (DOMElements.refreshButton) {
        DOMElements.refreshButton.addEventListener('click', () => {
            resetUI();
            // Reset mindmap and quiz displays
            if (DOMElements.mindmapDisplay) DOMElements.mindmapDisplay.style.display = 'none';
            if (DOMElements.quizDisplay) DOMElements.quizDisplay.style.display = 'none';
            if (DOMElements.mindmapContent) DOMElements.mindmapContent.innerHTML = '';
            if (DOMElements.quizQuestions) DOMElements.quizQuestions.innerHTML = '';
            showNotification('Video chat cleared!', 'success', 2000);
        });
    }

    // Mindmap buttons
    if (DOMElements.generateMindmapBtn) {
        DOMElements.generateMindmapBtn.addEventListener('click', generateMindmap);
    }
    if (DOMElements.regenerateMindmapBtn) {
        DOMElements.regenerateMindmapBtn.addEventListener('click', generateMindmap);
    }
    if (DOMElements.downloadMindmapBtn) {
        DOMElements.downloadMindmapBtn.addEventListener('click', downloadMindmap);
    }

    // Quiz buttons
    if (DOMElements.generateQuizBtn) {
        DOMElements.generateQuizBtn.addEventListener('click', generateQuiz);
    }
    if (DOMElements.generateCustomQuizBtn) {
        DOMElements.generateCustomQuizBtn.addEventListener('click', generateCustomQuiz);
    }
    if (DOMElements.customQuizTopic) {
        DOMElements.customQuizTopic.addEventListener('input', handleCustomTopicInput);
    }
    if (DOMElements.quizForm) {
        DOMElements.quizForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitQuiz();
        });
    }
    if (DOMElements.retakeQuizBtn) {
        DOMElements.retakeQuizBtn.addEventListener('click', retakeQuiz);
    }
    if (DOMElements.newQuizBtn) {
        DOMElements.newQuizBtn.addEventListener('click', showNewQuizInput);
    }

    // Initialize tabs
    initializeTabs();

    // -- BLOG EVENT LISTENERS --
    
    // Blog processing form
    if (DOMElements.blogForm) {
        DOMElements.blogForm.addEventListener('submit', processBlog);
    }
    if (DOMElements.processBlogButton) {
        DOMElements.processBlogButton.addEventListener('click', processBlog);
    }
    if (DOMElements.blogUrlInput) {
        // Handle input validation in real-time
        DOMElements.blogUrlInput.addEventListener('input', handleBlogUrlChange);
        DOMElements.blogUrlInput.addEventListener('paste', () => {
            // Handle paste with a slight delay to allow the paste to complete
            setTimeout(handleBlogUrlChange, 10);
        });
        DOMElements.blogUrlInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                DOMElements.processBlogButton?.click();
            }
        });
    }

    // Blog chat
    if (DOMElements.blogSendButton) {
        DOMElements.blogSendButton.addEventListener('click', handleBlogQuestion);
    }
    if (DOMElements.blogQuestionInput) {
        DOMElements.blogQuestionInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') DOMElements.blogSendButton?.click();
        });
    }

    // Blog mindmap buttons
    if (DOMElements.generateBlogMindmapBtn) {
        DOMElements.generateBlogMindmapBtn.addEventListener('click', generateBlogMindmap);
    }
    if (DOMElements.regenerateBlogMindmapBtn) {
        DOMElements.regenerateBlogMindmapBtn.addEventListener('click', generateBlogMindmap);
    }
    if (DOMElements.downloadBlogMindmapBtn) {
        DOMElements.downloadBlogMindmapBtn.addEventListener('click', () => {
            const diagramId = document.querySelector('#blog-mindmap-content .mermaid-diagram')?.id;
            if (diagramId) {
                downloadMindmap(diagramId, 'blog-mindmap');
            } else {
                showNotification('No mindmap to download', 'error');
            }
        });
    }

    // Blog quiz buttons
    if (DOMElements.generateBlogQuizBtn) {
        DOMElements.generateBlogQuizBtn.addEventListener('click', generateBlogQuiz);
    }
    if (DOMElements.blogQuizForm) {
        DOMElements.blogQuizForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitBlogQuiz(e);
        });
    }
    if (DOMElements.retakeBlogQuizBtn) {
        DOMElements.retakeBlogQuizBtn.addEventListener('click', retakeBlogQuiz);
    }

    // Blog controls (theme, refresh, settings)
    if (DOMElements.themeToggleBlog) {
        DOMElements.themeToggleBlog.addEventListener('click', toggleTheme);
    }
    if (DOMElements.refreshButtonBlog) {
        DOMElements.refreshButtonBlog.addEventListener('click', () => {
            // Reset blog-specific UI
            if (DOMElements.blogChatContainer) {
                DOMElements.blogChatContainer.innerHTML = '';
            }
            if (DOMElements.blogQuestionInput) {
                DOMElements.blogQuestionInput.value = '';
            }
            if (DOMElements.blogUrlInput) {
                DOMElements.blogUrlInput.value = '';
            }
            // Reset blog mindmap and quiz displays
            if (DOMElements.blogMindmapContent) {
                DOMElements.blogMindmapContent.style.display = 'none';
                DOMElements.blogMindmapContent.innerHTML = '';
            }
            if (DOMElements.blogMindmapActions) {
                DOMElements.blogMindmapActions.style.display = 'none';
            }
            // Show header sections again
            const mindmapHeader = document.querySelector('#blog-mindmap-tab .mindmap-header');
            const mindmapAvailable = document.querySelector('#blog-mindmap-tab .mindmap-available');
            if (mindmapHeader) mindmapHeader.style.display = 'block';
            if (mindmapAvailable) mindmapAvailable.style.display = 'block';
            if (DOMElements.blogQuizDisplay) DOMElements.blogQuizDisplay.style.display = 'none';
            if (DOMElements.blogQuizQuestions) DOMElements.blogQuizQuestions.innerHTML = '';
            // Reset blog validation
            resetBlogValidation();
            // Reset blog state
            updateState({ 
                blogUrl: '',
                hasContent: false,
                chatActive: false 
            });
            // Show blog input container again
            if (DOMElements.blogInputContainer) {
                DOMElements.blogInputContainer.style.display = 'block';
            }
            if (DOMElements.blogTabbedInterface) {
                DOMElements.blogTabbedInterface.style.display = 'none';
            }
            showNotification('Blog chat cleared!', 'success', 2000);
        });
    }
    if (DOMElements.settingsToggleBlog) {
        DOMElements.settingsToggleBlog.addEventListener('click', () => toggleSettings());
    }

    // -- GLOBAL CONTROLS --
    
    // Global theme toggle
    if (DOMElements.globalThemeToggle) {
        DOMElements.globalThemeToggle.addEventListener('click', toggleTheme);
    }

    // Global refresh button - comprehensive reset
    if (DOMElements.globalRefreshButton) {
        DOMElements.globalRefreshButton.addEventListener('click', () => {
            globalReset();
            showNotification('Application reset successfully!', 'success', 2000);
        });
    }

    // Global settings toggle
    if (DOMElements.globalSettingsToggle) {
        DOMElements.globalSettingsToggle.addEventListener('click', () => toggleSettings());
    }

    // -- VIDEO SECTION CONTROLS --

    // Theme toggle
    if (DOMElements.themeToggle) {
        DOMElements.themeToggle.addEventListener('click', toggleTheme);
    }
}

function initializeApp() {
    // Initialize DOM elements
    DOMElements = initializeDOMElements();
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize Mermaid
    initializeMermaid();
    
    // Initialize UI state - start with selection screen
    showSelection();
    
    // Set default theme icons for all theme toggles
    const themeButtons = [
        DOMElements.globalThemeToggle,
        DOMElements.themeToggle,
        DOMElements.themeToggleBlog
    ];
    
    themeButtons.forEach(button => {
        if (button) {
            const icon = button.querySelector('i');
            if (icon && !icon.className.includes('bi-')) {
                icon.className = state.isDarkMode ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
            }
        }
    });

    // Load saved settings
    chrome.storage.local.get(['apiKey', 'modelName', 'temperature', 'isDarkMode'], (result) => {
        if (result.apiKey && DOMElements?.apiKeyInput) {
            DOMElements.apiKeyInput.value = result.apiKey;
            DOMElements.apiKeyInput.classList.add('is-valid');
            updateState({ apiKey: result.apiKey });
        } else {
            // Show notification about API key requirement
            setTimeout(() => {
                showNotification('Please configure your Google API Key in settings to get started', 'info', 5000);
            }, 1000);
        }
        if (result.modelName && DOMElements?.modelSelect) {
            DOMElements.modelSelect.value = result.modelName;
            updateState({ modelName: result.modelName });
        }
        if (result.temperature && DOMElements?.temperatureInput && DOMElements?.tempValue) {
            DOMElements.temperatureInput.value = result.temperature;
            DOMElements.tempValue.textContent = result.temperature;
            updateState({ temperature: parseFloat(result.temperature) });
        }
        if (typeof result.isDarkMode !== 'undefined') {
            state.isDarkMode = result.isDarkMode;
            // Apply theme on load
            document.body.classList.toggle('light-theme', !state.isDarkMode);
            // Update all theme toggle icons
            const themeButtons = [
                DOMElements.globalThemeToggle,
                DOMElements.themeToggle,
                DOMElements.themeToggleBlog
            ];
            
            themeButtons.forEach(button => {
                if (button) {
                    const icon = button.querySelector('i');
                    if (icon) {
                        icon.className = state.isDarkMode ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
                    }
                }
            });
        }
        
        // Ensure UI is updated after loading all settings
        setTimeout(() => {
            render();
        }, 100);
    });

    // Auto-fetch video ID if available
    chrome.runtime.connect({ name: 'sidepanel' }).onMessage.addListener(msg => {
        if (msg.type === 'YOUTUBE_VIDEO_ID' && msg.videoId) {
            updateState({ videoId: msg.videoId });
            if (DOMElements?.videoIdInput) {
                DOMElements.videoIdInput.value = msg.videoId;
            }
        }
    });
}

// Wait for DOM to be loaded before initializing
document.addEventListener('DOMContentLoaded', initializeApp);

// Add notification functions
function showNotification(message, type = 'info', duration = 5000) {
    if (!DOMElements?.notificationContainer) return;
    
    try {
        const alert = DOMElements.notificationContainer.querySelector('.alert');
        if (!alert) return;
        
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        const messageElement = alert.querySelector('.message');
        if (messageElement) {
            messageElement.textContent = message;
        }
        DOMElements.notificationContainer.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                hideNotification();
            }, duration);
        }
    } catch (error) {
        console.error('Error showing notification:', error);
    }
}

function hideNotification() {
    if (DOMElements?.notificationContainer) {
        DOMElements.notificationContainer.style.display = 'none';
    }
}

function showVideoMindSection() {
    if (!DOMElements) return;
    
    // Hide selection section and show video mind section
    if (DOMElements.selectionSection) {
        DOMElements.selectionSection.style.display = 'none';
    }
    if (DOMElements.videoMindSection) {
        DOMElements.videoMindSection.style.display = 'flex';
        DOMElements.videoMindSection.classList.add('active');
    }
    
    // Show video input container
    if (DOMElements.videoInputContainer) {
        DOMElements.videoInputContainer.style.display = 'block';
    }
    
    // Show back button
    if (DOMElements.backButton) {
        DOMElements.backButton.style.display = 'block';
    }
}

function showChatMode() {
    if (!DOMElements) return;
    
    // Hide video input and show tabbed interface
    if (DOMElements.videoInputContainer) {
        DOMElements.videoInputContainer.style.display = 'none';
    }
    if (DOMElements.tabbedInterface) {
        DOMElements.tabbedInterface.style.display = 'flex';
    }
    
    // Show back button when in chat mode
    if (DOMElements.backButton) {
        DOMElements.backButton.style.display = 'block';
    }
    
    // Update state
    updateState({ chatActive: true });
}

function showBlogQuerySection() {
    console.log('Showing BlogQuery section');
    
    // Hide all sections
    if (DOMElements.selectionSection) {
        DOMElements.selectionSection.style.display = 'none';
    }
    if (DOMElements.videoMindSection) {
        DOMElements.videoMindSection.style.display = 'none';
        DOMElements.videoMindSection.classList.remove('active');
    }
    
    // Show BlogQuery section
    if (DOMElements.blogQuerySection) {
        DOMElements.blogQuerySection.style.display = 'block';
    }
    
    // Show back button
    if (DOMElements.backButton) {
        DOMElements.backButton.style.display = 'block';
    }
}

function showSelection() {
    // Reset to initial state
    resetUI();
    
    // Show selection section and hide video mind section
    if (DOMElements.selectionSection) {
        DOMElements.selectionSection.style.display = 'block';
    }
    if (DOMElements.videoMindSection) {
        DOMElements.videoMindSection.style.display = 'none';
        DOMElements.videoMindSection.classList.remove('active');
    }
    if (DOMElements.blogQuerySection) {
        DOMElements.blogQuerySection.style.display = 'none';
    }
    
    // Hide tabbed interface
    if (DOMElements.tabbedInterface) {
        DOMElements.tabbedInterface.style.display = 'none';
    }
    
    // Reset chat state
    updateState({ 
        chatActive: false, 
        isProcessing: false,
        hasTranscript: false,
        videoId: ''
    });
    
    // Clear video input
    if (DOMElements.videoIdInput) {
        DOMElements.videoIdInput.value = '';
    }
    
    // Hide transcript status and footer
    hideTranscriptStatus();
    hideFooter();
    
    // Reset all quiz/mindmap displays
    resetChatInterface();
    
    // Hide back button since we're now at the selection screen
    if (DOMElements.backButton) {
        DOMElements.backButton.style.display = 'none';
    }
}

// Export functions for use in other scripts
window.processVideo = processVideo;
window.handleTranscriptError = (error) => {
    DOMElements.errorMessage.textContent = error;
    DOMElements.errorMessage.style.display = 'block';
    updateState({ chatActive: false });
};

// Update UI for chat mode
function updateUIForChat() {
    if (!DOMElements) return;

    try {
        // Hide video input container
        if (DOMElements.videoInputContainer) {
            DOMElements.videoInputContainer.style.display = 'none';
        }

        // Show chat container and input
        if (DOMElements.chatContainer) {
            DOMElements.chatContainer.style.display = 'block';
            DOMElements.chatContainer.innerHTML = ''; // Clear any existing messages
        }
        if (DOMElements.chatInputContainer) {
            DOMElements.chatInputContainer.style.display = 'block';
        }

        // Enable chat input and send button
        if (DOMElements.questionInput) {
            DOMElements.questionInput.disabled = false;
            DOMElements.questionInput.value = ''; // Clear any existing input
        }
        if (DOMElements.sendButton) {
            DOMElements.sendButton.disabled = false;
        }

        // Add initial assistant message
        appendMessage('assistant', "I've processed the video. What would you like to know?");
    } catch (error) {
        console.error('Error updating UI for chat:', error);
        showNotification('Error updating UI. Please refresh the page.', 'error');
    }
}

// -- BLOG PROCESSING FUNCTIONS --

function validateBlogUrl(url) {
    if (!url) return false;
    
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

function updateBlogValidationUI(isValid, message = '') {
    if (!DOMElements) return;
    
    if (isValid) {
        DOMElements.blogUrlValid?.classList.remove('d-none');
        DOMElements.blogUrlInvalid?.classList.add('d-none');
        DOMElements.blogUrlError?.classList.add('d-none');
    } else {
        DOMElements.blogUrlValid?.classList.add('d-none');
        DOMElements.blogUrlInvalid?.classList.remove('d-none');
        if (message) {
            DOMElements.blogUrlError?.classList.remove('d-none');
            const errorMessage = DOMElements.blogUrlError?.querySelector('.error-message');
            if (errorMessage) {
                errorMessage.textContent = message;
            }
        }
    }
}

function resetBlogValidation() {
    if (!DOMElements) return;
    
    DOMElements.blogUrlValid?.classList.add('d-none');
    DOMElements.blogUrlInvalid?.classList.add('d-none');
    DOMElements.blogUrlError?.classList.add('d-none');
}

function handleBlogUrlChange() {
    if (!DOMElements?.blogUrlInput) return;
    
    const url = DOMElements.blogUrlInput.value.trim();
    state.blogUrl = url;
    
    resetBlogValidation();
    
    if (url) {
        const isValid = validateBlogUrl(url);
        updateBlogValidationUI(isValid, isValid ? '' : 'Please enter a valid blog URL');
    }
    
    render();
}

function updateBlogContentStatus(hasContent) {
    if (!DOMElements?.blogContentStatus) return;
    
    const statusElement = DOMElements.blogContentStatus;
    const statusText = statusElement.querySelector('.status-text');
    
    if (hasContent) {
        statusElement.style.display = 'block';
        statusElement.className = 'transcript-status available';
        if (statusText) {
            statusText.textContent = 'Blog Content Available';
        }
    } else {
        statusElement.style.display = 'none';
    }
}

function updateBlogFooter(hasContent) {
    if (!DOMElements?.blogFooterModeStatus) return;
    
    const footerStatus = DOMElements.blogFooterModeStatus;
    const icon = footerStatus.querySelector('i');
    
    if (hasContent) {
        footerStatus.innerHTML = '<i class="bi bi-check-circle-fill"></i> Blog Content Mode';
        if (icon) icon.className = 'bi bi-check-circle-fill';
    } else {
        footerStatus.innerHTML = '<i class="bi bi-robot"></i> General AI Mode';
        if (icon) icon.className = 'bi bi-robot';
    }
    
    if (DOMElements.blogFooter) {
        DOMElements.blogFooter.style.display = 'block';
    }
}

function updateBlogMindmapTab(hasContent) {
    if (!DOMElements) return;
    
    if (hasContent) {
        DOMElements.blogMindmapNoContent?.style.setProperty('display', 'none');
        DOMElements.blogMindmapAvailable?.style.setProperty('display', 'block');
    } else {
        DOMElements.blogMindmapNoContent?.style.setProperty('display', 'block');
        DOMElements.blogMindmapAvailable?.style.setProperty('display', 'none');
    }
}

function updateBlogQuizTab(hasContent) {
    if (!DOMElements) return;
    
    if (hasContent) {
        DOMElements.blogQuizNoContent?.style.setProperty('display', 'none');
        DOMElements.blogQuizAvailable?.style.setProperty('display', 'block');
    } else {
        DOMElements.blogQuizNoContent?.style.setProperty('display', 'block');
        DOMElements.blogQuizAvailable?.style.setProperty('display', 'none');
    }
}

async function processBlog(event) {
    if (event) {
        event.preventDefault();
    }

    if (!state.blogUrl || !state.apiKey) {
        showNotification('Please enter a blog URL and API key', 'warning');
        return;
    }

    if (!validateBlogUrl(state.blogUrl)) {
        showNotification('Please enter a valid blog URL', 'error');
        return;
    }

    updateState({ isProcessing: true });
    
    // Show loading state on the process button
    const processButton = DOMElements.processBlogButton;
    const originalButtonText = processButton ? processButton.innerHTML : '';
    
    if (processButton) {
        processButton.disabled = true;
        processButton.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Processing Blog...
        `;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/process_content`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content_id: state.blogUrl,
                content_type: 'blog',
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature
            })
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
            // Update state with blog processing results
            updateState({ 
                hasContent: data.has_content,
                chatActive: true
            });
            
            showNotification(data.message, 'success');
            
            // Show blog interface
            showBlogChatInterface();
            
            // Update tabs based on content availability
            updateBlogMindmapTab(data.has_content);
            updateBlogQuizTab(data.has_content);
            updateBlogContentStatus(data.has_content);
            updateBlogFooter(data.has_content);
            
        } else {
            throw new Error(data.error || 'Failed to process blog');
        }
    } catch (error) {
        console.error('Error processing blog:', error);
        showNotification(`Error: ${error.message}`, 'error');
        
        // Still show interface for general AI mode
        showBlogChatInterface();
        updateBlogMindmapTab(false);
        updateBlogQuizTab(false);
        updateBlogContentStatus(false);
        updateBlogFooter(false);
        
        updateState({ 
            hasContent: false,
            chatActive: true
        });
        
    } finally {
        updateState({ isProcessing: false });
        
        // Reset button state
        if (processButton) {
            processButton.disabled = false;
            processButton.innerHTML = originalButtonText;
        }
    }
}

function showBlogChatInterface() {
    if (!DOMElements) return;
    
    // Hide blog input and show tabbed interface
    if (DOMElements.blogInputContainer) {
        DOMElements.blogInputContainer.style.display = 'none';
    }
    if (DOMElements.blogTabbedInterface) {
        DOMElements.blogTabbedInterface.style.display = 'flex';
    }
    
    // Enable blog chat input and send button
    if (DOMElements.blogQuestionInput) {
        DOMElements.blogQuestionInput.disabled = false;
        DOMElements.blogQuestionInput.value = '';
    }
    if (DOMElements.blogSendButton) {
        DOMElements.blogSendButton.disabled = false;
    }
    
    // Clear blog chat container and add initial message
    if (DOMElements.blogChatContainer) {
        DOMElements.blogChatContainer.innerHTML = '';
        appendBlogMessage('assistant', "I've processed the blog article. What would you like to know about it?");
    }
    
    // Initialize blog tabs
    initializeBlogTabs();
    
    // Update state
    updateState({ chatActive: true });
}

function appendBlogMessage(role, content) {
    if (!DOMElements?.blogChatContainer) return;

    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        // Create message header with avatar
        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? 'U' : 'AI';
        
        const userName = document.createElement('span');
        userName.textContent = role === 'user' ? 'You' : 'Assistant';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'message-time';
        timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (role === 'user') {
            messageHeader.appendChild(timestamp);
            messageHeader.appendChild(userName);
            messageHeader.appendChild(avatar);
        } else {
            messageHeader.appendChild(avatar);
            messageHeader.appendChild(userName);
            messageHeader.appendChild(timestamp);
        }
        
        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Format the content for better readability
        if (role === 'assistant') {
            messageContent.innerHTML = formatAIResponse(content);
        } else {
            messageContent.textContent = content;
        }
        
        // Append elements
        messageDiv.appendChild(messageHeader);
        messageDiv.appendChild(messageContent);
        DOMElements.blogChatContainer.appendChild(messageDiv);
        
        // Smooth scroll to bottom
        setTimeout(() => {
            DOMElements.blogChatContainer.scrollTop = DOMElements.blogChatContainer.scrollHeight;
        }, 100);
    } catch (error) {
        console.error('Error appending blog message:', error);
    }
}

function initializeBlogTabs() {
    if (!DOMElements) return;
    
    console.log('🔧 Initializing blog tabs...');
    
    // Get all blog tab headers
    const blogTabHeaders = document.querySelectorAll('#blogQuerySection .tab-header');
    console.log(`Found ${blogTabHeaders.length} blog tab headers`);
    
    if (blogTabHeaders.length === 0) {
        console.warn('⚠️ No blog tab headers found');
        return;
    }
    
    // Remove existing event listeners to prevent duplicates
    blogTabHeaders.forEach((header, index) => {
        // Remove all existing click listeners by cloning
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
    });
    
    // Re-select headers after cloning and add fresh event listeners
    const freshTabHeaders = document.querySelectorAll('#blogQuerySection .tab-header');
    
    freshTabHeaders.forEach((header, index) => {
        const tabId = header.getAttribute('data-tab');
        console.log(`Setting up tab ${index + 1}: ${tabId}`);
        
        // Add click event listener
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`🔄 Switching to tab: ${tabId}`);
            switchBlogTab(tabId);
        });
        
        // Add hover effect and cursor
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
        
        // Ensure tab is clickable
        header.style.pointerEvents = 'auto';
    });
    
    // Ensure the current active tab is properly displayed
    const activeHeader = document.querySelector('#blogQuerySection .tab-header.active');
    if (activeHeader) {
        const activeTabId = activeHeader.getAttribute('data-tab');
        console.log(`🎯 Ensuring active tab is displayed: ${activeTabId}`);
        switchBlogTab(activeTabId);
    } else {
        // If no active tab, activate the first one
        const firstHeader = document.querySelector('#blogQuerySection .tab-header');
        if (firstHeader) {
            const firstTabId = firstHeader.getAttribute('data-tab');
            console.log(`🎯 No active tab found, activating first tab: ${firstTabId}`);
            switchBlogTab(firstTabId);
        }
    }
    
    // Force visibility of the tab container with enhanced stability
    const tabsContainer = document.querySelector('#blogQuerySection .tab-headers');
    if (tabsContainer) {
        tabsContainer.style.display = 'flex !important';
        tabsContainer.style.visibility = 'visible !important';
        tabsContainer.style.position = 'sticky';
        tabsContainer.style.top = '0';
        tabsContainer.style.zIndex = '1000';
        tabsContainer.style.backgroundColor = 'var(--card-bg)';
        tabsContainer.style.minHeight = '56px';
        tabsContainer.style.flexShrink = '0';
        tabsContainer.style.width = '100%';
        tabsContainer.style.boxSizing = 'border-box';
    }
    
    console.log('✅ Blog tabs initialized successfully');
}

function switchBlogTab(tabId) {
    if (!DOMElements) return;
    
    console.log(`🔄 Switching to blog tab: ${tabId}`);
    
    // Update tab headers
    const blogTabHeaders = document.querySelectorAll('#blogQuerySection .tab-header');
    console.log(`Found ${blogTabHeaders.length} tab headers for switching`);
    
    blogTabHeaders.forEach(header => {
        header.classList.remove('active');
        header.style.pointerEvents = 'auto'; // Ensure clickable
        if (header.getAttribute('data-tab') === tabId) {
            header.classList.add('active');
            console.log(`✅ Activated header for tab: ${tabId}`);
        }
    });
    
    // Update tab content
    const blogTabPanes = document.querySelectorAll('#blogQuerySection .tab-pane');
    console.log(`Found ${blogTabPanes.length} tab panes for switching`);
    
    blogTabPanes.forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none'; // Explicitly hide
        pane.style.visibility = 'hidden'; // Additional hiding
    });
    
    const activePane = document.getElementById(`${tabId}-tab`);
    if (activePane) {
        activePane.classList.add('active');
        activePane.style.display = 'flex'; // Explicitly show
        activePane.style.visibility = 'visible'; // Additional showing
        console.log(`✅ Activated pane for tab: ${tabId}`);
        
        // Force a reflow to ensure proper display
        activePane.offsetHeight;
    } else {
        console.error(`❌ Could not find pane for tab: ${tabId}`);
        console.log('Available pane IDs:', Array.from(blogTabPanes).map(p => p.id));
    }
    
    // Ensure the tabbed interface is visible
    const tabbedInterface = document.getElementById('blog-tabbed-interface');
    if (tabbedInterface) {
        tabbedInterface.style.display = 'flex';
        tabbedInterface.style.visibility = 'visible';
    }
    
    // Ensure tab headers remain visible and sticky with enhanced stability
    const tabHeaders = document.querySelector('#blogQuerySection .tab-headers');
    if (tabHeaders) {
        tabHeaders.style.display = 'flex !important';
        tabHeaders.style.visibility = 'visible !important';
        tabHeaders.style.position = 'sticky';
        tabHeaders.style.top = '0';
        tabHeaders.style.zIndex = '1000';
        tabHeaders.style.minHeight = '56px';
        tabHeaders.style.flexShrink = '0';
        tabHeaders.style.width = '100%';
        tabHeaders.style.boxSizing = 'border-box';
    }
    
    console.log(`✅ Tab switch completed: ${tabId}`);
}

async function handleBlogQuestion() {
    if (!DOMElements?.blogQuestionInput) return;
    
    const question = DOMElements.blogQuestionInput.value.trim();
    if (!question) return;
    
    // Clear input
    DOMElements.blogQuestionInput.value = '';
    
    // Add user message
    appendBlogMessage('user', question);
    
    // Show typing indicator
    showBlogTypingIndicator();
    
    try {
        updateState({ isProcessing: true });
        
        const response = await fetch(`${BACKEND_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                content_id: state.blogUrl,
                content_type: 'blog',
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.answer) {
            appendBlogMessage('assistant', data.answer);
        } else {
            throw new Error(data.error || 'Failed to get response');
        }
    } catch (error) {
        console.error('Error getting blog response:', error);
        appendBlogMessage('assistant', 'Sorry, I encountered an error processing your question. Please try again.');
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        hideBlogTypingIndicator();
        updateState({ isProcessing: false });
    }
}

function showBlogTypingIndicator() {
    if (!DOMElements?.blogChatContainer) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator';
    typingDiv.id = 'blog-typing-indicator';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    
    const userName = document.createElement('span');
    userName.textContent = 'Assistant';
    
    messageHeader.appendChild(avatar);
    messageHeader.appendChild(userName);
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    
    typingDiv.appendChild(messageHeader);
    typingDiv.appendChild(messageContent);
    DOMElements.blogChatContainer.appendChild(typingDiv);
    
    // Scroll to bottom
    DOMElements.blogChatContainer.scrollTop = DOMElements.blogChatContainer.scrollHeight;
}

function hideBlogTypingIndicator() {
    const typingIndicator = document.getElementById('blog-typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

async function generateBlogMindmap() {
    if (!DOMElements?.generateBlogMindmapBtn) return;
    
    const button = DOMElements.generateBlogMindmapBtn;
    const originalText = button.innerHTML;
    
    try {
        // Show loading state
        button.disabled = true;
        button.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Generating...
        `;
        
        const response = await fetch(`${BACKEND_URL}/generate_mindmap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content_id: state.blogUrl, // Using blogUrl as content identifier
                content_type: 'blog', // Specify blog content type
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            displayBlogMindmap(data.mindmap);
            showNotification('Mindmap generated successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to generate mindmap');
        }
    } catch (error) {
        console.error('Error generating blog mindmap:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Reset button
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

function displayBlogMindmap(mindmapData) {
    if (!DOMElements?.blogMindmapContent) return;
    
    // Hide the header and generate button sections
    const mindmapHeader = document.querySelector('#blog-mindmap-tab .mindmap-header');
    const mindmapAvailable = document.querySelector('#blog-mindmap-tab .mindmap-available');
    const mindmapNoContent = document.querySelector('#blog-mindmap-tab .no-transcript-message');
    
    if (mindmapHeader) mindmapHeader.style.display = 'none';
    if (mindmapAvailable) mindmapAvailable.style.display = 'none';
    if (mindmapNoContent) mindmapNoContent.style.display = 'none';
    
    // Show the mindmap content section only (actions are now combined with zoom controls)
    DOMElements.blogMindmapContent.style.display = 'block';
    // Hide separate actions since they're now integrated
    if (DOMElements.blogMindmapActions) {
        DOMElements.blogMindmapActions.style.display = 'none';
    }
    
    // Create a unique ID for this mermaid diagram
    const diagramId = `blog-mermaid-${Date.now()}`;
    
    // Set the mindmap content with combined controls below
    DOMElements.blogMindmapContent.innerHTML = `
        <div class="mermaid-container">
            <div class="mermaid-viewport">
                <div id="${diagramId}" class="mermaid-diagram">${mindmapData}</div>
            </div>
        </div>
        <div class="mermaid-controls-combined">
            <button class="mermaid-control-btn regenerate-btn" title="Regenerate Mindmap">
                <i class="bi bi-arrow-clockwise"></i>
                <span>Regenerate</span>
            </button>
            
            <div class="zoom-controls-group">
                <button class="mermaid-control-btn zoom-out-btn" title="Zoom Out">
                    <i class="bi bi-dash"></i>
                </button>
                <button class="mermaid-control-btn reset-zoom-btn" title="Reset Zoom">100%</button>
                <button class="mermaid-control-btn zoom-in-btn" title="Zoom In">
                    <i class="bi bi-plus"></i>
                </button>
            </div>
            
            <button class="mermaid-control-btn download-btn" title="Download Mindmap">
                <i class="bi bi-download"></i>
                <span>Download</span>
            </button>
        </div>
    `;
    
    // Render Mermaid diagram
    renderMermaidDiagram(diagramId, mindmapData);
    
    // Add zoom and pan functionality after rendering
    setTimeout(() => {
        addMindmapInteractivity(diagramId);
    }, 500);
    
    // Re-initialize tabs to ensure navigation works (with longer delay)
    setTimeout(() => {
        console.log('🔄 Re-initializing blog tabs after mindmap generation...');
        initializeBlogTabs();
        // Force tab visibility again with enhanced stability
        const tabsContainer = document.querySelector('#blogQuerySection .tab-headers');
        if (tabsContainer) {
            tabsContainer.style.display = 'flex !important';
            tabsContainer.style.visibility = 'visible !important';
            tabsContainer.style.position = 'sticky';
            tabsContainer.style.top = '0';
            tabsContainer.style.zIndex = '1000';
            tabsContainer.style.minHeight = '56px';
            tabsContainer.style.flexShrink = '0';
            tabsContainer.style.width = '100%';
            tabsContainer.style.boxSizing = 'border-box';
        }
    }, 1000);
    
    // Scroll to the mindmap content
    DOMElements.blogMindmapContent.scrollIntoView({ behavior: 'smooth' });
}

// Helper function to render Mermaid diagrams
function renderMermaidDiagram(diagramId, mermaidCode) {
    console.log(`🎨 Attempting to render Mermaid diagram: ${diagramId}`);
    
    const element = document.getElementById(diagramId);
    if (!element) {
        console.error('❌ Diagram element not found:', diagramId);
        return;
    }

    console.log('📊 Mermaid code to render:', mermaidCode.substring(0, 100) + '...');

    if (typeof mermaid !== 'undefined') {
        try {
            console.log('✅ Mermaid library available, rendering...');
            console.log('Mermaid methods available:', Object.keys(mermaid));
            
            // Check if we have the render method (v10+) or need to use older API
            if (mermaid.render && typeof mermaid.render === 'function') {
                console.log('Checking mermaid.render() method...');
                const svgId = `${diagramId}-svg`;
                
                try {
                    // Try v10+ Promise-based API first
                    const result = mermaid.render(svgId, mermaidCode);
                    if (result && typeof result.then === 'function') {
                        console.log('Using mermaid.render() Promise API (v10+)');
                        result.then(({ svg }) => {
                            console.log('✅ Mermaid diagram rendered successfully with Promise API');
                            element.innerHTML = svg;
                            
                            // Add some styling to the rendered SVG
                            const svgElement = element.querySelector('svg');
                            if (svgElement) {
                                svgElement.style.maxWidth = '100%';
                                svgElement.style.height = 'auto';
                            }
                            
                            // Apply black text styling
                            applyBlackTextStyling(element);
                        }).catch(error => {
                            console.error('❌ Error rendering with Promise API:', error);
                            console.log('📝 Falling back to text format');
                            showMermaidFallback(element, mermaidCode);
                        });
                    } else {
                        // v9 callback-based render method
                        console.log('Using mermaid.render() callback API (v9)');
                        mermaid.render(svgId, mermaidCode, (svg) => {
                            console.log('✅ Mermaid diagram rendered successfully with callback API');
                            element.innerHTML = svg;
                            
                            // Add some styling to the rendered SVG
                            const svgElement = element.querySelector('svg');
                            if (svgElement) {
                                svgElement.style.maxWidth = '100%';
                                svgElement.style.height = 'auto';
                            }
                            
                            // Apply black text styling
                            applyBlackTextStyling(element);
                        });
                    }
                } catch (error) {
                    console.error('❌ Error with mermaid.render():', error);
                    console.log('📝 Trying mermaidAPI fallback');
                    // Fall through to mermaidAPI
                    if (mermaid.mermaidAPI && mermaid.mermaidAPI.render) {
                        console.log('Using mermaidAPI.render() method (v9 fallback)');
                        mermaid.mermaidAPI.render(svgId, mermaidCode, (svg) => {
                            console.log('✅ Mermaid diagram rendered successfully with mermaidAPI fallback');
                            element.innerHTML = svg;
                            
                            // Add some styling to the rendered SVG
                            const svgElement = element.querySelector('svg');
                            if (svgElement) {
                                svgElement.style.maxWidth = '100%';
                                svgElement.style.height = 'auto';
                            }
                        });
                    } else {
                        showMermaidFallback(element, mermaidCode);
                    }
                }
            } else if (mermaid.mermaidAPI && mermaid.mermaidAPI.render) {
                console.log('Using mermaidAPI.render() method (v9)');
                const svgId = `${diagramId}-svg`;
                
                mermaid.mermaidAPI.render(svgId, mermaidCode, (svg) => {
                    console.log('✅ Mermaid diagram rendered successfully with mermaidAPI');
                    element.innerHTML = svg;
                    
                    // Add some styling to the rendered SVG
                    const svgElement = element.querySelector('svg');
                    if (svgElement) {
                        svgElement.style.maxWidth = '100%';
                        svgElement.style.height = 'auto';
                    }
                });
            } else {
                console.warn('⚠️ No suitable render method found');
                console.log('Available methods:', Object.keys(mermaid));
                showMermaidFallback(element, mermaidCode);
            }
            
        } catch (error) {
            console.error('❌ Error with Mermaid rendering:', error);
            console.error('Error stack:', error.stack);
            console.log('📝 Falling back to text format');
            showMermaidFallback(element, mermaidCode);
        }
    } else {
        console.warn('⚠️ Mermaid library not loaded, showing text format');
        showMermaidFallback(element, mermaidCode);
    }
}

// Helper function to show fallback when Mermaid fails
function showMermaidFallback(element, mermaidCode) {
    element.innerHTML = `
        <div class="mermaid-fallback">
            <h6>Mindmap Content:</h6>
            <pre class="mindmap-text">${mermaidCode}</pre>
            <p class="text-muted"><small>Note: Visual diagram rendering failed. Showing text format.</small></p>
        </div>
    `;
}

async function generateBlogQuiz() {
    if (!DOMElements?.generateBlogQuizBtn) return;
    
    const button = DOMElements.generateBlogQuizBtn;
    const originalText = button.innerHTML;
    
    try {
        // Show loading state
        button.disabled = true;
        button.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Generating...
        `;
        
        const response = await fetch(`${BACKEND_URL}/generate_blog_quiz`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                blog_url: state.blogUrl, // Using blogUrl as content identifier
                api_key: state.apiKey,
                model_name: state.modelName,
                temperature: state.temperature
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            displayBlogQuiz(data.quiz);
            showNotification('Quiz generated successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to generate quiz');
        }
    } catch (error) {
        console.error('Error generating blog quiz:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Reset button
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

function displayBlogQuiz(quizData) {
    if (!DOMElements?.blogQuizDisplay || !DOMElements?.blogQuizQuestions) return;
    
    try {
        // quizData is already an object, no need to parse
        const questions = quizData.questions;
        
        // Clear existing questions
        DOMElements.blogQuizQuestions.innerHTML = '';
        
        // Generate HTML for each question
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'quiz-question';
            questionDiv.innerHTML = `
                <div class="question-header">
                    <span class="question-number">Question ${index + 1}</span>
                </div>
                <div class="question-text">${q.question}</div>
                <div class="question-options">
                    ${q.options.map((option, optIndex) => `
                        <label class="option-label">
                            <input type="radio" name="q${index}" value="${optIndex}" data-question="${index}">
                            <span class="option-text">${option}</span>
                        </label>
                    `).join('')}
                </div>
            `;
            DOMElements.blogQuizQuestions.appendChild(questionDiv);
        });
        
        // Store quiz data for later use
        window.currentBlogQuiz = questions;
        
        // Show the quiz display section
        DOMElements.blogQuizDisplay.style.display = 'block';
        
        // Add event listeners for quiz form
        if (DOMElements.blogQuizForm) {
            DOMElements.blogQuizForm.addEventListener('submit', submitBlogQuiz);
        }
        
        // Re-initialize tabs to ensure navigation works (with longer delay)
        setTimeout(() => {
            console.log('🔄 Re-initializing blog tabs after quiz generation...');
            initializeBlogTabs();
            // Force tab visibility again with enhanced stability
            const tabsContainer = document.querySelector('#blogQuerySection .tab-headers');
            if (tabsContainer) {
                tabsContainer.style.display = 'flex !important';
                tabsContainer.style.visibility = 'visible !important';
                tabsContainer.style.position = 'sticky';
                tabsContainer.style.top = '0';
                tabsContainer.style.zIndex = '1000';
                tabsContainer.style.minHeight = '56px';
                tabsContainer.style.flexShrink = '0';
                tabsContainer.style.width = '100%';
                tabsContainer.style.boxSizing = 'border-box';
            }
        }, 1000);
        
        // Scroll to the quiz
        DOMElements.blogQuizDisplay.scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error displaying blog quiz:', error);
        showNotification('Error displaying quiz. Please try generating again.', 'error');
    }
}

function submitBlogQuiz(event) {
    event.preventDefault();
    
    if (!window.currentBlogQuiz || !DOMElements?.blogQuizForm) return;
    
    const formData = new FormData(DOMElements.blogQuizForm);
    const answers = {};
    
    // Collect answers
    for (let [key, value] of formData.entries()) {
        answers[key] = parseInt(value);
    }
    
    // Calculate score
    let correctCount = 0;
    const results = [];
    
    window.currentBlogQuiz.forEach((question, index) => {
        const userAnswer = answers[`q${index}`];
        const isCorrect = userAnswer === question.correct;
        
        if (isCorrect) correctCount++;
        
        results.push({
            question: question.question,
            userAnswer: userAnswer,
            correctAnswer: question.correct,
            isCorrect: isCorrect,
            options: question.options
        });
    });
    
    displayBlogQuizResults(correctCount, window.currentBlogQuiz.length, results);
}

function displayBlogQuizResults(correctCount, totalCount, results) {
    if (!DOMElements?.blogQuizResults) return;
    
    const percentage = Math.round((correctCount / totalCount) * 100);
    
    // Update score display
    const scorePercentage = document.getElementById('blog-score-percentage');
    const scoreFraction = document.getElementById('blog-score-fraction');
    const scoreTitle = document.getElementById('blog-score-title');
    const scoreDescription = document.getElementById('blog-score-description');
    
    if (scorePercentage) scorePercentage.textContent = `${percentage}%`;
    if (scoreFraction) scoreFraction.textContent = `${correctCount}/${totalCount}`;
    
    // Set title and description based on performance
    let title, description;
    if (percentage >= 90) {
        title = 'Excellent!';
        description = 'Outstanding performance! You have mastered this content.';
    } else if (percentage >= 80) {
        title = 'Great Job!';
        description = 'Very good understanding of the material.';
    } else if (percentage >= 70) {
        title = 'Good Work!';
        description = 'Solid grasp of the concepts with room for improvement.';
    } else if (percentage >= 60) {
        title = 'Keep Trying!';
        description = 'You\'re getting there. Review the material and try again.';
    } else {
        title = 'Study More!';
        description = 'Consider reviewing the content more thoroughly.';
    }
    
    if (scoreTitle) scoreTitle.textContent = title;
    if (scoreDescription) scoreDescription.textContent = description;
    
    // Show results
    DOMElements.blogQuizResults.style.display = 'block';
    
    // Scroll to results
    DOMElements.blogQuizResults.scrollIntoView({ behavior: 'smooth' });
    
    // Show retake options
    if (DOMElements.retakeBlogQuizBtn) {
        DOMElements.retakeBlogQuizBtn.style.display = 'inline-block';
        DOMElements.retakeBlogQuizBtn.onclick = retakeBlogQuiz;
    }
    if (DOMElements.newBlogQuizBtn) {
        DOMElements.newBlogQuizBtn.style.display = 'inline-block';
        DOMElements.newBlogQuizBtn.onclick = () => {
            DOMElements.blogQuizDisplay.style.display = 'none';
            DOMElements.blogQuizResults.style.display = 'none';
        };
    }
}

function retakeBlogQuiz() {
    if (!DOMElements) return;
    
    // Hide results
    if (DOMElements.blogQuizResults) {
        DOMElements.blogQuizResults.style.display = 'none';
    }
    
    // Clear all radio button selections
    const radioButtons = DOMElements.blogQuizQuestions?.querySelectorAll('input[type="radio"]');
    radioButtons?.forEach(radio => {
        radio.checked = false;
    });
    
    // Hide action buttons
    if (DOMElements.retakeBlogQuizBtn) {
        DOMElements.retakeBlogQuizBtn.style.display = 'none';
    }
    if (DOMElements.newBlogQuizBtn) {
        DOMElements.newBlogQuizBtn.style.display = 'none';
    }
    
    // Scroll back to quiz
    if (DOMElements.blogQuizQuestions) {
        DOMElements.blogQuizQuestions.scrollIntoView({ behavior: 'smooth' });
    }
}

// -- END BLOG FUNCTIONS -- 

// Initialize Mermaid when the page loads
function initializeMermaid() {
    console.log('Starting Mermaid initialization...');
    
    // Wait for Mermaid to be available
    const checkMermaid = () => {
        if (typeof mermaid !== 'undefined') {
            try {
                console.log('Mermaid library detected, initializing...');
                console.log('Mermaid version:', mermaid.version || 'Unknown');
                console.log('Available methods:', Object.keys(mermaid));
                
                // Initialize with simpler config for older version
                mermaid.initialize({
                    startOnLoad: false,
                    theme: document.body.classList.contains('light-theme') ? 'default' : 'dark',
                    flowchart: {
                        useMaxWidth: true,
                        htmlLabels: true
                    },
                    securityLevel: 'loose'
                });
                console.log('✅ Mermaid initialized successfully');
                return true;
            } catch (error) {
                console.error('❌ Error initializing Mermaid:', error);
                console.error('Error details:', error.stack);
                return false;
            }
        }
        console.log('Mermaid not yet available, waiting...');
        return false;
    };

    // Try to initialize immediately
    if (checkMermaid()) {
        return;
    }

    // If not available, wait for it to load
    let attempts = 0;
    const maxAttempts = 30; // More attempts
    const checkInterval = setInterval(() => {
        attempts++;
        console.log(`Mermaid check attempt ${attempts}/${maxAttempts}`);
        
        if (checkMermaid()) {
            clearInterval(checkInterval);
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('❌ Mermaid library failed to load after maximum attempts');
            console.log('Available globals:', Object.keys(window).filter(key => key.toLowerCase().includes('mermaid')));
            console.log('Window.mermaid type:', typeof window.mermaid);
        }
    }, 300); // Longer interval
}

// Mindmap zoom and download functionality
const mindmapZoomLevels = new Map(); // Track zoom per diagram

function zoomMindmap(diagramId, factor) {
    const diagram = document.getElementById(diagramId);
    if (!diagram) return;
    
    // Get current zoom for this diagram
    let currentZoom = mindmapZoomLevels.get(diagramId) || 1;
    
    if (factor === 0.5) {
        // Zoom out
        currentZoom = Math.max(0.1, currentZoom * 0.8);
    } else if (factor === 2) {
        // Zoom in
        currentZoom = Math.min(10, currentZoom * 1.25);
    }
    
    // Store zoom level for this diagram
    mindmapZoomLevels.set(diagramId, currentZoom);
    
    // Get current transform to preserve pan position
    const currentTransform = diagram.style.transform;
    const translateMatch = currentTransform.match(/translate\(([^)]+)\)/);
    const translatePart = translateMatch ? translateMatch[0] : 'translate(0px, 0px)';
    
    // Apply zoom with smooth transition while preserving pan
    diagram.classList.add('zooming');
    diagram.style.transform = `scale(${currentZoom}) ${translatePart}`;
    
    // Remove transition class after animation
    setTimeout(() => {
        diagram.classList.remove('zooming');
    }, 100);
    
    // Update zoom display
    const container = diagram.closest('.mermaid-container');
    const resetBtn = container?.querySelector('.reset-zoom-btn');
    if (resetBtn) {
        resetBtn.textContent = `${Math.round(currentZoom * 100)}%`;
        resetBtn.classList.toggle('active', currentZoom !== 1);
    }
    
    console.log(`🔍 Mindmap zoom (${diagramId}): ${Math.round(currentZoom * 100)}%`);
}

function resetZoomMindmap(diagramId) {
    const diagram = document.getElementById(diagramId);
    if (!diagram) return;
    
    // Reset zoom for this diagram
    mindmapZoomLevels.set(diagramId, 1);
    
    // Apply reset with smooth transition (reset both zoom and pan)
    diagram.classList.add('zooming');
    diagram.style.transform = 'scale(1) translate(0px, 0px)';
    
    // Remove transition class after animation
    setTimeout(() => {
        diagram.classList.remove('zooming');
    }, 100);
    
    // Update zoom display
    const container = diagram.closest('.mermaid-container');
    const resetBtn = container?.querySelector('.reset-zoom-btn');
    if (resetBtn) {
        resetBtn.textContent = '100%';
        resetBtn.classList.remove('active');
    }
    
    console.log(`🔍 Mindmap zoom reset to 100% (${diagramId})`);
}

function downloadMindmap(diagramId, filename = 'mindmap') {
    console.log(`📥 Downloading mindmap: ${diagramId}`);
    
    const diagram = document.getElementById(diagramId);
    if (!diagram) {
        console.error('❌ Diagram not found for download');
        showNotification('Error: Mindmap not found', 'error');
        return;
    }
    
    const svg = diagram.querySelector('svg');
    if (!svg) {
        console.error('❌ SVG not found in diagram');
        showNotification('Error: No diagram to download', 'error');
        return;
    }
    
    try {
        // Clone the SVG to avoid modifying the original
        const svgClone = svg.cloneNode(true);
        
        // Get SVG dimensions
        const svgRect = svg.getBoundingClientRect();
        const width = svgRect.width || 800;
        const height = svgRect.height || 600;
        
        // Set SVG attributes for proper rendering
        svgClone.setAttribute('width', width + 40);
        svgClone.setAttribute('height', height + 40);
        svgClone.setAttribute('viewBox', `0 0 ${width + 40} ${height + 40}`);
        
        // Add white background and black text styling
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = `
            svg { background-color: white; }
            text { fill: black !important; color: black !important; }
            .node text { fill: black !important; }
            .edgeLabel text { fill: black !important; }
            .label text { fill: black !important; }
            * { color: black !important; }
        `;
        defs.appendChild(style);
        svgClone.insertBefore(defs, svgClone.firstChild);
        
        // Add white background rectangle
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', 'white');
        svgClone.insertBefore(bgRect, svgClone.firstChild.nextSibling);
        
        // Convert SVG to string
        const svgData = new XMLSerializer().serializeToString(svgClone);
        
        // Convert to PDF using canvas and jsPDF
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set high resolution for better quality
        const scale = 2;
        canvas.width = (width + 40) * scale;
        canvas.height = (height + 40) * scale;
        ctx.scale(scale, scale);
        
        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width + 40, height + 40);
        
        // Create data URL from SVG
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            try {
                // Draw image to canvas
                ctx.drawImage(img, 20, 20, width, height);
                
                // Convert canvas to image data
                const imageData = canvas.toDataURL('image/png', 1.0);
                
                // Check if jsPDF is available
                if (typeof window.jsPDF !== 'undefined') {
                    try {
                        // Create PDF using jsPDF
                        const { jsPDF } = window.jsPDF;
                        const pdf = new jsPDF({
                            orientation: width > height ? 'landscape' : 'portrait',
                            unit: 'px',
                            format: [width + 80, height + 80]
                        });
                        
                        // Add the image to PDF
                        pdf.addImage(imageData, 'PNG', 20, 20, width + 40, height + 40);
                        
                        // Download the PDF
                        pdf.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`);
                        
                        console.log('✅ Mindmap downloaded successfully as PDF');
                        showNotification('Mindmap downloaded as PDF!', 'success', 3000);
                        
                    } catch (pdfError) {
                        console.error('❌ PDF generation failed, falling back to PNG:', pdfError);
                        // Fallback to PNG download
                        canvas.toBlob(function(blob) {
                            if (blob) {
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
                                
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                
                                URL.revokeObjectURL(url);
                                
                                console.log('✅ Mindmap downloaded successfully as PNG (fallback)');
                                showNotification('Mindmap downloaded as PNG!', 'success', 3000);
                            }
                        }, 'image/png', 1.0);
                    }
                } else {
                    // Fallback to PNG if jsPDF not available
                    canvas.toBlob(function(blob) {
                        if (blob) {
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
                            
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            URL.revokeObjectURL(url);
                            
                            console.log('✅ Mindmap downloaded successfully as PNG');
                            showNotification('Mindmap downloaded as PNG!', 'success', 3000);
                        } else {
                            throw new Error('Failed to create download file');
                        }
                    }, 'image/png', 1.0);
                }
                
            } catch (canvasError) {
                console.error('❌ Canvas conversion failed:', canvasError);
                // Fallback to SVG download
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.svg`;
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                URL.revokeObjectURL(url);
                showNotification('Downloaded as SVG format', 'success', 3000);
            }
        };
        
        img.onerror = function() {
            console.error('❌ Failed to load SVG for conversion');
            // Fallback to direct SVG download
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.svg`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            showNotification('Downloaded as SVG format', 'success', 3000);
        };
        
        img.src = svgDataUrl;
        
    } catch (error) {
        console.error('❌ Error downloading mindmap:', error);
        showNotification('Error: Failed to download mindmap', 'error');
    }
}

function addMindmapInteractivity(diagramId) {
    const diagram = document.getElementById(diagramId);
    const viewport = diagram?.closest('.mermaid-viewport');
    const container = diagram?.closest('.mermaid-container');
    
    if (!diagram || !viewport || !container) return;
    
    // Initialize zoom and pan to default values for this diagram
    mindmapZoomLevels.set(diagramId, 1);
    diagram.style.transform = 'scale(1) translate(0px, 0px)';
    
    // Add event listeners for control buttons (check both top and combined controls)
    const zoomOutBtn = container.querySelector('.zoom-out-btn') || document.querySelector('.mermaid-controls-combined .zoom-out-btn');
    const zoomInBtn = container.querySelector('.zoom-in-btn') || document.querySelector('.mermaid-controls-combined .zoom-in-btn');
    const downloadBtn = container.querySelector('.download-btn') || document.querySelector('.mermaid-controls-combined .download-btn');
    const resetBtn = container.querySelector('.reset-zoom-btn') || document.querySelector('.mermaid-controls-combined .reset-zoom-btn');
    const regenerateBtn = document.querySelector('.mermaid-controls-combined .regenerate-btn');
    
    // Update zoom display to show 100%
    if (resetBtn) {
        resetBtn.textContent = '100%';
        resetBtn.classList.remove('active');
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            zoomMindmap(diagramId, 0.5);
        });
    }
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            zoomMindmap(diagramId, 2);
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Reset pan variables
            panX = 0;
            panY = 0;
            resetZoomMindmap(diagramId);
        });
    }
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const filename = diagramId.includes('blog') ? 'blog-mindmap' : 'video-mindmap';
            downloadMindmap(diagramId, filename);
        });
    }
    
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Call the appropriate regenerate function
            if (diagramId.includes('blog')) {
                generateBlogMindmap();
            } else {
                generateMindmap();
            }
        });
    }
    
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let panX = 0;
    let panY = 0;
    
    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        if (e.deltaY < 0) {
            // Zoom in
            zoomMindmap(diagramId, 2);
        } else {
            // Zoom out
            zoomMindmap(diagramId, 0.5);
        }
    });
    
    // Transform-based pan functionality for smooth dragging
    viewport.addEventListener('mousedown', (e) => {
        // Only start panning if not clicking on a control button
        if (e.target.closest('.mermaid-controls')) return;
        
        isPanning = true;
        startX = e.clientX;
        startY = e.clientY;
        viewport.classList.add('dragging');
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        e.preventDefault();
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        panX += deltaX;
        panY += deltaY;
        
        // Apply both zoom and pan transforms
        const currentZoom = mindmapZoomLevels.get(diagramId) || 1;
        diagram.style.transform = `scale(${currentZoom}) translate(${panX}px, ${panY}px)`;
        
        startX = e.clientX;
        startY = e.clientY;
    });
    
    document.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            viewport.classList.remove('dragging');
        }
    });
    
    // Touch support for mobile
    let touchStartX = 0;
    let touchStartY = 0;
    
    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }
    });
    
    viewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;
            
            panX += deltaX;
            panY += deltaY;
            
            // Apply both zoom and pan transforms
            const currentZoom = mindmapZoomLevels.get(diagramId) || 1;
            diagram.style.transform = `scale(${currentZoom}) translate(${panX}px, ${panY}px)`;
            
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }
    });
    
    console.log(`🎮 Added interactivity to mindmap: ${diagramId} (initialized at 100% zoom)`);
}

function applyBlackTextStyling(diagramElement) {
    // Force black text on all text elements
    const textElements = diagramElement.querySelectorAll('text, .nodeLabel, .edgeLabel, .label');
    textElements.forEach(element => {
        element.style.fill = '#000000';
        element.style.color = '#000000';
        element.setAttribute('fill', '#000000');
    });
    
    // Ensure node borders are visible
    const nodeElements = diagramElement.querySelectorAll('.node rect, .node circle, .node polygon');
    nodeElements.forEach(element => {
        element.style.stroke = '#333333';
        element.style.strokeWidth = '2px';
    });
    
    console.log('🎨 Applied black text styling to diagram');
}

// Make functions globally available
window.zoomMindmap = zoomMindmap;
window.resetZoomMindmap = resetZoomMindmap;
window.downloadMindmap = downloadMindmap;
window.addMindmapInteractivity = addMindmapInteractivity;
window.applyBlackTextStyling = applyBlackTextStyling;