const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'openbee_rag',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    
    // Test basic query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Database query test successful');
    
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Execute query with error handling
async function executeQuery(sql, params = []) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error.message);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

// Get a single document by hash
async function getDocumentByHash(fileHash) {
  const sql = `
    SELECT id, filename, file_hash, file_size, mime_type, 
           extracted_text, ai_summary, embedding, embedding_model,
           created_at, updated_at
    FROM documents 
    WHERE file_hash = ?
  `;
  const results = await executeQuery(sql, [fileHash]);
  return results.length > 0 ? results[0] : null;
}

// Insert a new document
async function insertDocument(document) {
  const sql = `
    INSERT INTO documents (
      filename, file_hash, file_size, mime_type, 
      extracted_text, ai_summary, embedding, embedding_model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    document.filename,
    document.file_hash,
    document.file_size,
    document.mime_type,
    document.extracted_text,
    document.ai_summary,
    JSON.stringify(document.embedding),
    document.embedding_model
  ];
  
  const result = await executeQuery(sql, params);
  return result.insertId;
}

// Find similar documents using cosine similarity
async function findSimilarDocuments(embedding, threshold = 0.85, limit = 5) {
  try {
    // Performance optimization: Add timing logs
    const startTime = Date.now();
    console.log('🔍 Finding similar documents using JS-based similarity...');
    
    // Performance optimization: Order by created_at DESC to check newest documents first
    // (newer documents are more likely to be similar to what user is uploading)
    const getAllDocsSQL = 'SELECT id, filename, file_hash, ai_summary, created_at, embedding FROM documents ORDER BY created_at DESC';
    const queryStartTime = Date.now();
    const allDocs = await executeQuery(getAllDocsSQL);
    console.log(`📊 DB Query Time: ${Date.now() - queryStartTime}ms, Documents: ${allDocs?.length || 0}`);
    
    if (!allDocs || allDocs.length === 0) {
      console.log('📭 No documents in database for similarity comparison');
      return [];
    }
    
    const similarities = [];
    const calcStartTime = Date.now();
    let calculationsCount = 0;
    
    for (const doc of allDocs) {
      try {
        // MySQL JSON column already returns JavaScript object/array, no need to JSON.parse
        const docEmbedding = doc.embedding;
        const similarity = calculateCosineSimilarity(embedding, docEmbedding);
        calculationsCount++;
        
        // Performance optimization: Only keep documents above threshold
        if (similarity >= threshold) {
          similarities.push({
            id: doc.id,
            filename: doc.filename,
            file_hash: doc.file_hash,
            ai_summary: doc.ai_summary,
            created_at: doc.created_at,
            similarity_score: similarity
          });
          
          // Early termination: If we find a very high similarity (>0.95), stop searching
          if (similarity > 0.95) {
            console.log(`🎯 Found very high similarity (${similarity.toFixed(4)}), stopping search early`);
            break;
          }
        }
      } catch (parseError) {
        console.error(`❌ Error parsing embedding for document ${doc.id}:`, parseError.message);
      }
    }
    
    console.log(`🧮 Similarity Calculations: ${calculationsCount} docs in ${Date.now() - calcStartTime}ms`);
    console.log(`🎯 Found ${similarities.length} documents above threshold ${threshold}`);
    
    // Sort by similarity score (highest first) and limit results
    similarities.sort((a, b) => b.similarity_score - a.similarity_score);
    const result = similarities.slice(0, limit);
    
    console.log(`⏱️ Total similarity search time: ${Date.now() - startTime}ms`);
    return result;
    
  } catch (error) {
    console.error('Error in findSimilarDocuments:', error);
    return [];
  }
}

// JavaScript implementation of cosine similarity
function calculateCosineSimilarity(vec1, vec2) {
  if (!Array.isArray(vec1) || !Array.isArray(vec2) || vec1.length !== vec2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }
  
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
}

// Get RAG system settings
async function getRagSetting(key) {
  const sql = 'SELECT setting_value FROM rag_settings WHERE setting_key = ?';
  const results = await executeQuery(sql, [key]);
  return results.length > 0 ? results[0].setting_value : null;
}

// Update RAG system settings
async function updateRagSetting(key, value) {
  const sql = `
    INSERT INTO rag_settings (setting_key, setting_value) 
    VALUES (?, ?) 
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
  `;
  await executeQuery(sql, [key, value]);
}

// Get database statistics
async function getDatabaseStats() {
  try {
    const documentCountSql = 'SELECT COUNT(*) as total_documents FROM documents';
    const avgSimilaritySql = `
      SELECT AVG(similarity_score) as avg_similarity, 
             COUNT(*) as cache_entries 
      FROM similarity_cache 
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `;
    
    const documentCountResults = await executeQuery(documentCountSql);
    const similarityStatsResults = await executeQuery(avgSimilaritySql);
    
    // Handle case where results might be an array or not
    const docCount = Array.isArray(documentCountResults) 
      ? documentCountResults[0]?.total_documents || 0
      : documentCountResults?.total_documents || 0;
      
    const avgSim = Array.isArray(similarityStatsResults)
      ? similarityStatsResults[0]?.avg_similarity || 0
      : similarityStatsResults?.avg_similarity || 0;
      
    const cacheCount = Array.isArray(similarityStatsResults)
      ? similarityStatsResults[0]?.cache_entries || 0
      : similarityStatsResults?.cache_entries || 0;
    
    const result = {
      total_documents: docCount,
      avg_similarity: avgSim,
      cache_entries: cacheCount
    };
    
    return result;
    
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    console.error('Error stack:', error.stack);
    return {
      total_documents: 0,
      avg_similarity: 0,
      cache_entries: 0,
      error: error.message
    };
  }
}

module.exports = {
  pool,
  testConnection,
  executeQuery,
  getDocumentByHash,
  insertDocument,
  findSimilarDocuments,
  calculateCosineSimilarity,
  getRagSetting,
  updateRagSetting,
  getDatabaseStats
};
