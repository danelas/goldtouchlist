const express = require('express');
const router = express.Router();
const Provider = require('../models/Provider');

// Simple test endpoint to verify routing works
router.get('/hello', (req, res) => {
  console.log('🔧 TEST: /test/hello called');
  res.json({
    success: true,
    message: 'Test routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Quick test endpoint to add Dan
router.post('/add-dan', express.json(), async (req, res) => {
  try {
    console.log('🔧 TEST ENDPOINT: /test/add-dan called');
    console.log('📥 Request headers:', req.headers);
    console.log('📥 Request body:', req.body);
    console.log('Adding Dan as test provider...');
    
    // Generate unique provider ID
    const providerId = await Provider.generateUniqueId();
    
    // Create Dan's provider data
    const danProviderData = {
      id: providerId,
      name: 'Dan',
      email: 'dan@goldtouchlist.com',
      phone: '+19546144683',
      wordpress_user_id: null,
      slug: 'dan-provider',
      service_areas: ['Miami', 'Fort Lauderdale', 'Hollywood'],
      is_verified: true,
      first_lead_used: false,
      sms_opted_out: false
    };

    const provider = await Provider.create(danProviderData);
    console.log('Dan provider created:', provider.id);

    res.json({
      success: true,
      message: 'Dan added successfully!',
      provider: provider
    });

  } catch (error) {
    console.error('Error adding Dan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add Dan',
      details: error.message
    });
  }
});

// Quick endpoint to add multiple test providers
router.post('/add-test-providers', express.json(), async (req, res) => {
  try {
    console.log('Adding test providers...');
    
    const testProviders = [
      {
        name: 'Dan',
        email: 'dan@goldtouchlist.com',
        phone: '+19546144683',
        service_areas: ['Miami', 'Fort Lauderdale', 'Hollywood'],
        is_verified: true
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah@example.com',
        phone: '+13051234567',
        service_areas: ['Miami Beach', 'Coral Gables'],
        is_verified: true
      },
      {
        name: 'Mike Rodriguez',
        email: 'mike@example.com',
        phone: '+19547654321',
        service_areas: ['Broward County', 'Davie'],
        is_verified: false
      }
    ];

    const createdProviders = [];

    for (const providerData of testProviders) {
      const providerId = await Provider.generateUniqueId();
      
      const fullProviderData = {
        id: providerId,
        name: providerData.name,
        email: providerData.email,
        phone: providerData.phone,
        wordpress_user_id: null,
        slug: providerData.name.toLowerCase().replace(/\s+/g, '-'),
        service_areas: providerData.service_areas,
        is_verified: providerData.is_verified,
        first_lead_used: false,
        sms_opted_out: false
      };

      const provider = await Provider.create(fullProviderData);
      createdProviders.push(provider);
      console.log(`Created provider: ${provider.name} (${provider.id})`);
    }

    res.json({
      success: true,
      message: `${createdProviders.length} test providers added successfully!`,
      providers: createdProviders
    });

  } catch (error) {
    console.error('Error adding test providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add test providers',
      details: error.message
    });
  }
});

// Server-side form handler (no JavaScript needed)
router.get('/add-dan-form', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Add Dan - Server Form</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .container { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
            .btn { background: #667eea; color: white; padding: 15px 30px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Add Dan - Server Form</h1>
            <form method="POST" action="/test/add-dan-server">
                <p>Click the button below to add Dan (+19546144683) as a provider:</p>
                <button type="submit" class="btn">➕ Add Dan (Server-side)</button>
            </form>
            <br>
            <a href="/admin">🏠 Go to Admin Dashboard</a>
        </div>
    </body>
    </html>
  `);
});

// Server-side form processor
router.post('/add-dan-server', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    console.log('🔧 SERVER FORM: /test/add-dan-server called');
    
    // Generate unique provider ID
    const providerId = await Provider.generateUniqueId();
    
    // Create Dan's provider data
    const danProviderData = {
      id: providerId,
      name: 'Dan',
      email: 'dan@goldtouchlist.com',
      phone: '+19546144683',
      wordpress_user_id: null,
      slug: 'dan-provider',
      service_areas: ['Miami', 'Fort Lauderdale', 'Hollywood'],
      is_verified: true,
      first_lead_used: false,
      sms_opted_out: false
    };

    const provider = await Provider.create(danProviderData);
    console.log('Dan provider created via server form:', provider.id);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Success!</title>
          <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .container { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
              .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0; }
              .btn { background: #667eea; color: white; padding: 15px 30px; border: none; border-radius: 8px; text-decoration: none; display: inline-block; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>✅ Success!</h1>
              <div class="success">
                  <p><strong>Dan has been added successfully!</strong></p>
                  <p><strong>Provider ID:</strong> ${provider.id}</p>
                  <p><strong>Name:</strong> ${provider.name}</p>
                  <p><strong>Email:</strong> ${provider.email}</p>
                  <p><strong>Phone:</strong> ${provider.phone}</p>
              </div>
              <a href="/admin" class="btn">🏠 Go to Admin Dashboard</a>
              <a href="/test/add-dan-form" class="btn">🔄 Add Another</a>
          </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Error adding Dan via server form:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body>
          <h1>❌ Error</h1>
          <p>Failed to add Dan: ${error.message}</p>
          <a href="/test/add-dan-form">🔄 Try Again</a>
      </body>
      </html>
    `);
  }
});

module.exports = router;
