const pool = require('../config/database');

async function addIdempotencyKey() {
  console.log('🔧 Adding missing columns to unlocks table...');
  
  try {
    // Check if idempotency_key column exists
    const idempotencyCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'unlocks' 
      AND column_name = 'idempotency_key';
    `);
    
    if (idempotencyCheck.rows.length === 0) {
      console.log('📋 Adding idempotency_key column...');
      
      await pool.query(`
        ALTER TABLE unlocks 
        ADD COLUMN idempotency_key VARCHAR(255) UNIQUE;
      `);
      
      console.log('✅ idempotency_key column added successfully');
    } else {
      console.log('✅ idempotency_key column already exists');
    }
    
    // Check if ttl_expires_at column exists
    const ttlCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'unlocks' 
      AND column_name = 'ttl_expires_at';
    `);
    
    if (ttlCheck.rows.length === 0) {
      console.log('📋 Adding ttl_expires_at column...');
      
      await pool.query(`
        ALTER TABLE unlocks 
        ADD COLUMN ttl_expires_at TIMESTAMP;
      `);
      
      console.log('✅ ttl_expires_at column added successfully');
    } else {
      console.log('✅ ttl_expires_at column already exists');
    }
    
    // Check if updated_at column exists
    const updatedAtCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'unlocks' 
      AND column_name = 'updated_at';
    `);
    
    if (updatedAtCheck.rows.length === 0) {
      console.log('📋 Adding updated_at column...');
      
      await pool.query(`
        ALTER TABLE unlocks 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      `);
      
      console.log('✅ updated_at column added successfully');
    } else {
      console.log('✅ updated_at column already exists');
    }
    
    // Add indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_unlocks_idempotency_key 
      ON unlocks(idempotency_key);
      
      CREATE INDEX IF NOT EXISTS idx_unlocks_ttl_expires_at 
      ON unlocks(ttl_expires_at);
    `);
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error adding idempotency_key column:', error);
    throw error;
  }
}

module.exports = addIdempotencyKey;
