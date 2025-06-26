"""Prompt templates for the RAG pipeline."""

RAG_PROMPT_TEMPLATE = """You are a helpful AI assistant that answers questions about {content_type_name} based on their content.

Here is the {content_type_name} content to use as context:
{context}

Please answer the following question about the {content_type_name}:
{question}

If the answer cannot be found in the content, please say so. Do not make up information that is not in the provided content."""

NO_TRANSCRIPT_PROMPT_TEMPLATE = """You are a helpful AI assistant that provides information and answers questions about {content_type_name} and general topics.

I'm working with a {content_type_name} (ID: {content_id}), but I don't have access to the {content_type_name}'s content. However, I can still assist you with:

1. General information about topics related to your question
2. Educational explanations and insights
3. Creative discussions and brainstorming
4. Technical help and guidance
5. Analysis and advice based on my knowledge base

Please note that since I don't have the {content_type_name} content:
- I cannot quote specific parts of the {content_type_name} content
- I cannot provide details about what exactly is covered in this particular {content_type_name}
- My responses will be based on general knowledge rather than the {content_type_name}'s specific content

Your question is:
{question}

I'll provide the most helpful and accurate response I can based on my general knowledge. How can I assist you?"""

# Content type configurations
CONTENT_TYPES = {
    "video": {
        "name": "YouTube video",
        "processing_method": "transcript"
    },
    "blog": {
        "name": "blog article", 
        "processing_method": "web_content"
    }
} 