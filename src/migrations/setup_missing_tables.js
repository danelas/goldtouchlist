const pool = require('../config/database');

async function setupMissingTables() {
  console.log('🔧 Setting up missing database tables...');
  
  try {
    // Check if leads table exists
    const leadsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'leads'
      );
    `);
    
    if (!leadsCheck.rows[0].exists) {
      console.log('📋 Creating leads table...');
      await pool.query(`
        CREATE TABLE leads (
          lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          city VARCHAR(100) NOT NULL,
          service_type VARCHAR(100) NOT NULL,
          preferred_time_window TIMESTAMP,
          session_length VARCHAR(100),
          location_type VARCHAR(100),
          contactpref VARCHAR(100),
          budget_range VARCHAR(100),
          notes_snippet TEXT,
          client_name VARCHAR(255) NOT NULL,
          client_phone VARCHAR(20) NOT NULL,
          client_email VARCHAR(255),
          exact_address TEXT,
          zip_code VARCHAR(10),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
          is_closed BOOLEAN DEFAULT false
        );
      `);
      console.log('✅ Leads table created successfully');
    } else {
      console.log('✅ Leads table already exists');
    }

    // Check if providers table exists
    const providersCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'providers'
      );
    `);
    
    if (!providersCheck.rows[0].exists) {
      console.log('👥 Creating providers table...');
      await pool.query(`
        CREATE TABLE providers (
          id VARCHAR(50) PRIMARY KEY,
          phone VARCHAR(20) UNIQUE,
          email VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          wordpress_user_id INTEGER,
          slug VARCHAR(255),
          first_lead_used BOOLEAN DEFAULT FALSE,
          sms_opted_out BOOLEAN DEFAULT FALSE,
          is_verified BOOLEAN DEFAULT TRUE,
          service_areas TEXT[],
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Providers table created successfully');
    } else {
      console.log('✅ Providers table already exists');
    }

    // Check if unlocks table exists
    const unlocksCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'unlocks'
      );
    `);
    
    if (!unlocksCheck.rows[0].exists) {
      console.log('🔓 Creating unlocks table...');
      await pool.query(`
        CREATE TABLE unlocks (
          unlock_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID NOT NULL,
          provider_id VARCHAR(50) NOT NULL,
          status VARCHAR(50) DEFAULT 'PENDING',
          payment_link_url TEXT,
          checkout_session_id VARCHAR(255),
          last_sent_at TIMESTAMP,
          unlocked_at TIMESTAMP,
          idempotency_key VARCHAR(255) UNIQUE,
          ttl_expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Unlocks table created successfully');
    } else {
      console.log('✅ Unlocks table already exists');
    }

    // Check if unlock_audit_log table exists
    const auditCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'unlock_audit_log'
      );
    `);
    
    if (!auditCheck.rows[0].exists) {
      console.log('📊 Creating unlock_audit_log table...');
      await pool.query(`
        CREATE TABLE unlock_audit_log (
          log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_id VARCHAR(50) NOT NULL,
          lead_id UUID NOT NULL,
          action VARCHAR(100) NOT NULL,
          details JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
          FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Unlock audit log table created successfully');
    } else {
      console.log('✅ Unlock audit log table already exists');
    }

    // Create indexes for better performance
    console.log('📈 Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
      CREATE INDEX IF NOT EXISTS idx_leads_service_type ON leads(service_type);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
      CREATE INDEX IF NOT EXISTS idx_unlocks_lead_id ON unlocks(lead_id);
      CREATE INDEX IF NOT EXISTS idx_unlocks_provider_id ON unlocks(provider_id);
      CREATE INDEX IF NOT EXISTS idx_unlocks_status ON unlocks(status);
      CREATE INDEX IF NOT EXISTS idx_unlocks_idempotency_key ON unlocks(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_unlocks_ttl_expires_at ON unlocks(ttl_expires_at);
      CREATE INDEX IF NOT EXISTS idx_providers_phone ON providers(phone);
      CREATE INDEX IF NOT EXISTS idx_providers_email ON providers(email);
    `);
    console.log('✅ Indexes created successfully');

    console.log('🎉 Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  }
}

module.exports = setupMissingTables;
