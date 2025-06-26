import sys
import os

# Add the project root directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
from components.rag_pipeline import RAGPipeline
import traceback
import re
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configure CORS properly
CORS(app, resources={
    r"/*": {
        "origins": ["chrome-extension://*", "http://localhost:*", "http://127.0.0.1:*"],
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type"],
        "supports_credentials": True
    }
})

# Store RAG pipelines for each video
video_pipelines = {}

def extract_video_id(video_input: str) -> str:
    """Extract and validate YouTube video ID."""
    logger.debug(f"Extracting video ID from: {video_input}")
    
    if not video_input:
        raise ValueError("No video ID provided")
        
    # If it's already just a video ID
    if len(video_input) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', video_input):
        logger.debug(f"Valid video ID format: {video_input}")
        return video_input
        
    # Try to extract from URL
    patterns = [
        r'(?:v=|v\/|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})',
        r'(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})',
        r'(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})',
        r'(?:youtu\.be\/)([a-zA-Z0-9_-]{11})'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, video_input)
        if match and match.group(1):
            logger.debug(f"Extracted video ID: {match.group(1)}")
            return match.group(1)
    
    raise ValueError("Invalid YouTube video ID or URL")

def get_transcript(video_id: str, language: str = "en") -> str:
    """Get transcript for a video using YouTubeTranscriptApi."""
    logger.debug(f"Fetching transcript for video ID: {video_id}")
    
    try:
        # First validate and extract video ID
        actual_id = extract_video_id(video_id)
        logger.debug(f"Validated video ID: {actual_id}")
        
        try:
            # Try to get the transcript in the specified language
            logger.debug(f"Attempting to get transcript in {language}")
            transcript_list = YouTubeTranscriptApi.get_transcript(
                actual_id, 
                languages=[language]
            )
            if not transcript_list:
                raise Exception("No transcript available")
                
            transcript = " ".join(chunk["text"] for chunk in transcript_list)
            if not transcript or len(transcript.strip()) == 0:
                raise Exception("Empty transcript received")
                
            logger.debug("Successfully fetched transcript")
            return transcript
            
        except Exception as e:
            logger.error(f"Error fetching transcript: {str(e)}")
            raise
            
    except Exception as e:
        logger.error(f"Error in get_transcript: {str(e)}")
        raise

