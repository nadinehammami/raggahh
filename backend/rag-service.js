const crypto = require('crypto');
const axios = require('axios');
const {
  getDocumentByHash,
  insertDocument,
  findSimilarDocuments,
  getRagSetting
} = require('./database');

// Configuration - Ensure env vars are loaded
require('dotenv').config();

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama_ai:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const RAG_ENABLED = process.env.RAG_ENABLED === 'true';
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.85;
const MAX_SIMILAR_DOCUMENTS = parseInt(process.env.MAX_SIMILAR_DOCUMENTS) || 5;

/**
 * Generate SHA-256 hash of file content
 */
function generateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate embedding for text using Ollama embedding model
 */
async function generateEmbedding(text) {
  try {
    const embeddingStartTime = Date.now();
    console.log(`\n=== GENERATING EMBEDDING ===`);
    console.log(`Text length: ${text.length} characters`);
    console.log(`Model: ${EMBEDDING_MODEL}`);
    console.log(`Text preview: ${text.slice(0, 200)}...`);
    
    const response = await axios.post(
      `${OLLAMA_HOST}/api/embeddings`,
      {
        model: EMBEDDING_MODEL,
        prompt: text
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000 // 1 minute timeout for embeddings
      }
    );
    
    console.log(`Embedding response status: ${response.status}`);
    
    if (!response.data.embedding || !Array.isArray(response.data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }
    
    const embedding = response.data.embedding;
    const embeddingTime = Date.now() - embeddingStartTime;
    console.log(`✅ Generated embedding with ${embedding.length} dimensions in ${embeddingTime}ms`);
    console.log(`📊 Embedding sample: [${embedding.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`);
    
    return embedding;
    
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    if (error.response) {
      console.error('Ollama response status:', error.response.status);
      console.error('Ollama response data:', error.response.data);
    }
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

// Cosine similarity is now handled in database.js

/**
 * Process document with RAG - main entry point (OPTIMIZED)
 * @param {Object} file - Uploaded file object
 * @param {string} extractedText - Extracted text from document
 * @param {string|null} aiSummary - AI summary (null if not generated yet for optimization)
 */
async function processDocumentWithRAG(file, extractedText, aiSummary = null) {
  try {
    if (!RAG_ENABLED) {
      console.log('RAG is disabled, proceeding with normal processing');
      return {
        isFromRAG: false,
        aiSummary: aiSummary,
        similarDocuments: []
      };
    }
    
    console.log(`\n=== RAG PROCESSING START ===`);
    console.log(`File: ${file.originalname}`);
    console.log(`Size: ${file.size} bytes`);
    console.log(`Type: ${file.mimetype}`);
    
    // Step 1: Generate file hash
    const fileHash = generateFileHash(file.buffer);
    console.log(`File hash: ${fileHash}`);
    
    // Step 2: Check if exact same file already exists
    const existingDoc = await getDocumentByHash(fileHash);
    if (existingDoc) {
      console.log(`✅ Exact document found in database (ID: ${existingDoc.id})`);
      console.log(`📄 Returning cached summary from: ${existingDoc.created_at}`);
      
      return {
        isFromRAG: true,
        aiSummary: existingDoc.ai_summary,
        similarDocuments: [],
        exactMatch: true,
        matchedDocument: {
          id: existingDoc.id,
          filename: existingDoc.filename,
          created_at: existingDoc.created_at
        }
      };
    }
    
    // Step 3: Generate embedding for the extracted text
    console.log('\n=== GENERATING EMBEDDING FOR SIMILARITY SEARCH ===');
    const embedding = await generateEmbedding(extractedText);
    
    // Step 4: Find similar documents
    console.log('\n=== SEARCHING FOR SIMILAR DOCUMENTS ===');
    const threshold = await getRagSetting('similarity_threshold') || SIMILARITY_THRESHOLD;
    const maxDocs = await getRagSetting('max_similar_documents') || MAX_SIMILAR_DOCUMENTS;
    
    console.log(`Using threshold: ${threshold}, max documents: ${maxDocs}`);
    
    const similarDocs = await findSimilarDocuments(
      embedding, 
      parseFloat(threshold), 
      parseInt(maxDocs)
    );
    
    console.log(`Found ${similarDocs.length} similar documents`);
    
    // Step 5: Check if we have a very similar document
    const highestSimilarity = similarDocs.length > 0 ? similarDocs[0].similarity_score : 0;
    const useExistingSummary = highestSimilarity >= parseFloat(threshold);
    
    if (useExistingSummary && similarDocs.length > 0) {
      const bestMatch = similarDocs[0];
      console.log(`🎯 High similarity found (${bestMatch.similarity_score.toFixed(4)})`);
      console.log(`📝 Using existing summary from: ${bestMatch.filename}`);
      
      // Still store the new document but reference the similar one
      await insertDocument({
        filename: file.originalname,
        file_hash: fileHash,
        file_size: file.size,
        mime_type: file.mimetype,
        extracted_text: extractedText,
        ai_summary: `[Similar to: ${bestMatch.filename}]\n\n${bestMatch.ai_summary}`,
        embedding: embedding,
        embedding_model: EMBEDDING_MODEL
      });
      
      return {
        isFromRAG: true,
        aiSummary: bestMatch.ai_summary,
        similarDocuments: similarDocs,
        exactMatch: false,
        bestMatch: {
          filename: bestMatch.filename,
          similarity_score: bestMatch.similarity_score,
          created_at: bestMatch.created_at
        }
      };
    }
    
    // Step 6: No similar document found
    console.log(`📝 No sufficiently similar documents found (best: ${highestSimilarity.toFixed(4)})`);
    
    if (aiSummary === null) {
      // OPTIMIZATION: Don't store yet, signal that AI summary generation is needed
      console.log('⚡ OPTIMIZED: Need to generate AI summary first');
      console.log(`=== RAG PROCESSING COMPLETE (Need AI Generation) ===\n`);
      
      return {
        isFromRAG: false,
        aiSummary: null,
        similarDocuments: similarDocs,
        exactMatch: false,
        fileHash: fileHash,
        embedding: embedding,
        needsAiGeneration: true
      };
    } else {
      // AI summary provided, store the new document
      console.log('💾 Storing new document in RAG database');
      
      const documentId = await insertDocument({
        filename: file.originalname,
        file_hash: fileHash,
        file_size: file.size,
        mime_type: file.mimetype,
        extracted_text: extractedText,
        ai_summary: aiSummary,
        embedding: embedding,
        embedding_model: EMBEDDING_MODEL
      });
      
      console.log(`✅ Document stored with ID: ${documentId}`);
      console.log(`=== RAG PROCESSING COMPLETE ===\n`);
      
      return {
        isFromRAG: false,
        aiSummary,
        similarDocuments: similarDocs,
        exactMatch: false,
        newDocumentId: documentId
      };
    }
    
  } catch (error) {
    console.error('RAG processing error:', error.message);
    console.error('RAG error stack:', error.stack);
    
    // Fall back to normal processing if RAG fails
    console.log('⚠️ RAG failed, falling back to normal processing');
    return {
      isFromRAG: false,
      aiSummary,
      similarDocuments: [],
      error: error.message
    };
  }
}

/**
 * Get RAG system status and statistics
 */
async function getRagStatus() {
  // Get fresh environment variables
  const currentRagEnabled = process.env.RAG_ENABLED === 'true';
  const currentEmbeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
  const currentSimilarityThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.85;
  const currentMaxSimilarDocuments = parseInt(process.env.MAX_SIMILAR_DOCUMENTS) || 5;
  const currentOllamaHost = process.env.OLLAMA_HOST || 'http://ollama_ai:11434';
  
  // Basic status without potentially failing operations
  const basicStatus = {
    enabled: currentRagEnabled,
    ollama_host: currentOllamaHost,
    embedding_model: currentEmbeddingModel,
    similarity_threshold: currentSimilarityThreshold,
    max_similar_documents: currentMaxSimilarDocuments
  };
  
  // Try database stats
  try {
    const { getDatabaseStats } = require('./database');
    const stats = await getDatabaseStats();
    basicStatus.database_stats = stats;
  } catch (dbError) {
    basicStatus.database_stats = { error: dbError.message };
  }
  
  // Try embedding test
  try {
    const testEmbedding = await generateEmbedding("Test text for RAG status check");
    basicStatus.embedding_test = {
      success: true,
      dimension: testEmbedding.length
    };
  } catch (embError) {
    basicStatus.embedding_test = {
      success: false,
      error: embError.message
    };
  }
  
  return basicStatus;
}

module.exports = {
  processDocumentWithRAG,
  generateEmbedding,
  generateFileHash,
  getRagStatus,
  RAG_ENABLED
};
