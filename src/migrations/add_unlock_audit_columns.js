const pool = require('../config/database');

async function addUnlockAuditColumns() {
  console.log('🔧 Adding audit trail columns to unlocks table...');
  
  try {
    // List of audit trail columns that should exist
    const auditColumns = [
      { name: 'teaser_sent_at', type: 'TIMESTAMP' },
      { name: 'y_received_at', type: 'TIMESTAMP' },
      { name: 'payment_link_sent_at', type: 'TIMESTAMP' },
      { name: 'paid_at', type: 'TIMESTAMP' },
      { name: 'revealed_at', type: 'TIMESTAMP' }
    ];
    
    // Check which columns already exist
    const existingColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'unlocks';
    `);
    
    const existingColumnNames = existingColumns.rows.map(row => row.column_name);
    console.log('📋 Existing columns:', existingColumnNames);
    
    // Add missing audit columns
    for (const column of auditColumns) {
      if (!existingColumnNames.includes(column.name)) {
        console.log(`📋 Adding ${column.name} column...`);
        
        await pool.query(`
          ALTER TABLE unlocks 
          ADD COLUMN ${column.name} ${column.type};
        `);
        
        console.log(`✅ ${column.name} column added successfully`);
      } else {
        console.log(`✅ ${column.name} column already exists`);
      }
    }
    
    // Create indexes for audit columns (for performance)
    console.log('📈 Creating indexes for audit columns...');
    
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_unlocks_teaser_sent_at ON unlocks(teaser_sent_at);',
      'CREATE INDEX IF NOT EXISTS idx_unlocks_y_received_at ON unlocks(y_received_at);',
      'CREATE INDEX IF NOT EXISTS idx_unlocks_payment_link_sent_at ON unlocks(payment_link_sent_at);',
      'CREATE INDEX IF NOT EXISTS idx_unlocks_paid_at ON unlocks(paid_at);',
      'CREATE INDEX IF NOT EXISTS idx_unlocks_revealed_at ON unlocks(revealed_at);'
    ];
    
    for (const indexQuery of indexQueries) {
      await pool.query(indexQuery);
    }
    
    console.log('✅ Audit column indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error adding audit columns:', error);
    throw error;
  }
}

module.exports = addUnlockAuditColumns;
