const pool = require('../config/database');

async function addUnlockConstraints() {
  console.log('🔧 Adding unique constraints to unlocks table...');
  
  try {
    // Check if the unique constraint already exists
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'unlocks' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'unlocks_lead_provider_unique';
    `);
    
    if (constraintCheck.rows.length === 0) {
      console.log('📋 Adding unique constraint on (lead_id, provider_id)...');
      
      await pool.query(`
        ALTER TABLE unlocks 
        ADD CONSTRAINT unlocks_lead_provider_unique 
        UNIQUE (lead_id, provider_id);
      `);
      
      console.log('✅ Unique constraint added successfully');
    } else {
      console.log('✅ Unique constraint already exists');
    }
    
    // Also ensure the idempotency_key has a unique constraint
    const idempotencyConstraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'unlocks' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%idempotency_key%';
    `);
    
    if (idempotencyConstraintCheck.rows.length === 0) {
      console.log('📋 Adding unique constraint on idempotency_key...');
      
      await pool.query(`
        ALTER TABLE unlocks 
        ADD CONSTRAINT unlocks_idempotency_key_unique 
        UNIQUE (idempotency_key);
      `);
      
      console.log('✅ Idempotency key unique constraint added successfully');
    } else {
      console.log('✅ Idempotency key unique constraint already exists');
    }
    
  } catch (error) {
    console.error('❌ Error adding unique constraints:', error);
    throw error;
  }
}

module.exports = addUnlockConstraints;
