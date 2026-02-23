const pool = require('../config/database');

async function up() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_contact_followups (
        id SERIAL PRIMARY KEY,
        lead_id UUID NOT NULL REFERENCES leads(lead_id),
        provider_id INTEGER NOT NULL REFERENCES providers(provider_id),
        status VARCHAR(50) DEFAULT 'SCHEDULED',
        sent_at TIMESTAMP,
        responded_at TIMESTAMP,
        response_value INTEGER, -- 1 for Yes, 2 for Not yet
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lead_id, provider_id)
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_followups_lead_provider ON provider_contact_followups(lead_id, provider_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_followups_status ON provider_contact_followups(status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_followups_sent_at ON provider_contact_followups(sent_at)
    `);

    // Create trigger for updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_provider_followups_updated_at()
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
      WHERE tgname = 'update_provider_followups_updated_at' 
      AND tgrelid = 'provider_contact_followups'::regclass
    `);

    if (triggerExists.rows.length === 0) {
      await pool.query(`
        CREATE TRIGGER update_provider_followups_updated_at 
          BEFORE UPDATE ON provider_contact_followups 
          FOR EACH ROW EXECUTE FUNCTION update_provider_followups_updated_at()
      `);
    }

    console.log('✅ Provider contact follow-ups table created successfully');
  } catch (error) {
    console.error('Error creating provider contact follow-ups table:', error);
    throw error;
  }
}

async function down() {
  try {
    await pool.query('DROP TABLE IF EXISTS provider_contact_followups');
    console.log('✅ Provider contact follow-ups table dropped successfully');
  } catch (error) {
    console.error('Error dropping provider contact follow-ups table:', error);
    throw error;
  }
}

module.exports = { up, down };
