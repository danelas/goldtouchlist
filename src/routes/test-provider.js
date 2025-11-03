const express = require('express');
const router = express.Router();
const Provider = require('../models/Provider');

// Quick test endpoint to add Dan
router.post('/add-dan', express.json(), async (req, res) => {
  try {
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

module.exports = router;
