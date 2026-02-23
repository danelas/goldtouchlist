const pool = require('./src/config/database');

async function runMigration() {
  try {
    console.log('Running provider_contact_followups table migration...');
    
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
      CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_lead_id 
      ON provider_contact_followups(lead_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_provider_id 
      ON provider_contact_followups(provider_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_status 
      ON provider_contact_followups(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_sent_at 
      ON provider_contact_followups(sent_at)
    `);

    // Create trigger for updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_provider_contact_followups_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS update_provider_contact_followups_updated_at_trigger 
      ON provider_contact_followups
    `);

    await pool.query(`
      CREATE TRIGGER update_provider_contact_followups_updated_at_trigger
        BEFORE UPDATE ON provider_contact_followups
        FOR EACH ROW
        EXECUTE FUNCTION update_provider_contact_followups_updated_at()
    `);

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