@app.route('/process_content', methods=['POST', 'OPTIONS'])
def process_content():
    """Unified endpoint for processing both video and blog content."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received process_content request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        content_id = data.get('content_id')  # video_id or blog_url
        content_type = data.get('content_type', 'video')  # 'video' or 'blog'
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Processing {content_type} content: {content_id}")
        
        if not content_id or not api_key:
            logger.error("Missing content_id or api_key")
            return jsonify({'error': 'Missing content_id or api_key'}), 400

        if content_type not in ['video', 'blog']:
            logger.error(f"Invalid content_type: {content_type}")
            return jsonify({'error': 'content_type must be "video" or "blog"'}), 400

        # Initialize pipeline
        try:
            logger.debug("Initializing RAG pipeline")
            pipeline = RAGPipeline(
                api_key=api_key,
                model_name=model_name,
                temperature=temperature
            )
            
            # Create pipeline key and store initialized pipeline
            pipeline_key = f"{content_id}_{model_name}_{temperature}"
            
            # Process content based on type
            success = pipeline.process_content(content_id, content_type)
            
            if success:
                logger.debug(f"Pipeline initialized successfully for {content_type}")
                if content_type == 'video':
                    response_message = 'Video processed successfully! You can now ask questions about the video content.'
                else:
                    response_message = 'Blog processed successfully! You can now ask questions about the blog content.'
            else:
                logger.warning(f"Could not process {content_type} content")
                if content_type == 'video':
                    response_message = 'Video identified successfully! Since no transcript is available, I can provide general assistance about the video or topic. Ask me anything!'
                else:
                    response_message = 'Blog identified successfully! Since content could not be processed, I can provide general assistance about the topic. Ask me anything!'
            
            video_pipelines[pipeline_key] = pipeline
            
            return jsonify({
                'success': True,
                'has_content': success,
                'content_type': content_type,
                'message': response_message
            })
            
        except Exception as e:
            logger.error(f"Error initializing pipeline: {str(e)}")
            return jsonify({
                'error': f'Failed to initialize processing pipeline: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in process_content: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/process_video', methods=['POST', 'OPTIONS'])
def process_video():
    """Legacy endpoint for video processing - redirects to unified endpoint."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received process_video request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        video_id = data.get('video_id')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Processing video content: {video_id}")
        
        if not video_id or not api_key:
            logger.error("Missing video_id or api_key")
            return jsonify({'error': 'Missing video_id or api_key'}), 400

        # Initialize pipeline
        try:
            logger.debug("Initializing RAG pipeline")
            pipeline = RAGPipeline(
                api_key=api_key,
                model_name=model_name,
                temperature=temperature
            )
            
            # Create pipeline key and store initialized pipeline
            pipeline_key = f"{video_id}_{model_name}_{temperature}"
            
            # Process video content
            success = pipeline.process_content(video_id, 'video')
            
            if success:
                logger.debug("Pipeline initialized successfully for video")
                response_message = 'Video processed successfully! You can now ask questions about the video content.'
            else:
                logger.warning("Could not process video content")
                response_message = 'Video identified successfully! Since no transcript is available, I can provide general assistance about the video or topic. Ask me anything!'
            
            video_pipelines[pipeline_key] = pipeline
            
            return jsonify({
                'success': True,
                'has_content': success,
                'content_type': 'video',
                'message': response_message
            })
            
        except Exception as e:
            logger.error(f"Error initializing pipeline: {str(e)}")
            return jsonify({
                'error': f'Failed to initialize processing pipeline: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in process_video: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/process_blog', methods=['POST', 'OPTIONS'])
def process_blog():
    """Convenient endpoint for blog processing - uses unified endpoint."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received process_blog request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        blog_url = data.get('blog_url')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Processing blog content: {blog_url}")
        
        if not blog_url or not api_key:
            logger.error("Missing blog_url or api_key")
            return jsonify({'error': 'Missing blog_url or api_key'}), 400

        # Initialize pipeline
        try:
            logger.debug("Initializing RAG pipeline")
            pipeline = RAGPipeline(
                api_key=api_key,
                model_name=model_name,
                temperature=temperature
            )
            
            # Create pipeline key and store initialized pipeline
            pipeline_key = f"{blog_url}_{model_name}_{temperature}"
            
            # Process blog content
            success = pipeline.process_content(blog_url, 'blog')
            
            if success:
                logger.debug("Pipeline initialized successfully for blog")
                response_message = 'Blog processed successfully! You can now ask questions about the blog content.'
            else:
                logger.warning("Could not process blog content")
                response_message = 'Blog identified successfully! Since content could not be processed, I can provide general assistance about the topic. Ask me anything!'
            
            video_pipelines[pipeline_key] = pipeline
            
            return jsonify({
                'success': True,
                'has_content': success,
                'content_type': 'blog',
                'message': response_message
            })
            
        except Exception as e:
            logger.error(f"Error initializing pipeline: {str(e)}")
            return jsonify({
                'error': f'Failed to initialize processing pipeline: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in process_blog: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/query', methods=['POST', 'OPTIONS'])
def query():
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received query request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        # Support both old (video_id) and new (content_id) formats
        content_id = data.get('content_id') or data.get('video_id')
        content_type = data.get('content_type', 'video')
        question = data.get('question')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Processing query for {content_type}: {content_id}")
        
        if not all([content_id, question, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing required parameters'}), 400
            
        # Get pipeline key
        pipeline_key = f"{content_id}_{model_name}_{temperature}"
        
        # Get pipeline
        pipeline = video_pipelines.get(pipeline_key)
        if not pipeline:
            logger.error("No initialized pipeline found")
            content_name = "Video" if content_type == "video" else "Blog"
            return jsonify({
                'error': f'{content_name} not properly processed. Please process the {content_type} again.'
            }), 400
        
        # Generate response using vector similarity search
        try:
            logger.info(f"🚀 QUERY: Processing question for {content_type} {content_id}")
            response = pipeline.query(question, content_id, content_type)
            
            if not response:
                return jsonify({
                    'error': 'Could not generate a response. Please try again.'
                }), 400
            
            # Log vector search usage
            if response.get('vector_search_used'):
                logger.info(f"✅ RESPONSE: Vector search successful - {response['chunks_found']} chunks used")
            else:
                logger.info("⚠️ RESPONSE: No vector data - using general AI knowledge")
            
            return jsonify(response)
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            return jsonify({
                'error': f'Failed to generate response: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in query: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/generate_mindmap', methods=['POST', 'OPTIONS'])
def generate_mindmap():
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_mindmap request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        # Support both video_id and content_id for backward compatibility
        content_id = data.get('content_id') or data.get('video_id')
        content_type = data.get('content_type', 'video')  # Default to video for backward compatibility
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating mindmap for {content_type}: {content_id}")
        
        if not all([content_id, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing content_id or api_key'}), 400
            
        # Get pipeline key and check if content was processed
        pipeline_key = f"{content_id}_{model_name}_{temperature}"
        pipeline = video_pipelines.get(pipeline_key)
        
        if not pipeline:
            logger.error("No initialized pipeline found")
            content_name = "Video" if content_type == "video" else "Blog"
            return jsonify({
                'error': f'{content_name} not properly processed. Please process the {content_type} first.'
            }), 400
        
        # Check if content is available in vector store
        if not pipeline.has_content_data(content_id, content_type):
            logger.error("No content available for mindmap generation")
            content_name = "Video" if content_type == "video" else "Blog"
            return jsonify({
                'error': f'Cannot generate mindmap without content. This {content_type} does not have content data available.'
            }), 400
        
        # Generate mindmap using the RAG pipeline with Mermaid vertical flowchart format
        try:
            content_name = "video" if content_type == "video" else "blog"
            mindmap_prompt = f"""
            Based on the {content_name} content, create a comprehensive flowchart as a Mermaid diagram showing the main concepts and their relationships.
            
            Create a flowchart that includes:
            1. A main central topic
            2. 4-6 key concepts branching from the main topic
            3. 2-3 sub-concepts for each key concept
            4. Examples and applications
            5. Key takeaways
            
            Use this EXACT format and structure:
            
            ```mermaid
            flowchart TD
                A["Main Topic"]
                A --> B["Key Concept 1"]
                A --> C["Key Concept 2"]
                A --> D["Key Concept 3"]
                A --> E["Key Concept 4"]
                
                B --> B1["Sub-concept 1A"]
                B --> B2["Sub-concept 1B"]
                
                C --> C1["Sub-concept 2A"]
                C --> C2["Sub-concept 2B"]
                
                D --> D1["Sub-concept 3A"]
                D --> D2["Sub-concept 3B"]
                
                E --> E1["Sub-concept 4A"]
                E --> E2["Sub-concept 4B"]
                
                B1 --> F["Examples"]
                C1 --> F
                D1 --> F
                
                F --> F1["Example 1"]
                F --> F2["Example 2"]
                
                F1 --> G["Key Takeaways"]
                F2 --> G
                
                G --> G1["Takeaway 1"]
                G --> G2["Takeaway 2"]
                G --> G3["Takeaway 3"]
            ```
            
            IMPORTANT INSTRUCTIONS:
            1. Replace ALL placeholder text with actual content from the {content_name}
            2. Use descriptive, specific labels (not generic placeholders)
            3. Keep node labels concise (2-5 words each)
            4. Ensure ALL nodes are connected properly
            5. Return ONLY the mermaid code block, no additional text
            6. Do NOT include styling or classDef statements
            7. Make sure the diagram flows logically from top to bottom
            
            Generate the complete flowchart now with actual content from the {content_name}.
            """
            
            response = pipeline.query(mindmap_prompt, content_id, content_type)
            if not response or not response.get('answer'):
                return jsonify({
                    'error': 'Could not generate mindmap. Please try again.'
                }), 400
                
            # Extract the Mermaid code from the response
            mermaid_code = response['answer'].strip()
            
            # Clean up the response to extract just the Mermaid code
            if '```mermaid' in mermaid_code:
                start = mermaid_code.find('```mermaid') + len('```mermaid')
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    # If no closing ```, take everything after ```mermaid
                    mermaid_code = mermaid_code[start:].strip()
            elif '```' in mermaid_code:
                # Handle case where it's just ``` without mermaid
                start = mermaid_code.find('```') + 3
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    mermaid_code = mermaid_code[start:].strip()
                
            return jsonify({
                'success': True,
                'mindmap': mermaid_code,
                'format': 'mermaid',
                'content_type': content_type
            })
            
        except Exception as e:
            logger.error(f"Error generating mindmap: {str(e)}")
            return jsonify({
                'error': f'Failed to generate mindmap: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_mindmap: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
                     }), 500

@app.route('/generate_quiz', methods=['POST', 'OPTIONS'])
def generate_quiz():
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_quiz request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        video_id = data.get('video_id')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating quiz for video ID: {video_id}")
        
        if not all([video_id, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing video_id or api_key'}), 400
            
        # Get pipeline key and check if video was processed
        pipeline_key = f"{video_id}_{model_name}_{temperature}"
        pipeline = video_pipelines.get(pipeline_key)
        
        if not pipeline:
            logger.error("No initialized pipeline found")
            return jsonify({
                'error': 'Video not properly processed. Please process the video first.'
            }), 400
        
        # Check if content is available in vector store
        if not pipeline.has_content_data(video_id, "video"):
            logger.error("No content available for quiz generation")
            return jsonify({
                'error': 'Cannot generate quiz without content. This video does not have transcript data available.'
            }), 400
        
        # Generate quiz using the RAG pipeline
        try:
            quiz_prompt = """
            Based on the video transcript, create a comprehensive 10-question multiple-choice quiz. 
            
            Format your response as a JSON structure with the following format:
            
            {
                "questions": [
                    {
                        "question": "Question text here?",
                        "options": [
                            "Option A text",
                            "Option B text", 
                            "Option C text",
                            "Option D text"
                        ],
                        "correctAnswer": 0
                    }
                ]
            }
            
            Requirements:
            1. Create exactly 10 questions
            2. Each question should have exactly 4 options (A, B, C, D)
            3. Questions should cover different aspects of the video content
            4. Include a mix of factual, conceptual, and application questions
            5. Make sure the correct answer index (0-3) corresponds to the right option
            6. Questions should be clear and unambiguous
            7. All options should be plausible but only one should be correct
            8. Cover main topics, key concepts, examples, and conclusions from the video
            
            Return ONLY the JSON structure, no additional text or formatting.
            """
            
            response = pipeline.query(quiz_prompt, video_id, "video")
            if not response or not response.get('answer'):
                return jsonify({
                    'error': 'Could not generate quiz. Please try again.'
                }), 400
            
            # Try to parse the JSON response
            import json
            try:
                # Clean the response - remove any markdown formatting
                quiz_text = response['answer'].strip()
                if quiz_text.startswith('```json'):
                    quiz_text = quiz_text[7:]
                if quiz_text.endswith('```'):
                    quiz_text = quiz_text[:-3]
                quiz_text = quiz_text.strip()
                
                quiz_data = json.loads(quiz_text)
                
                # Validate the quiz structure
                if not isinstance(quiz_data, dict) or 'questions' not in quiz_data:
                    raise ValueError("Invalid quiz structure")
                
                questions = quiz_data['questions']
                if not isinstance(questions, list) or len(questions) != 10:
                    raise ValueError(f"Expected 10 questions, got {len(questions)}")
                
                # Validate each question
                for i, question in enumerate(questions):
                    if not isinstance(question, dict):
                        raise ValueError(f"Question {i+1} is not a dict")
                    if 'question' not in question or 'options' not in question or 'correctAnswer' not in question:
                        raise ValueError(f"Question {i+1} missing required fields")
                    if not isinstance(question['options'], list) or len(question['options']) != 4:
                        raise ValueError(f"Question {i+1} should have exactly 4 options")
                    if not isinstance(question['correctAnswer'], int) or question['correctAnswer'] < 0 or question['correctAnswer'] > 3:
                        raise ValueError(f"Question {i+1} has invalid correctAnswer")
                
                return jsonify({
                    'success': True,
                    'quiz': quiz_data
                })
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Error parsing quiz JSON: {str(e)}")
                return jsonify({
                    'error': 'Failed to generate properly formatted quiz. Please try again.'
                }), 400
                
        except Exception as e:
            logger.error(f"Error generating quiz: {str(e)}")
            return jsonify({
                'error': f'Failed to generate quiz: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_quiz: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/generate_custom_quiz', methods=['POST', 'OPTIONS'])
def generate_custom_quiz():
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_custom_quiz request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        topic = data.get('topic')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating custom quiz for topic: {topic}")
        
        if not all([topic, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing topic or api_key'}), 400
            
        if len(topic.strip()) < 3:
            return jsonify({'error': 'Topic must be at least 3 characters long'}), 400
        
        # Create a new pipeline instance for custom quiz generation
        try:
            pipeline = RAGPipeline(
                api_key=api_key,
                model_name=model_name,
                temperature=temperature
            )
            
            # Generate quiz using the RAG pipeline with a custom topic prompt
            quiz_prompt = f"""
            Create a comprehensive 10-question multiple-choice quiz about: "{topic}"
            
            Format your response as a JSON structure with the following format:
            
            {{
                "questions": [
                    {{
                        "question": "Question text here?",
                        "options": [
                            "Option A text",
                            "Option B text", 
                            "Option C text",
                            "Option D text"
                        ],
                        "correctAnswer": 0
                    }}
                ]
            }}
            
            Requirements:
            1. Create exactly 10 questions about "{topic}"
            2. Each question should have exactly 4 options (A, B, C, D)
            3. Questions should cover different aspects of the topic
            4. Include a mix of factual, conceptual, and application questions
            5. Make sure the correct answer index (0-3) corresponds to the right option
            6. Questions should be clear, educational, and unambiguous
            7. All options should be plausible but only one should be correct
            8. Cover fundamental concepts, key principles, examples, and practical applications
            9. Questions should be appropriate for someone learning about this topic
            10. Ensure questions are well-researched and accurate
            
            Return ONLY the JSON structure, no additional text or formatting.
            """
            
            # Use the pipeline's model directly for custom quiz generation
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            
            generation_config = genai.types.GenerationConfig(
                temperature=temperature,
                max_output_tokens=4000,
            )
            
            response = model.generate_content(
                quiz_prompt,
                generation_config=generation_config
            )
            
            if not response or not response.text:
                return jsonify({
                    'error': 'Could not generate custom quiz. Please try again.'
                }), 400
            
            # Try to parse the JSON response
            import json
            try:
                # Clean the response - remove any markdown formatting
                quiz_text = response.text.strip()
                if quiz_text.startswith('```json'):
                    quiz_text = quiz_text[7:]
                if quiz_text.endswith('```'):
                    quiz_text = quiz_text[:-3]
                quiz_text = quiz_text.strip()
                
                quiz_data = json.loads(quiz_text)
                
                # Validate the quiz structure
                if not isinstance(quiz_data, dict) or 'questions' not in quiz_data:
                    raise ValueError("Invalid quiz structure")
                
                questions = quiz_data['questions']
                if not isinstance(questions, list) or len(questions) != 10:
                    raise ValueError(f"Expected 10 questions, got {len(questions)}")
                
                # Validate each question
                for i, question in enumerate(questions):
                    if not isinstance(question, dict):
                        raise ValueError(f"Question {i+1} is not a dict")
                    if 'question' not in question or 'options' not in question or 'correctAnswer' not in question:
                        raise ValueError(f"Question {i+1} missing required fields")
                    if not isinstance(question['options'], list) or len(question['options']) != 4:
                        raise ValueError(f"Question {i+1} should have exactly 4 options")
                    if not isinstance(question['correctAnswer'], int) or question['correctAnswer'] < 0 or question['correctAnswer'] > 3:
                        raise ValueError(f"Question {i+1} has invalid correctAnswer")
                
                return jsonify({
                    'success': True,
                    'quiz': quiz_data
                })
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Error parsing custom quiz JSON: {str(e)}")
                return jsonify({
                    'error': 'Failed to generate properly formatted quiz. Please try again.'
                }), 400
                
        except Exception as e:
            logger.error(f"Error generating custom quiz: {str(e)}")
            return jsonify({
                'error': f'Failed to generate custom quiz: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_custom_quiz: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/generate_content_mindmap', methods=['POST', 'OPTIONS'])
def generate_content_mindmap():
    """Generate mindmap for any content type (video or blog)."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_content_mindmap request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        content_id = data.get('content_id')
        content_type = data.get('content_type', 'video')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating mindmap for {content_type}: {content_id}")
        
        if not all([content_id, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing content_id or api_key'}), 400
            
        if content_type not in ['video', 'blog']:
            logger.error(f"Invalid content_type: {content_type}")
            return jsonify({'error': 'content_type must be "video" or "blog"'}), 400
            
        # Get pipeline key and check if content was processed
        pipeline_key = f"{content_id}_{model_name}_{temperature}"
        pipeline = video_pipelines.get(pipeline_key)
        
        if not pipeline:
            logger.error("No initialized pipeline found")
            content_name = "Video" if content_type == "video" else "Blog"
            return jsonify({
                'error': f'{content_name} not properly processed. Please process the {content_type} first.'
            }), 400
        
        # Check if content is available in vector store
        if not pipeline.has_content_data(content_id, content_type):
            logger.error("No content available for mindmap generation")
            content_name = "Video" if content_type == "video" else "Blog"
            return jsonify({
                'error': f'Cannot generate mindmap without content. This {content_type} does not have content data available.'
            }), 400
        
        # Generate mindmap using the RAG pipeline with Mermaid vertical flowchart format
        try:
            content_name = "video" if content_type == "video" else "blog"
            mindmap_prompt = f"""
            Based on the {content_name} content, create a comprehensive flowchart as a Mermaid diagram showing the main concepts and their relationships.
            
            Create a flowchart that includes:
            1. A main central topic
            2. 4-6 key concepts branching from the main topic
            3. 2-3 sub-concepts for each key concept
            4. Examples and applications
            5. Key takeaways
            
            Use this EXACT format and structure:
            
            ```mermaid
            flowchart TD
                A["Main Topic"]
                A --> B["Key Concept 1"]
                A --> C["Key Concept 2"]
                A --> D["Key Concept 3"]
                A --> E["Key Concept 4"]
                
                B --> B1["Sub-concept 1A"]
                B --> B2["Sub-concept 1B"]
                
                C --> C1["Sub-concept 2A"]
                C --> C2["Sub-concept 2B"]
                
                D --> D1["Sub-concept 3A"]
                D --> D2["Sub-concept 3B"]
                
                E --> E1["Sub-concept 4A"]
                E --> E2["Sub-concept 4B"]
                
                B1 --> F["Examples"]
                C1 --> F
                D1 --> F
                
                F --> F1["Example 1"]
                F --> F2["Example 2"]
                
                F1 --> G["Key Takeaways"]
                F2 --> G
                
                G --> G1["Takeaway 1"]
                G --> G2["Takeaway 2"]
                G --> G3["Takeaway 3"]
            ```
            
            IMPORTANT INSTRUCTIONS:
            1. Replace ALL placeholder text with actual content from the {content_name}
            2. Use descriptive, specific labels (not generic placeholders)
            3. Keep node labels concise (2-5 words each)
            4. Ensure ALL nodes are connected properly
            5. Return ONLY the mermaid code block, no additional text
            6. Do NOT include styling or classDef statements
            7. Make sure the diagram flows logically from top to bottom
            
            Generate the complete flowchart now with actual content from the {content_name}.
            """
            
            response = pipeline.query(mindmap_prompt, content_id, content_type)
            if not response or not response.get('answer'):
                return jsonify({
                    'error': 'Could not generate mindmap. Please try again.'
                }), 400
                
            # Extract the Mermaid code from the response
            mermaid_code = response['answer'].strip()
            
            # Clean up the response to extract just the Mermaid code
            if '```mermaid' in mermaid_code:
                start = mermaid_code.find('```mermaid') + len('```mermaid')
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    # If no closing ```, take everything after ```mermaid
                    mermaid_code = mermaid_code[start:].strip()
            elif '```' in mermaid_code:
                # Handle case where it's just ``` without mermaid
                start = mermaid_code.find('```') + 3
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    mermaid_code = mermaid_code[start:].strip()
                
            return jsonify({
                'success': True,
                'mindmap': mermaid_code,
                'format': 'mermaid',
                'content_type': content_type
            })
            
        except Exception as e:
            logger.error(f"Error generating mindmap: {str(e)}")
            return jsonify({
                'error': f'Failed to generate mindmap: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_content_mindmap: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/generate_video_mindmap', methods=['POST', 'OPTIONS'])
def generate_video_mindmap():
    """Generate mindmap specifically for video content."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_video_mindmap request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        video_id = data.get('video_id')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating mindmap for video: {video_id}")
        
        if not all([video_id, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing video_id or api_key'}), 400
            
        # Get pipeline key and check if video was processed
        pipeline_key = f"{video_id}_{model_name}_{temperature}"
        pipeline = video_pipelines.get(pipeline_key)
        
        if not pipeline:
            logger.error("No initialized pipeline found")
            return jsonify({
                'error': 'Video not properly processed. Please process the video first.'
            }), 400
        
        # Check if video content is available in vector store
        if not pipeline.has_content_data(video_id, "video"):
            logger.error("No video content available for mindmap generation")
            return jsonify({
                'error': 'Cannot generate mindmap without video content. This video does not have transcript data available.'
            }), 400
        
        # Generate mindmap using the RAG pipeline with Mermaid vertical flowchart format
        try:
            mindmap_prompt = """
            Based on the video content, create a comprehensive flowchart as a Mermaid diagram showing the main concepts and their relationships.
            
            Create a flowchart that includes:
            1. A main central topic
            2. 4-6 key concepts branching from the main topic
            3. 2-3 sub-concepts for each key concept
            4. Examples and applications
            5. Key takeaways
            
            Use this EXACT format and structure:
            
            ```mermaid
            flowchart TD
                A["Main Topic"]
                A --> B["Key Concept 1"]
                A --> C["Key Concept 2"]
                A --> D["Key Concept 3"]
                A --> E["Key Concept 4"]
                
                B --> B1["Sub-concept 1A"]
                B --> B2["Sub-concept 1B"]
                
                C --> C1["Sub-concept 2A"]
                C --> C2["Sub-concept 2B"]
                
                D --> D1["Sub-concept 3A"]
                D --> D2["Sub-concept 3B"]
                
                E --> E1["Sub-concept 4A"]
                E --> E2["Sub-concept 4B"]
                
                B1 --> F["Examples"]
                C1 --> F
                D1 --> F
                
                F --> F1["Example 1"]
                F --> F2["Example 2"]
                
                F1 --> G["Key Takeaways"]
                F2 --> G
                
                G --> G1["Takeaway 1"]
                G --> G2["Takeaway 2"]
                G --> G3["Takeaway 3"]
            ```
            
            IMPORTANT INSTRUCTIONS:
            1. Replace ALL placeholder text with actual content from the video
            2. Use descriptive, specific labels (not generic placeholders)
            3. Keep node labels concise (2-5 words each)
            4. Ensure ALL nodes are connected properly
            5. Return ONLY the mermaid code block, no additional text
            6. Do NOT include styling or classDef statements
            7. Make sure the diagram flows logically from top to bottom
            
            Generate the complete flowchart now with actual content from the video.
            """
            
            response = pipeline.query(mindmap_prompt, video_id, "video")
            if not response or not response.get('answer'):
                return jsonify({
                    'error': 'Could not generate video mindmap. Please try again.'
                }), 400
                
            # Extract the Mermaid code from the response
            mermaid_code = response['answer'].strip()
            
            # Clean up the response to extract just the Mermaid code
            if '```mermaid' in mermaid_code:
                start = mermaid_code.find('```mermaid') + len('```mermaid')
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    mermaid_code = mermaid_code[start:].strip()
            elif '```' in mermaid_code:
                start = mermaid_code.find('```') + 3
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    mermaid_code = mermaid_code[start:].strip()
                
            return jsonify({
                'success': True,
                'mindmap': mermaid_code,
                'format': 'mermaid',
                'content_type': 'video'
            })
            
        except Exception as e:
            logger.error(f"Error generating video mindmap: {str(e)}")
            return jsonify({
                'error': f'Failed to generate video mindmap: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_video_mindmap: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/generate_blog_mindmap', methods=['POST', 'OPTIONS'])
def generate_blog_mindmap():
    """Generate mindmap specifically for blog content."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_blog_mindmap request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        blog_url = data.get('blog_url')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating mindmap for blog: {blog_url}")
        
        if not all([blog_url, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing blog_url or api_key'}), 400
            
        # Get pipeline key and check if blog was processed
        pipeline_key = f"{blog_url}_{model_name}_{temperature}"
        pipeline = video_pipelines.get(pipeline_key)
        
        if not pipeline:
            logger.error("No initialized pipeline found")
            return jsonify({
                'error': 'Blog not properly processed. Please process the blog first.'
            }), 400
        
        # Check if blog content is available in vector store
        if not pipeline.has_content_data(blog_url, "blog"):
            logger.error("No blog content available for mindmap generation")
            return jsonify({
                'error': 'Cannot generate mindmap without blog content. This blog does not have content data available.'
            }), 400
        
        # Generate mindmap using the RAG pipeline with Mermaid vertical flowchart format
        try:
            mindmap_prompt = """
            Based on the blog article content, create a comprehensive flowchart as a Mermaid diagram showing the main concepts and their relationships.
            
            Create a flowchart that includes:
            1. A main central topic
            2. 4-6 key concepts branching from the main topic
            3. 2-3 sub-concepts for each key concept
            4. Examples and applications
            5. Key takeaways
            
            Use this EXACT format and structure:
            
            ```mermaid
            flowchart TD
                A["Main Topic"]
                A --> B["Key Concept 1"]
                A --> C["Key Concept 2"]
                A --> D["Key Concept 3"]
                A --> E["Key Concept 4"]
                
                B --> B1["Sub-concept 1A"]
                B --> B2["Sub-concept 1B"]
                
                C --> C1["Sub-concept 2A"]
                C --> C2["Sub-concept 2B"]
                
                D --> D1["Sub-concept 3A"]
                D --> D2["Sub-concept 3B"]
                
                E --> E1["Sub-concept 4A"]
                E --> E2["Sub-concept 4B"]
                
                B1 --> F["Examples"]
                C1 --> F
                D1 --> F
                
                F --> F1["Example 1"]
                F --> F2["Example 2"]
                
                F1 --> G["Key Takeaways"]
                F2 --> G
                
                G --> G1["Takeaway 1"]
                G --> G2["Takeaway 2"]
                G --> G3["Takeaway 3"]
            ```
            
            IMPORTANT INSTRUCTIONS:
            1. Replace ALL placeholder text with actual content from the blog
            2. Use descriptive, specific labels (not generic placeholders)
            3. Keep node labels concise (2-5 words each)
            4. Ensure ALL nodes are connected properly
            5. Return ONLY the mermaid code block, no additional text
            6. Do NOT include styling or classDef statements
            7. Make sure the diagram flows logically from top to bottom
            
            Generate the complete flowchart now with actual content from the blog.
            """
            
            response = pipeline.query(mindmap_prompt, blog_url, "blog")
            if not response or not response.get('answer'):
                return jsonify({
                    'error': 'Could not generate blog mindmap. Please try again.'
                }), 400
                
            # Extract the Mermaid code from the response
            mermaid_code = response['answer'].strip()
            
            # Clean up the response to extract just the Mermaid code
            if '```mermaid' in mermaid_code:
                start = mermaid_code.find('```mermaid') + len('```mermaid')
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    mermaid_code = mermaid_code[start:].strip()
            elif '```' in mermaid_code:
                start = mermaid_code.find('```') + 3
                end = mermaid_code.find('```', start)
                if end != -1:
                    mermaid_code = mermaid_code[start:end].strip()
                else:
                    mermaid_code = mermaid_code[start:].strip()
                
            return jsonify({
                'success': True,
                'mindmap': mermaid_code,
                'format': 'mermaid',
                'content_type': 'blog'
            })
            
        except Exception as e:
            logger.error(f"Error generating blog mindmap: {str(e)}")
            return jsonify({
                'error': f'Failed to generate blog mindmap: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_blog_mindmap: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/generate_blog_quiz', methods=['POST', 'OPTIONS'])
def generate_blog_quiz():
    """Generate quiz specifically for blog content."""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.debug("Received generate_blog_quiz request")
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No JSON data received'}), 400
            
        blog_url = data.get('blog_url')
        api_key = data.get('api_key')
        model_name = data.get('model_name', 'gemini-2.0-flash-lite')
        temperature = float(data.get('temperature', 0.2))
        
        logger.debug(f"Generating quiz for blog: {blog_url}")
        
        if not all([blog_url, api_key]):
            logger.error("Missing required parameters")
            return jsonify({'error': 'Missing blog_url or api_key'}), 400
            
        # Get pipeline key and check if blog was processed
        pipeline_key = f"{blog_url}_{model_name}_{temperature}"
        pipeline = video_pipelines.get(pipeline_key)
        
        if not pipeline:
            logger.error("No initialized pipeline found")
            return jsonify({
                'error': 'Blog not properly processed. Please process the blog first.'
            }), 400
        
        # Check if blog content is available in vector store
        if not pipeline.has_content_data(blog_url, "blog"):
            logger.error("No blog content available for quiz generation")
            return jsonify({
                'error': 'Cannot generate quiz without blog content. This blog does not have content data available.'
            }), 400
        
        # Generate quiz using the RAG pipeline
        try:
            quiz_prompt = """
            Based on the blog article content, create a comprehensive 10-question multiple-choice quiz. 
            
            Format your response as a JSON structure with the following format:
            
            {
                "questions": [
                    {
                        "question": "Question text here?",
                        "options": [
                            "Option A text",
                            "Option B text", 
                            "Option C text",
                            "Option D text"
                        ],
                        "correctAnswer": 0
                    }
                ]
            }
            
            Requirements:
            1. Create exactly 10 questions based on the blog article content
            2. Each question should have exactly 4 options (A, B, C, D)
            3. Questions should cover different aspects of the blog content
            4. Include a mix of factual, conceptual, and application questions
            5. Make sure the correct answer index (0-3) corresponds to the right option
            6. Questions should be clear and unambiguous
            7. All options should be plausible but only one should be correct
            8. Cover main topics, key concepts, examples, and conclusions from the blog article
            9. Questions should test understanding of the blog's key points and insights
            10. Ensure questions are relevant to the blog's subject matter
            
            Return ONLY the JSON structure, no additional text or formatting.
            """
            
            response = pipeline.query(quiz_prompt, blog_url, "blog")
            if not response or not response.get('answer'):
                return jsonify({
                    'error': 'Could not generate blog quiz. Please try again.'
                }), 400
            
            # Try to parse the JSON response
            import json
            try:
                # Clean the response - remove any markdown formatting
                quiz_text = response['answer'].strip()
                if quiz_text.startswith('```json'):
                    quiz_text = quiz_text[7:]
                if quiz_text.endswith('```'):
                    quiz_text = quiz_text[:-3]
                quiz_text = quiz_text.strip()
                
                quiz_data = json.loads(quiz_text)
                
                # Validate the quiz structure
                if not isinstance(quiz_data, dict) or 'questions' not in quiz_data:
                    raise ValueError("Invalid quiz structure")
                
                questions = quiz_data['questions']
                if not isinstance(questions, list) or len(questions) != 10:
                    raise ValueError(f"Expected 10 questions, got {len(questions)}")
                
                # Validate each question
                for i, question in enumerate(questions):
                    if not isinstance(question, dict):
                        raise ValueError(f"Question {i+1} is not a dict")
                    if 'question' not in question or 'options' not in question or 'correctAnswer' not in question:
                        raise ValueError(f"Question {i+1} missing required fields")
                    if not isinstance(question['options'], list) or len(question['options']) != 4:
                        raise ValueError(f"Question {i+1} should have exactly 4 options")
                    if not isinstance(question['correctAnswer'], int) or question['correctAnswer'] < 0 or question['correctAnswer'] > 3:
                        raise ValueError(f"Question {i+1} has invalid correctAnswer")
                
                return jsonify({
                    'success': True,
                    'quiz': quiz_data,
                    'content_type': 'blog'
                })
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Error parsing blog quiz JSON: {str(e)}")
                return jsonify({
                    'error': 'Failed to generate properly formatted quiz. Please try again.'
                }), 400
                
        except Exception as e:
            logger.error(f"Error generating blog quiz: {str(e)}")
            return jsonify({
                'error': f'Failed to generate blog quiz: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in generate_blog_quiz: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Run the Flask app with auto-reload disabled
    app.run(
        host='localhost', 
        port=5000, 
        debug=True,
        use_reloader=False  # Disable auto-reloader
    ) 