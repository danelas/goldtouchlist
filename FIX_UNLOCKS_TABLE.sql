-- Fix unlocks table schema - Run this in your PostgreSQL database
-- Database: postgresql://goldtouchlistdb_user:n13rn3x1BRZdzBFoM94VAj9ng8Unr8bB@dpg-d42idd7gi27c73c6lhlg-a/goldtouchlistdb

-- Add missing columns to unlocks table
ALTER TABLE unlocks ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
ALTER TABLE unlocks ADD COLUMN IF NOT EXISTS ttl_expires_at TIMESTAMP;
ALTER TABLE unlocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_unlocks_idempotency_key ON unlocks(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_unlocks_ttl_expires_at ON unlocks(ttl_expires_at);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'unlocks' 
ORDER BY ordinal_position;
