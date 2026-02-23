require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import routes
const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const unlockRoutes = require('./routes/unlocks');
const providerRoutes = require('./routes/providers');
const providerUnifiedRoutes = require('./routes/providers-unified');
const testProviderRoutes = require('./routes/test-provider');
const manualMigrationRoutes = require('./routes/manual-migration');
const debugWordPressRoutes = require('./routes/debug-wordpress');
const analyticsRoutes = require('./routes/analytics');
const recoveryRoutes = require('./routes/recovery');
const diagnosticsRoutes = require('./routes/diagnostics');
const stripeDiagnosticsRoutes = require('./routes/stripe-diagnostics');

// Import services for initialization
const pool = require('./config/database');
const LeadScheduler = require('./services/LeadScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - required for Render and other hosting platforms
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"], // Allow inline scripts for our HTML pages
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://pay.goldtouchlist.com',
      'http://localhost:3000',
      'http://localhost:10000',
      process.env.ADMIN_DASHBOARD_URL
    ].filter(Boolean);

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Enable pre-flight across-the-board
app.options('*', cors(corsOptions));

// Log CORS errors
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    console.warn('CORS Error:', {
      origin: req.headers.origin,
      method: req.method,
      path: req.path,
      headers: req.headers
    });
  }
  next(err);
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Webhook rate limiting (more restrictive)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: 'Too many webhook requests, please try again later.'
});
app.use('/webhooks/', webhookLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Body parsing middleware
// Note: Stripe webhook needs raw body, so we exclude it from JSON parsing
app.use((req, res, next) => {
  if (req.path === '/webhooks/stripe') {
    next(); // Skip JSON parsing for Stripe webhook
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);
app.use('/unlocks', unlockRoutes);
app.use('/providers', providerRoutes);
app.use('/api/providers', providerRoutes); // API routes for provider management
app.use('/api/provider', providerUnifiedRoutes); // Unified provider management endpoint
app.use('/test', testProviderRoutes); // Test provider creation endpoints
app.use('/migrate', manualMigrationRoutes); // Manual migration endpoints
app.use('/debug', debugWordPressRoutes); // Debug WordPress webhook endpoints
app.use('/analytics', analyticsRoutes);
app.use('/recovery', recoveryRoutes);
app.use('/diagnostics', diagnosticsRoutes);
app.use('/stripe-diagnostics', stripeDiagnosticsRoutes);
app.use('/form', providerRoutes); // Also handle /form/:slug routes

// Provider URLs page
app.get('/provider-urls', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'provider-urls.html'));
});

// Admin Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-dashboard.html'));
});

// Admin Users page
app.get('/admin/users', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'users.html'));
});

// Quick setup page to add Dan
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'add-dan.html'));
});

// Simple setup page (for debugging)
app.get('/simple-setup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'simple-add-dan.html'));
});

// Database fix page
app.get('/fix-database', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'fix-database.html'));
});

// Phone update page
app.get('/update-phones', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'update-phones.html'));
});

// Provider Management UI
app.get('/admin/providers', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'provider-management.html'));
});

// Analytics Dashboard
app.get('/analytics/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Record manual message page route
app.get('/record-message', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/record-message.html'));
});

// New client funnel dashboard
app.get('/funnel', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard-new.html'));
});

// Run migration endpoint (temporary, for production deployment)
app.get('/run-migration', async (req, res) => {
  try {
    const pool = require('./config/database');
    
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

    res.json({
      success: true,
      message: 'Migration completed successfully!'
    });
  } catch (error) {
    console.error('Migration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Form page for providers
app.get('/form/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'form.html'));
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Gold Touch List Lead Management System',
    status: 'running',
    endpoints: {
      webhooks: '/webhooks/fluentforms',
      providers: '/providers',
      unlocks: '/unlocks',
      provider_urls: '/provider-urls',
      admin: {
        dashboard: '/admin',
        provider_management: '/admin/providers'
      },
      analytics: {
        provider_performance: '/analytics/providers',
        recent_activity: '/analytics/recent-activity?days=7',
        conversion_funnel: '/analytics/conversion-funnel',
        scheduled_leads: '/analytics/scheduled-leads'
      },
      recovery: {
        missed_leads: '/recovery/missed-leads?hours=24',
        process_missed_leads: '/recovery/process-missed-leads',
        recent_leads_status: '/recovery/recent-leads-status?hours=24'
      }
    },
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  
  try {
    await pool.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  try {
    await pool.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Gold Touch List Lead Unlock System running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Crypto module loaded: ${typeof require('crypto')}`);
  
  // Start the lead scheduler
  LeadScheduler.startScheduler();
  
  // Test database connection and run migrations
  pool.query('SELECT NOW()', async (err, result) => {
    if (err) {
      console.error('Database connection failed:', err);
    } else {
      console.log('Database connected successfully');
      
      // Run database setup and migrations
      try {
        // First ensure all tables exist
        const setupMissingTables = require('./migrations/setup_missing_tables');
        await setupMissingTables();
        
        // Then run specific migrations
        const addMissingLeadColumns = require('./migrations/add_missing_lead_columns');
        await addMissingLeadColumns();
        
        const addProviderEmailColumn = require('./migrations/add_provider_email_column');
        await addProviderEmailColumn();
        
        const addIdempotencyKey = require('./migrations/add_idempotency_key');
        await addIdempotencyKey();
        
        const addUnlockConstraints = require('./migrations/add_unlock_constraints');
        await addUnlockConstraints();
        
        const addUnlockAuditColumns = require('./migrations/add_unlock_audit_columns');
        await addUnlockAuditColumns();

        const addUnlockPriceColumn = require('./migrations/add_unlock_price_column');
        await addUnlockPriceColumn();

        const addFollowUpsTable = require('./migrations/add_follow_ups_table');
        await addFollowUpsTable.up();

        const addManualMessagesTable = require('./migrations/add_manual_messages_table');
        await addManualMessagesTable.up();
        
        // Run provider_contact_followups table migration
        const addProviderContactFollowUpsTable = require('./migrations/add_provider_contact_followups_table');
        await addProviderContactFollowUpsTable.up();
      } catch (migrationError) {
        console.error('Migration error:', migrationError);
      }

      // Start follow-up SMS scheduler (checks every 60 seconds)
      const FollowUpService = require('./services/FollowUpService');
      const ProviderContactFollowUpService = require('./services/ProviderContactFollowUpService');
      setInterval(async () => {
        try {
          await FollowUpService.processScheduledFollowUps();
          await FollowUpService.processProviderReminders();
          await ProviderContactFollowUpService.processScheduledFollowUps();
        } catch (error) {
          console.error('Error in follow-up scheduler:', error);
        }
      }, 60000);
      console.log('📞 Follow-up SMS scheduler started (60s interval)');
    }
  });
});

module.exports = app;
