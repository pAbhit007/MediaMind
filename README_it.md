# YouTube RAG Assistant Chrome Extension

A Chrome extension that adds an AI-powered question-answering assistant to YouTube videos using RAG (Retrieval-Augmented Generation) technology.

## Features

- Appears as a side panel on YouTube video pages
- Processes video transcripts using Google's Gemini AI
- Allows users to ask questions about video content
- Provides contextual answers based on video content
- Modern and user-friendly interface

## Prerequisites

- Google API key with access to Gemini API
- Python 3.8+ for the backend server
- Chrome browser

## Setup

### Backend Setup

1. Install the required Python packages:
   ```bash
   pip install flask flask-cors google-generativeai langchain-google-genai
   ```

2. Start the backend server:
   ```bash
   python backend.py
   ```

### Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `chrome_plugin` directory
4. Click the extension icon to open the side panel
5. Enter your Google API key in the settings

## Usage

1. Navigate to any YouTube video
2. Click the extension icon to open the side panel
3. The video title will automatically appear in the panel
4. Click "Process Video" to analyze the video content
5. Once processing is complete, you can start asking questions
6. Type your question and click "Send" or press Enter
7. The AI will provide contextual answers based on the video content

## Development

The extension consists of:
- Frontend: HTML, CSS, and JavaScript for the Chrome extension UI
- Backend: Flask server that interfaces with the RAG pipeline
- RAG Pipeline: Python implementation using Gemini and LangChain

## Files

- `manifest.json`: Extension configuration
- `sidepanel.html`: Main UI template
- `styles.css`: UI styling
- `sidepanel.js`: Frontend logic
- `content.js`: YouTube page interaction
- `background.js`: Extension background processes
- `backend.py`: Flask server implementation

## Notes

- The extension requires an active backend server running on `localhost:5000`
- API keys are stored securely in Chrome's local storage
- Video processing may take a few moments depending on length
- The extension works best with videos that have good quality transcripts 