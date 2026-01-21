const express = require('express');
const router = express.Router();

// One-time migration page (GET request for browser access)
router.get('/add-price-column', async (req, res) => {
  try {
    console.log('🔧 ONE-TIME MIGRATION: Adding price_cents column...');
    
    // Run the unlock price column migration
    const addUnlockPriceColumn = require('../migrations/add_unlock_price_column');
    await addUnlockPriceColumn();
    
    console.log('✅ price_cents column migration completed successfully');
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Migration Complete</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 50px; background: #f0f0f0; }
          .container { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .info { color: #666; line-height: 1.6; }
          .timestamp { color: #999; font-size: 14px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Migration Successful!</div>
          <div class="info">
            <p>The <code>price_cents</code> column has been added to the <code>unlocks</code> table.</p>
            <p><strong>Category pricing is now enabled:</strong></p>
            <ul>
              <li>Skincare: $18.00</li>
              <li>Cleaning: $13.00</li>
              <li>Beauty/Makeup/Esthetics: $12.00</li>
              <li>Massage/Bodywork: $15.00</li>
            </ul>
            <p>You can now submit new leads and they will use category-specific pricing.</p>
          </div>
          <div class="timestamp">Completed at: ${new Date().toISOString()}</div>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Migration Failed</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 50px; background: #f0f0f0; }
          .container { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
          .details { background: #f8d7da; padding: 15px; border-radius: 5px; color: #721c24; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">❌ Migration Failed</div>
          <p>An error occurred while adding the price_cents column.</p>
          <div class="details">
            <strong>Error:</strong><br>
            ${error.message}
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// Manual migration trigger endpoint
router.post('/run-migrations', async (req, res) => {
  try {
    console.log('🔧 MANUAL MIGRATION: Running database migrations...');
    
    // Run the idempotency key migration
    const addIdempotencyKey = require('../migrations/add_idempotency_key');
    await addIdempotencyKey();
    
    // Run the unlock constraints migration
    const addUnlockConstraints = require('../migrations/add_unlock_constraints');
    await addUnlockConstraints();
    
    // Run the unlock audit columns migration
    const addUnlockAuditColumns = require('../migrations/add_unlock_audit_columns');
    await addUnlockAuditColumns();
    
    // Run the unlock price column migration
    const addUnlockPriceColumn = require('../migrations/add_unlock_price_column');
    await addUnlockPriceColumn();
    
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
