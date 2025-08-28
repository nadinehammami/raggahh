-- OpenBee RAG Database Schema
-- This script initializes the database for document storage and retrieval

USE openbee_rag;

-- Table to store documents with their embeddings and AI-generated summaries
CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of file content
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    extracted_text LONGTEXT NOT NULL,
    ai_summary LONGTEXT NOT NULL,
    embedding JSON NOT NULL, -- Store the vector as JSON array
    embedding_model VARCHAR(100) DEFAULT 'nomic-embed-text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Index for faster similarity searches
    INDEX idx_file_hash (file_hash),
    INDEX idx_mime_type (mime_type),
    INDEX idx_created_at (created_at)
);

-- Table to store similarity search results for caching
CREATE TABLE IF NOT EXISTS similarity_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    query_hash VARCHAR(64) NOT NULL, -- Hash of the query embedding
    document_id INT NOT NULL,
    similarity_score DECIMAL(10,8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    INDEX idx_query_hash (query_hash),
    INDEX idx_similarity_score (similarity_score DESC)
);

-- Table for system settings and configuration
CREATE TABLE IF NOT EXISTS rag_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT IGNORE INTO rag_settings (setting_key, setting_value, description) VALUES 
('similarity_threshold', '0.85', 'Minimum cosine similarity score to consider documents as similar'),
('max_similar_documents', '5', 'Maximum number of similar documents to return'),
('embedding_dimension', '768', 'Dimension of the embedding vectors'),
('cache_expiry_hours', '24', 'Hours after which similarity cache entries expire');

-- Function to calculate cosine similarity (stored procedure)
DELIMITER //

CREATE FUNCTION IF NOT EXISTS cosine_similarity(vec1 JSON, vec2 JSON) 
RETURNS DECIMAL(10,8)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE dot_product DECIMAL(20,8) DEFAULT 0;
    DECLARE magnitude1 DECIMAL(20,8) DEFAULT 0;
    DECLARE magnitude2 DECIMAL(20,8) DEFAULT 0;
    DECLARE i INT DEFAULT 0;
    DECLARE vec1_length INT;
    DECLARE vec2_length INT;
    DECLARE val1, val2 DECIMAL(20,8);
    
    -- Get vector lengths
    SET vec1_length = JSON_LENGTH(vec1);
    SET vec2_length = JSON_LENGTH(vec2);
    
    -- Ensure vectors have same dimension
    IF vec1_length != vec2_length THEN
        RETURN 0;
    END IF;
    
    -- Calculate dot product and magnitudes
    WHILE i < vec1_length DO
        SET val1 = CAST(JSON_UNQUOTE(JSON_EXTRACT(vec1, CONCAT('$[', i, ']'))) AS DECIMAL(20,8));
        SET val2 = CAST(JSON_UNQUOTE(JSON_EXTRACT(vec2, CONCAT('$[', i, ']'))) AS DECIMAL(20,8));
        
        SET dot_product = dot_product + (val1 * val2);
        SET magnitude1 = magnitude1 + (val1 * val1);
        SET magnitude2 = magnitude2 + (val2 * val2);
        
        SET i = i + 1;
    END WHILE;
    
    -- Calculate cosine similarity
    IF magnitude1 = 0 OR magnitude2 = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN dot_product / (SQRT(magnitude1) * SQRT(magnitude2));
END//

DELIMITER ;

-- Clean up old cache entries (older than cache_expiry_hours)
CREATE EVENT IF NOT EXISTS cleanup_similarity_cache
ON SCHEDULE EVERY 1 HOUR
DO
  DELETE FROM similarity_cache 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL (
    SELECT CAST(setting_value AS UNSIGNED) 
    FROM rag_settings 
    WHERE setting_key = 'cache_expiry_hours'
  ) HOUR);

-- Enable the event scheduler
SET GLOBAL event_scheduler = ON;
