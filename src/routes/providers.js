const express = require('express');
const router = express.Router();
const Provider = require('../models/Provider');
const MailerLiteService = require('../services/MailerLiteService');

// Ensure JSON parsing for admin routes
router.use('/admin', express.json());

// Get all providers with their unique URLs (for homepage buttons)
router.get('/', async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const providers = await Provider.getAllWithUrls(baseUrl);
    
    res.json({
      success: true,
      providers: providers,
      total: providers.length
    });
  } catch (error) {
    console.error('Error getting providers:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get providers' 
    });
  }
});

// Get specific provider by slug (for form page)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Since slug column doesn't exist yet, try to find by generated slug
    const providers = await Provider.getAllWithUrls();
    const provider = providers.find(p => p.slug === slug);
    
    if (!provider) {
      return res.status(404).json({ 
        success: false,
        error: 'Provider not found' 
      });
    }

    // Don't expose sensitive info
    const publicProvider = {
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      phone: provider.phone
    };

    res.json({
      success: true,
      provider: publicProvider
    });
  } catch (error) {
    console.error('Error getting provider by slug:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get provider' 
    });
  }
});

// Form page route - serves the form with provider pre-selected
router.get('/:slug/form', async (req, res) => {
  try {
    const { slug } = req.params;
    const provider = await Provider.findBySlug(slug);
    
    if (!provider) {
      return res.status(404).json({ 
        success: false,
        error: 'Provider not found' 
      });
    }

    // Return HTML form or redirect to form with provider_id
    // This could serve an HTML page or return JSON for a SPA
    res.json({
      success: true,
      provider: {
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        phone: provider.phone
      },
      form_action: '/webhooks/fluentforms',
      message: `Fill out the form below to request service from ${provider.name}`
    });
  } catch (error) {
    console.error('Error loading provider form:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load form' 
    });
  }
});

// Setup/migration endpoint to generate slugs for existing providers
router.post('/setup/slugs', async (req, res) => {
  try {
    console.log('🔄 Generating slugs for existing providers...');
    
    const pool = require('../config/database');
    
    // First, run the migration to add the slug column
    const migrationSQL = `
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
      CREATE INDEX IF NOT EXISTS idx_providers_slug ON providers(slug);
    `;
    
    await pool.query(migrationSQL);
    console.log('✅ Slug column added');
    
    // Get all providers without slugs
    const providersResult = await pool.query(
      'SELECT id, name FROM providers WHERE slug IS NULL'
    );
    
    const updatedProviders = [];
    
    for (const provider of providersResult.rows) {
      const slug = Provider.generateSlug(provider.name, provider.id);
      
      try {
        const updated = await Provider.updateSlug(provider.id, slug);
        updatedProviders.push(updated);
        console.log(`✅ Generated slug for ${provider.name}: ${slug}`);
      } catch (error) {
        console.error(`❌ Failed to update slug for ${provider.name}:`, error);
      }
    }
    
    // Make slug NOT NULL after generating all slugs
    await pool.query('ALTER TABLE providers ALTER COLUMN slug SET NOT NULL');
    await pool.query('ALTER TABLE providers ADD CONSTRAINT providers_slug_unique UNIQUE (slug)');
    
    res.json({
      success: true,
      message: 'Slugs generated successfully',
      updated_providers: updatedProviders.length,
      providers: updatedProviders
    });
    
  } catch (error) {
    console.error('❌ Slug generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Slug generation failed',
      details: error.message
    });
  }
});

