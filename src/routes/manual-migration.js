const express = require('express');
const router = express.Router();

// Manual migration trigger endpoint
router.post('/run-migrations', async (req, res) => {
  try {
    console.log('🔧 MANUAL MIGRATION: Running database migrations...');
    
    // Run the idempotency key migration
    const addIdempotencyKey = require('../migrations/add_idempotency_key');
    await addIdempotencyKey();
    
    console.log('✅ Manual migration completed successfully');
    
    res.json({
      success: true,
      message: 'Database migrations completed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Manual migration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check database schema endpoint
router.get('/check-schema', async (req, res) => {
  try {
    const pool = require('../config/database');
    
    // Check unlocks table columns
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'unlocks' 
      ORDER BY ordinal_position;
    `);
    
    // Check if required columns exist
    const columns = columnsResult.rows.map(row => row.column_name);
    const requiredColumns = ['idempotency_key', 'ttl_expires_at', 'updated_at'];
    const missingColumns = requiredColumns.filter(col => !columns.includes(col));
    
    res.json({
      success: true,
      table: 'unlocks',
      columns: columnsResult.rows,
      required_columns: requiredColumns,
      missing_columns: missingColumns,
      schema_complete: missingColumns.length === 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Schema check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Schema check failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
