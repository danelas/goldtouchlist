const pool = require('../config/database');

async function up() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS manual_messages (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        message_type VARCHAR(50) DEFAULT 'outbound',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        response_received_at TIMESTAMP,
        response_text TEXT,
        ai_context TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_manual_messages_phone ON manual_messages(phone)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_manual_messages_sent_at ON manual_messages(sent_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_manual_messages_response_received ON manual_messages(response_received_at)
    `);

    // Create trigger for updated_at (only if it doesn't exist)
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_manual_messages_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Check if trigger already exists before creating
    const triggerExists = await pool.query(`
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'update_manual_messages_updated_at' 
      AND tgrelid = 'manual_messages'::regclass
    `);

    if (triggerExists.rows.length === 0) {
      await pool.query(`
        CREATE TRIGGER update_manual_messages_updated_at 
          BEFORE UPDATE ON manual_messages 
          FOR EACH ROW EXECUTE FUNCTION update_manual_messages_updated_at()
      `);
    }

    console.log('✅ Manual messages table created successfully');
  } catch (error) {
    console.error('Error creating manual messages table:', error);
    throw error;
  }
}

async function down() {
  try {
    await pool.query('DROP TABLE IF EXISTS manual_messages');
    console.log('✅ Manual messages table dropped successfully');
  } catch (error) {
    console.error('Error dropping manual messages table:', error);
    throw error;
  }
}

module.exports = { up, down };
