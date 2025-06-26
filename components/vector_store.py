"""Vector Store using ChromaDB with all-MiniLM-L6-v2 embeddings."""

import os
import logging
from typing import List, Dict, Any, Optional, Tuple
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import hashlib
import uuid
from langchain.schema import Document

logger = logging.getLogger(__name__)

class ChromaVectorStore:
    """Vector store using ChromaDB with all-MiniLM-L6-v2 embeddings."""
    
    def __init__(self, persist_directory: str = "./chroma_db"):
        """Initialize the ChromaDB vector store.
        
        Args:
            persist_directory: Directory to persist ChromaDB data
        """
        self.persist_directory = persist_directory
        self.model_name = "all-MiniLM-L6-v2"
        
        # Initialize sentence transformer model
        try:
            self.embedding_model = SentenceTransformer(self.model_name)
            logger.info(f"Loaded embedding model: {self.model_name}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise
        
        # Initialize ChromaDB client
        try:
            self.client = chromadb.PersistentClient(
                path=persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
            logger.info(f"Initialized ChromaDB client with persist directory: {persist_directory}")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB client: {e}")
            raise
    
    def _generate_collection_name(self, content_id: str, content_type: str = "video") -> str:
        """Generate a collection name based on content ID and type.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            Collection name string
        """
        # Create a hash of the content_id for consistent naming
        content_hash = hashlib.md5(content_id.encode()).hexdigest()[:12]
        # Use content type prefix
        prefix = "video" if content_type == "video" else "blog"
        return f"{prefix}_{content_hash}"
    
    def _get_or_create_collection(self, content_id: str, content_type: str = "video"):
        """Get or create a ChromaDB collection for the content.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            ChromaDB collection instance
        """
        collection_name = self._generate_collection_name(content_id, content_type)
        
        try:
            # Try to get existing collection first
            collection = self.client.get_collection(name=collection_name)
            logger.info(f"Retrieved existing collection: {collection_name}")
        except Exception:
            # Collection doesn't exist, create it
            collection = self.client.create_collection(
                name=collection_name,
                metadata={"content_id": content_id, "content_type": content_type}
            )
            logger.info(f"Created new collection: {collection_name}")
        
        return collection
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embeddings for text using all-MiniLM-L6-v2.
        
        Args:
            text: Text to embed
            
        Returns:
            List of embedding values
        """
        try:
            embedding = self.embedding_model.encode(text, convert_to_tensor=False)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors
        """
        try:
            embeddings = self.embedding_model.encode(texts, convert_to_tensor=False)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Failed to generate embeddings: {e}")
            raise
    
    def store_content_chunks(self, content_id: str, chunks: List[Document], content_type: str = "video") -> bool:
        """Store content chunks in ChromaDB with embeddings.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            chunks: List of document chunks from content
            content_type: Type of content ("video" or "blog")
            
        Returns:
            True if successful, False otherwise
        """
        if not chunks:
            logger.warning("No chunks provided for storage")
            return True
        
        try:
            collection = self._get_or_create_collection(content_id, content_type)
            
            # Check if this content already has data stored
            existing_count = collection.count()
            if existing_count > 0:
                content_name = "Video" if content_type == "video" else "Blog"
                logger.info(f"{content_name} {content_id} already has {existing_count} chunks stored")
                return True
            
            # Prepare data for ChromaDB
            texts = [chunk.page_content for chunk in chunks]
            embeddings = self.embed_texts(texts)
            
            # Generate unique IDs for each chunk
            content_hash = hashlib.md5(content_id.encode()).hexdigest()[:8]
            ids = [f"{content_type}_{content_hash}_chunk_{i}" for i in range(len(chunks))]
            
            # Prepare metadata
            metadatas = [
                {
                    "content_id": content_id,
                    "content_type": content_type,
                    "chunk_index": i,
                    "text_length": len(chunk.page_content),
                    **chunk.metadata
                }
                for i, chunk in enumerate(chunks)
            ]
            
            # Store in ChromaDB
            collection.add(
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas,
                ids=ids
            )
            
            content_name = "Video" if content_type == "video" else "Blog"
            logger.info(f"Successfully stored {len(chunks)} chunks for {content_name.lower()} {content_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to store content chunks: {e}")
            return False

    def store_transcript_chunks(self, video_id: str, chunks: List[Document]) -> bool:
        """Store transcript chunks in ChromaDB with embeddings (backward compatibility).
        
        Args:
            video_id: YouTube video ID
            chunks: List of document chunks from transcript
            
        Returns:
            True if successful, False otherwise
        """
        return self.store_content_chunks(video_id, chunks, "video")

    def similarity_search(
        self, 
        content_id: str, 
        query: str, 
        k: int = 5,
        score_threshold: float = 0.0,
        content_type: str = "video"
    ) -> List[Tuple[Document, float]]:
        """Perform similarity search for relevant chunks.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            query: Search query
            k: Number of results to return
            score_threshold: Minimum similarity score threshold
            content_type: Type of content ("video" or "blog")
            
        Returns:
            List of (Document, score) tuples
        """
        try:
            collection = self._get_or_create_collection(content_id, content_type)
            
            # Check if collection has data
            collection_count = collection.count()
            content_name = "Video" if content_type == "video" else "Blog"
            logger.info(f"Collection for {content_name.lower()} {content_id} has {collection_count} documents")
            
            if collection_count == 0:
                logger.warning(f"No data found for {content_name.lower()} {content_id}")
                return []
            
            # Generate query embedding
            query_embedding = self.embed_text(query)
            logger.debug(f"Generated query embedding with {len(query_embedding)} dimensions")
            
            # Perform similarity search
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=k,
                include=["documents", "metadatas", "distances"]
            )
            
            logger.debug(f"Raw ChromaDB results: {len(results.get('documents', [[]])[0])} documents returned")
            
            # Process results
            documents_with_scores = []
            
            if results['documents'] and results['documents'][0]:
                logger.debug(f"Processing {len(results['documents'][0])} documents from ChromaDB")
                for i, (doc_text, metadata, distance) in enumerate(
                    zip(results['documents'][0], results['metadatas'][0], results['distances'][0])
                ):
                    # Convert distance to similarity score (ChromaDB uses cosine distance)
                    # Cosine similarity = 1 - cosine distance
                    similarity_score = 1 - distance
                    
                    logger.debug(f"Document {i+1}: distance={distance:.4f}, similarity={similarity_score:.4f}, threshold={score_threshold}")
                    
                    if similarity_score >= score_threshold:
                        document = Document(
                            page_content=doc_text,
                            metadata=metadata
                        )
                        documents_with_scores.append((document, similarity_score))
                        logger.debug(f"Document {i+1} included (similarity {similarity_score:.4f} >= threshold {score_threshold})")
                    else:
                        logger.debug(f"Document {i+1} excluded (similarity {similarity_score:.4f} < threshold {score_threshold})")
            else:
                logger.warning("No documents returned from ChromaDB query")
            
            logger.info(f"Found {len(documents_with_scores)} relevant chunks for {content_name.lower()} query (threshold={score_threshold})")
            return documents_with_scores
            
        except Exception as e:
            logger.error(f"Failed to perform similarity search: {e}")
            return []
    
    def collection_exists(self, content_id: str, content_type: str = "video") -> bool:
        """Check if a collection exists for content.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            True if collection exists, False otherwise
        """
        try:
            collection_name = self._generate_collection_name(content_id, content_type)
            collections = [col.name for col in self.client.list_collections()]
            return collection_name in collections
        except Exception as e:
            logger.error(f"Error checking collection existence: {e}")
            return False
    
    def get_all_content_chunks(self, content_id: str, content_type: str = "video") -> List[Document]:
        """Get all stored chunks for content.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            List of all documents for the content
        """
        try:
            collection = self._get_or_create_collection(content_id, content_type)
            
            if collection.count() == 0:
                return []
            
            # Get all documents
            results = collection.get(include=["documents", "metadatas"])
            
            documents = []
            if results['documents']:
                for doc_text, metadata in zip(results['documents'], results['metadatas']):
                    document = Document(
                        page_content=doc_text,
                        metadata=metadata
                    )
                    documents.append(document)
            
            content_name = "Video" if content_type == "video" else "Blog"
            logger.info(f"Retrieved {len(documents)} chunks for {content_name.lower()} {content_id}")
            return documents
            
        except Exception as e:
            logger.error(f"Failed to get all chunks: {e}")
            return []
    
    def delete_content_data(self, content_id: str, content_type: str = "video") -> bool:
        """Delete all data for specific content.
        
        Args:
            content_id: Content identifier (video_id or blog_url)
            content_type: Type of content ("video" or "blog")
            
        Returns:
            True if successful, False otherwise
        """
        try:
            collection_name = self._generate_collection_name(content_id, content_type)
            
            # Delete the entire collection
            self.client.delete_collection(name=collection_name)
            content_name = "Video" if content_type == "video" else "Blog"
            logger.info(f"Deleted collection for {content_name.lower()} {content_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete content data: {e}")
            return False

    # Legacy methods for backward compatibility
    def get_all_chunks(self, video_id: str) -> List[Document]:
        """Get all stored chunks for a video (backward compatibility).
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            List of all documents for the video
        """
        return self.get_all_content_chunks(video_id, "video")
    
    def delete_video_data(self, video_id: str) -> bool:
        """Delete all data for a specific video (backward compatibility).
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            True if successful, False otherwise
        """
        return self.delete_content_data(video_id, "video")
    
 