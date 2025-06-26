"""RAG Pipeline with ChromaDB for content processing and querying."""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import Document
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
import google.generativeai as genai
from langchain.text_splitter import RecursiveCharacterTextSplitter
from components.vector_store import ChromaVectorStore
from utils.prompts import RAG_PROMPT_TEMPLATE, NO_TRANSCRIPT_PROMPT_TEMPLATE, CONTENT_TYPES
from typing import Dict, Any
import os
import logging

logger = logging.getLogger(__name__)

class RAGPipeline:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-2.0-flash-lite",
        temperature: float = 0.2,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        vector_store_path: str = "./chroma_db"
    ):
        """Initialize the RAG pipeline with ChromaDB vector storage.
        
        Args:
            api_key: Google API key
            model_name: Name of the Gemini model to use
            temperature: Temperature for text generation
            chunk_size: Size of text chunks for splitting
            chunk_overlap: Overlap between chunks
            vector_store_path: Path for ChromaDB persistence
        """
        self.api_key = api_key
        self.model_name = model_name
        self.temperature = temperature
        
        # Set environment variable for API key
        os.environ["GOOGLE_API_KEY"] = api_key
        
        # Initialize Gemini
        genai.configure(api_key=api_key)
        
        # Initialize components
        self.llm = ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=api_key  # Explicitly pass API key
        )
        
        # Initialize text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        
        # Initialize ChromaDB vector store
        self.vector_store = ChromaVectorStore(persist_directory=vector_store_path)
        logger.info("ChromaDB vector store initialized successfully")
        
    def get_transcript(self, video_id: str, language: str = "en") -> str:
        """Get transcript for a video using YouTubeTranscriptApi.
        
        Args:
            video_id: YouTube video ID
            language: Preferred transcript language
            
        Returns:
            Transcript text if available
            
        Raises:
            Exception: If transcript cannot be fetched
        """
        try:
            # Try to get the transcript in the specified language
            transcript_list = YouTubeTranscriptApi.get_transcript(
                video_id, 
                languages=[language]
            )
            return " ".join(chunk["text"] for chunk in transcript_list)
            
        except TranscriptsDisabled:
            raise Exception("Transcripts are disabled for this video")
            
        except NoTranscriptFound:
            try:
                # If specified language not found, try to get any available transcript
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                # Get the first available transcript
                first_transcript = transcript_list.find_transcript([language])
                translated = first_transcript.translate(language)
                return " ".join(chunk["text"] for chunk in translated.fetch())
                
            except Exception as e:
                raise Exception(f"No transcript found for this video: {str(e)}")
                
        except VideoUnavailable:
            raise Exception("The video is unavailable or private")
            
        except Exception as e:
            raise Exception(f"Error fetching transcript: {str(e)}")
    
    def get_blog_content(self, blog_url: str) -> str:
        """Get blog content using crawl4ai.
        
        Args:
            blog_url: URL of the blog article
            
        Returns:
            Cleaned blog content text
            
        Raises:
            Exception: If blog content cannot be fetched
        """
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
            import asyncio
            import re
            
            async def crawl_blog():
                # Configure browser and crawler
                browser_config = BrowserConfig(
                    headless=True,
                    browser_type="chromium",
                    ignore_https_errors=True,
                    light_mode=True,
                )
                
                crawler_config = CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    only_text=True,
                    word_count_threshold=10,
                )
                
                # Create async crawler instance
                async with AsyncWebCrawler(config=browser_config) as crawler:
                    # Crawl the URL
                    result = await crawler.arun(url=blog_url, config=crawler_config)
                    
                    if not result.success:
                        raise Exception(f"Failed to crawl blog: {result.error_message or 'Unknown error'}")
                    
                    # Extract and clean the content
                    content = result.markdown if result.markdown else result.cleaned_html
                    
                    if not content:
                        raise Exception("No content could be extracted from the blog")
                    
                    return content
            
            # Run the async function
            content = asyncio.run(crawl_blog())
            
            # Basic cleaning - remove excessive whitespace and normalize
            content = re.sub(r'\n\s*\n', '\n\n', content)  # Normalize line breaks
            content = re.sub(r'\s+', ' ', content)  # Normalize spaces
            content = content.strip()
            
            if not content:
                raise Exception("No content could be extracted from the blog")
                
            return content
            
        except ImportError:
            raise Exception("crawl4ai package not installed. Please install it with: pip install crawl4ai")
        except Exception as e:
            raise Exception(f"Error fetching blog content: {str(e)}")

    def process_content(self, content_id: str, content_type: str = "video") -> bool:
        """Process content (video or blog) and prepare it for querying.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            True if processing successful, False otherwise
        """
        if content_type not in CONTENT_TYPES:
            logger.error(f"Unsupported content type: {content_type}")
            return False
            
        try:
            # Check if content is already processed in vector store
            if self.vector_store.collection_exists(content_id, content_type):
                content_name = CONTENT_TYPES[content_type]['name']
                logger.info(f"{content_name} {content_id} already processed in vector store")
                return True
            
            # Get content based on type
            if content_type == "video":
                content = self.get_transcript(content_id)
            elif content_type == "blog":
                content = self.get_blog_content(content_id)
            else:
                raise Exception(f"Unknown content type: {content_type}")
                
            if not content:
                return False
                
            # Split into chunks and store directly in vector database
            chunks = self.text_splitter.create_documents([content])
            success = self.vector_store.store_content_chunks(content_id, chunks, content_type)
            
            if success:
                content_name = CONTENT_TYPES[content_type]['name']
                logger.info(f"Successfully stored {len(chunks)} chunks for {content_name.lower()} in vector store")
                return True
            else:
                logger.error(f"Failed to store chunks for {content_type} in vector store")
                return False
            
        except Exception as e:
            logger.error(f"Error processing {content_type}: {str(e)}")
            return False
        
    # Legacy method for backward compatibility
    def process_video(self, video_id: str) -> bool:
        """Process a YouTube video and prepare it for querying.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            True if processing successful, False otherwise
        """
        return self.process_content(video_id, "video")
        
    def query(self, question: str, content_id: str, content_type: str = "video") -> Dict[str, Any]:
        """Query the processed content using vector similarity search.
        
        Args:
            question: User's question about the content
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            Dictionary containing answer and relevant context
        """
        if content_type not in CONTENT_TYPES:
            return {
                "answer": f"Unsupported content type: {content_type}",
                "context": None,
                "vector_search_used": False,
                "chunks_found": 0,
                "error": "Unsupported content type"
            }
            
        content_config = CONTENT_TYPES[content_type]
        logger.info(f"🔍 VECTOR SEARCH: Starting similarity search for {content_config['name']} {content_id}")
        
        # Perform semantic similarity search with content type
        results = self.vector_store.similarity_search(
            content_id=content_id,
            query=question,
            k=5,  # Get top 5 most relevant chunks
            score_threshold=-0.8,  # Much lower threshold to capture more chunks
            content_type=content_type
        )
        
        if results:
            relevant_chunks = [doc for doc, score in results]
            context = "\n\n".join(chunk.page_content for chunk in relevant_chunks)
            
            # Log vector search success with scores
            chunk_scores = [f"Chunk {i+1}: {score:.3f}" for i, (doc, score) in enumerate(results)]
            logger.info(f"✅ VECTOR SEARCH SUCCESS: Found {len(results)} relevant chunks")
            logger.info(f"📊 Similarity scores: {', '.join(chunk_scores)}")
            
            prompt = RAG_PROMPT_TEMPLATE.format(
                content_type_name=content_config['name'],
                context=context,
                question=question
            )
            
            return {
                "answer": self.llm.invoke(prompt).content,
                "context": context,
                "vector_search_used": True,
                "chunks_found": len(results),
                "similarity_scores": [score for doc, score in results]
            }
        else:
            # No content available, use general prompt
            logger.warning(f"⚠️ VECTOR SEARCH: No relevant chunks found for {content_config['name']} {content_id}")
            prompt = NO_TRANSCRIPT_PROMPT_TEMPLATE.format(
                content_type_name=content_config['name'],
                content_id=content_id,
                question=question
            )
            
            return {
                "answer": self.llm.invoke(prompt).content,
                "context": None,
                "vector_search_used": False,
                "chunks_found": 0,
                "message": f"No {content_config['name']} content available - using general AI knowledge"
            }
    
    def has_content_data(self, content_id: str, content_type: str = "video") -> bool:
        """Check if content has data stored in vector database.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            True if content data exists, False otherwise
        """
        return self.vector_store.collection_exists(content_id, content_type)
    
    # Legacy method for backward compatibility    
    def has_transcript_data(self, video_id: str) -> bool:
        """Check if video has transcript data stored in vector database.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            True if transcript data exists, False otherwise
        """
        return self.has_content_data(video_id)
    
 