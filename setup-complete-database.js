require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupCompleteDatabase() {
  console.log('🚀 Setting up Gold Touch List Database...\n');
  
  // Create database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('📡 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database');
    
    // Read the complete setup SQL file
    const sqlPath = path.join(__dirname, 'COMPLETE_SETUP_DATABASE.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('🔄 Executing database setup...');
    
    // Split SQL into individual statements (excluding comments and empty lines)
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--') && !stmt.startsWith('\\'));
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await client.query(statement);
        } catch (error) {
          // Some statements might fail if objects already exist, that's okay
          if (!error.message.includes('already exists') && 
              !error.message.includes('does not exist')) {
            console.warn(`Warning on statement ${i + 1}:`, error.message);
          }
        }
      }
    }
    
    console.log('✅ Database setup completed successfully');
    
    // Verify the setup
    console.log('\n📊 Verifying database setup...');
    
    // Check providers
    const providersResult = await client.query('SELECT id, name, phone, first_lead_used FROM providers ORDER BY id');
    console.log('\n👥 Providers created:');
    providersResult.rows.forEach(provider => {
      console.log(`   ${provider.id}: ${provider.name} (${provider.phone}) - First lead: ${provider.first_lead_used ? 'USED' : 'AVAILABLE'}`);
    });
    
    // Check table counts
    const tablesResult = await client.query(`
      SELECT 
        'providers' as table_name, COUNT(*) as count FROM providers
      UNION ALL
      SELECT 'leads' as table_name, COUNT(*) as count FROM leads
      UNION ALL  
      SELECT 'unlocks' as table_name, COUNT(*) as count FROM unlocks
      UNION ALL
      SELECT 'auto_responses' as table_name, COUNT(*) as count FROM auto_responses
    `);
    
    console.log('\n📋 Table counts:');
    tablesResult.rows.forEach(row => {
      console.log(`   ${row.table_name}: ${row.count} records`);
    });
    
    // Test the Provider model
    console.log('\n🧪 Testing Provider model...');
    const Provider = require('./src/models/Provider');
    
    // Test finding a provider
    const testProvider = await Provider.findById('provider1');
    if (testProvider) {
      console.log(`✅ Provider model test passed: Found ${testProvider.name}`);
    } else {
      console.log('❌ Provider model test failed');
    }
    
    // Test phone lookup
    const phoneProvider = await Provider.findByPhone('+17542806739');
    if (phoneProvider) {
      console.log(`✅ Phone lookup test passed: Found ${phoneProvider.name}`);
    } else {
      console.log('❌ Phone lookup test failed');
    }
    
    console.log('\n🎉 Gold Touch List database setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update your .env file with the database URL');
    console.log('   2. Add your API keys (OpenAI, Stripe, TextMagic)');
    console.log('   3. Test the system with: node src/server.js');
    console.log('   4. Create test leads to verify SMS functionality');
    
    client.release();
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the setup
if (require.main === module) {
  setupCompleteDatabase()
    .then(() => {
      console.log('\n✅ Setup completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupCompleteDatabase;