// Get all providers with full details (for admin UI)
router.get('/admin/all', async (req, res) => {
  try {
    const pool = require('../config/database');
    const query = `
      SELECT 
        id, name, phone, email, wordpress_user_id, slug,
        service_areas, is_verified, first_lead_used, sms_opted_out,
        created_at, updated_at
      FROM providers 
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      providers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error getting all providers:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get providers' 
    });
  }
});

// Get single provider by ID (for editing)
router.get('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = await Provider.findById(id);
    
    if (!provider) {
      return res.status(404).json({ 
        success: false,
        error: 'Provider not found' 
      });
    }

    res.json({
      success: true,
      provider: provider
    });
  } catch (error) {
    console.error('Error getting provider:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get provider' 
    });
  }
});

// Update provider
router.put('/admin/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Validate required fields
    if (!updateData.name || !updateData.email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    const pool = require('../config/database');
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updateData.name) {
      fields.push(`name = $${paramCount++}`);
      values.push(updateData.name);
    }
    if (updateData.email) {
      fields.push(`email = $${paramCount++}`);
      values.push(updateData.email);
    }
    if (updateData.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(updateData.phone);
    }
    if (updateData.service_areas) {
      fields.push(`service_areas = $${paramCount++}`);
      values.push(updateData.service_areas);
    }
    if (updateData.is_verified !== undefined) {
      fields.push(`is_verified = $${paramCount++}`);
      values.push(updateData.is_verified);
    }
    if (updateData.sms_opted_out !== undefined) {
      fields.push(`sms_opted_out = $${paramCount++}`);
      values.push(updateData.sms_opted_out);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE providers 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found'
      });
    }

    res.json({
      success: true,
      provider: result.rows[0],
      message: 'Provider updated successfully'
    });

  } catch (error) {
    console.error('Error updating provider:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update provider',
      details: error.message
    });
  }
});

// Delete provider
router.delete('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = require('../config/database');
    
    // Check if provider exists
    const checkResult = await pool.query('SELECT id, name FROM providers WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found'
      });
    }

    const providerName = checkResult.rows[0].name;

    // Delete related records first (unlocks, audit logs)
    await pool.query('DELETE FROM unlock_audit_log WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM unlocks WHERE provider_id = $1', [id]);
    
    // Delete the provider
    await pool.query('DELETE FROM providers WHERE id = $1', [id]);

    res.json({
      success: true,
      message: `Provider "${providerName}" deleted successfully`,
      deleted_id: id
    });

  } catch (error) {
    console.error('Error deleting provider:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete provider',
      details: error.message
    });
  }
});

// Create new provider
router.post('/admin', express.json(), async (req, res) => {
  try {
    const providerData = req.body;
    
    // Validate required fields
    if (!providerData.name || !providerData.email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    // Generate unique provider ID
    const providerId = await Provider.generateUniqueId();
    
    // Prepare provider data
    const newProviderData = {
      id: providerId,
      name: providerData.name,
      email: providerData.email,
      phone: providerData.phone || null,
      wordpress_user_id: providerData.wordpress_user_id || null,
      slug: providerData.slug || Provider.generateSlug(providerData.name, providerId),
      service_areas: providerData.service_areas || [],
      is_verified: providerData.is_verified !== undefined ? providerData.is_verified : false,
      first_lead_used: providerData.first_lead_used !== undefined ? providerData.first_lead_used : false,
      sms_opted_out: providerData.sms_opted_out !== undefined ? providerData.sms_opted_out : false
    };

    const provider = await Provider.create(newProviderData);

    // Sync to MailerLite contact list
    try {
      await MailerLiteService.addSubscriber({
        email: provider.email,
        name: provider.name,
        phone: provider.phone,
        providerId: provider.id
      });
    } catch (mlError) {
      console.error('MailerLite sync failed (provider still created):', mlError.message);
    }

    res.status(201).json({
      success: true,
      provider: provider,
      message: 'Provider created successfully'
    });

  } catch (error) {
    console.error('Error creating provider:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create provider',
      details: error.message
    });
  }
});

// Search providers
router.get('/admin/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const pool = require('../config/database');
    
    const searchQuery = `
      SELECT 
        id, name, phone, email, wordpress_user_id, slug,
        service_areas, is_verified, first_lead_used, sms_opted_out,
        created_at, updated_at
      FROM providers 
      WHERE 
        name ILIKE $1 OR 
        email ILIKE $1 OR 
        phone ILIKE $1 OR 
        id ILIKE $1
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(searchQuery, [`%${query}%`]);
    
    res.json({
      success: true,
      providers: result.rows,
      total: result.rows.length,
      query: query
    });
  } catch (error) {
    console.error('Error searching providers:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search providers' 
    });
  }
});

module.exports = router;
