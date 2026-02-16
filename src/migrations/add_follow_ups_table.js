/**
 * Migration: Create follow_ups table for client check-in SMS system
 */

const pool = require('../config/database');

async function up() {
  console.log('Running migration: Create follow_ups table...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id SERIAL PRIMARY KEY,
      lead_id UUID NOT NULL,
      provider_id VARCHAR(100) NOT NULL,
      client_phone VARCHAR(20) NOT NULL,
      client_name VARCHAR(255),
      provider_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'SCHEDULED',
      send_after TIMESTAMP NOT NULL,
      sent_at TIMESTAMP,
      replied_at TIMESTAMP,
      recovery_offered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_follow_ups_send_after ON follow_ups(send_after)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_follow_ups_client_phone ON follow_ups(client_phone)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_follow_ups_lead_provider ON follow_ups(lead_id, provider_id)
  `);

  console.log('✅ Migration complete: follow_ups table created');
}

async function down() {
  console.log('Rolling back migration: Drop follow_ups table...');
  await pool.query('DROP TABLE IF EXISTS follow_ups');
  console.log('✅ Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
