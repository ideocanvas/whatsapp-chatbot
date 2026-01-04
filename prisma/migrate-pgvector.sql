-- ============================================================================
-- pgvector Migration SQL
-- ============================================================================

-- Drop unused Document table (not used in the application)
DROP TABLE IF EXISTS "Document" CASCADE;

-- Drop the incorrectly sized column from Knowledge table
ALTER TABLE "Knowledge" DROP COLUMN IF EXISTS "embedding";

-- Add column with correct dimensions (768)
ALTER TABLE "Knowledge" ADD COLUMN "embedding" vector(768);

-- Create helper functions to convert BYTEA (Float64Array) to pgvector array
CREATE OR REPLACE FUNCTION bytea_to_vector_array(bytea_bytea bytea)
RETURNS float8[] AS $$
DECLARE
    result float8[];
    i int;
    len int;
BEGIN
    len := length(bytea_bytea) / 8;
    result := array_fill(0.0, ARRAY[len]);
    
    FOR i IN 0..(len - 1) LOOP
        result[i + 1] := get_float8(bytea_bytea, i * 8);
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to get float8 from BYTEA at specific offset
CREATE OR REPLACE FUNCTION get_float8(bytea_bytea bytea, byte_offset int)
RETURNS float8 AS $$
BEGIN
    RETURN get_byte(bytea_bytea, byte_offset)::float8 +
           get_byte(bytea_bytea, byte_offset + 1)::float8 * 256 +
           get_byte(bytea_bytea, byte_offset + 2)::float8 * 65536 +
           get_byte(bytea_bytea, byte_offset + 3)::float8 * 16777216 +
           get_byte(bytea_bytea, byte_offset + 4)::float8 * 4294967296 +
           get_byte(bytea_bytea, byte_offset + 5)::float8 * 1099511627776 +
           get_byte(bytea_bytea, byte_offset + 6)::float8 * 281474976710656 +
           get_byte(bytea_bytea, byte_offset + 7)::float8 * 72057594037927936;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Migrate data from BYTEA vector to pgvector embedding for Knowledge
UPDATE "Knowledge"
SET "embedding" = bytea_to_vector_array("vector")::vector
WHERE "embedding" IS NULL AND "vector" IS NOT NULL;

-- Create index for faster vector search
CREATE INDEX IF NOT EXISTS "Knowledge_embedding_idx" ON "Knowledge" USING hnsw ("embedding" vector_cosine_ops);

-- ============================================================================
-- Verification Query
-- ============================================================================
-- SELECT 
--     COUNT(*) as total,
--     COUNT("embedding") as with_embedding
-- FROM "Knowledge";
-- ============================================================================