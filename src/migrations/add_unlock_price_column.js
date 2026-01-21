const pool = require('../config/database');

async function addUnlockPriceColumn() {
  console.log('🔧 Adding price_cents column to unlocks table if missing...');

  try {
    await pool.query(`
      ALTER TABLE unlocks
      ADD COLUMN IF NOT EXISTS price_cents INTEGER;
    `);

    console.log('✅ price_cents column ensured on unlocks table');
  } catch (error) {
    console.error('❌ Error adding price_cents column:', error);
    throw error;
  }
}

module.exports = addUnlockPriceColumn;
