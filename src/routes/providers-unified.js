const express = require('express');
const router = express.Router();
const Provider = require('../models/Provider');
const MailerLiteService = require('../services/MailerLiteService');

// Unified provider management endpoint
router.all('/manage', express.json(), async (req, res) => {
  try {
    const { method } = req;
    const { action, id, ...data } = req.body;
    
    console.log(`Provider management request: ${method} - Action: ${action || 'list'}`);

    // Handle GET requests (list all providers)
    if (method === 'GET') {
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
      
      return res.json({
        success: true,
        action: 'list',
        providers: result.rows,
        total: result.rows.length
      });
    }

    // Handle POST requests with actions
    if (method === 'POST') {
      switch (action) {
        case 'create':
          return await createProvider(req, res, data);
        
        case 'update':
          return await updateProvider(req, res, id, data);
        
        case 'delete':
          return await deleteProvider(req, res, id);
        
        case 'get':
          return await getProvider(req, res, id);
        
        case 'search':
          return await searchProviders(req, res, data.query);
        
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid action',
            validActions: ['create', 'update', 'delete', 'get', 'search']
          });
      }
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      supportedMethods: ['GET', 'POST']
    });

  } catch (error) {
    console.error('Provider management error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Create provider function
async function createProvider(req, res, data) {
  if (!data.name || !data.email) {
    return res.status(400).json({
      success: false,
      error: 'Name and email are required'
    });
  }

  const providerId = await Provider.generateUniqueId();
  
  const newProviderData = {
    id: providerId,
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    wordpress_user_id: data.wordpress_user_id || null,
    slug: data.slug || Provider.generateSlug(data.name, providerId),
    service_areas: data.service_areas || [],
    is_verified: data.is_verified !== undefined ? data.is_verified : false,
    first_lead_used: data.first_lead_used !== undefined ? data.first_lead_used : false,
    sms_opted_out: data.sms_opted_out !== undefined ? data.sms_opted_out : false
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

  return res.status(201).json({
    success: true,
    action: 'create',
    provider: provider,
    message: 'Provider created successfully'
  });
}

// Update provider function
async function updateProvider(req, res, id, data) {
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Provider ID is required for update'
    });
  }

  if (!data.name || !data.email) {
    return res.status(400).json({
      success: false,
      error: 'Name and email are required'
    });
  }

  const pool = require('../config/database');
  
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (data.name) {
    fields.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.email) {
    fields.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }
  if (data.service_areas) {
    fields.push(`service_areas = $${paramCount++}`);
    values.push(data.service_areas);
  }
  if (data.is_verified !== undefined) {
    fields.push(`is_verified = $${paramCount++}`);
    values.push(data.is_verified);
  }
  if (data.sms_opted_out !== undefined) {
    fields.push(`sms_opted_out = $${paramCount++}`);
    values.push(data.sms_opted_out);
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

  return res.json({
    success: true,
    action: 'update',
    provider: result.rows[0],
    message: 'Provider updated successfully'
  });
}

// Delete provider function
async function deleteProvider(req, res, id) {
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Provider ID is required for deletion'
    });
  }

  const pool = require('../config/database');
  
  const checkResult = await pool.query('SELECT id, name FROM providers WHERE id = $1', [id]);
  if (checkResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Provider not found'
    });
  }

  const providerName = checkResult.rows[0].name;

  // Delete related records first
  await pool.query('DELETE FROM unlock_audit_log WHERE provider_id = $1', [id]);
  await pool.query('DELETE FROM unlocks WHERE provider_id = $1', [id]);
  
  // Delete the provider
  await pool.query('DELETE FROM providers WHERE id = $1', [id]);

  return res.json({
    success: true,
    action: 'delete',
    message: `Provider "${providerName}" deleted successfully`,
    deleted_id: id
  });
}

// Get single provider function
async function getProvider(req, res, id) {
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Provider ID is required'
    });
  }

  const provider = await Provider.findById(id);
  
  if (!provider) {
    return res.status(404).json({
      success: false,
      error: 'Provider not found'
    });
  }

  return res.json({
    success: true,
    action: 'get',
    provider: provider
  });
}

// Search providers function
async function searchProviders(req, res, query) {
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required'
    });
  }

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
  
  return res.json({
    success: true,
    action: 'search',
    providers: result.rows,
    total: result.rows.length,
    query: query
  });
}

module.exports = router;
