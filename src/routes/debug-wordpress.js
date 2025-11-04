const express = require('express');
const router = express.Router();

// Debug endpoint to test WordPress webhook data parsing
router.post('/test-wordpress-data', express.json(), async (req, res) => {
  try {
    console.log('🔧 DEBUG: Testing WordPress webhook data parsing...');
    
    const userData = req.body;
    
    console.log('📋 All received fields:', Object.keys(userData));
    console.log('📋 Full data structure:', JSON.stringify(userData, null, 2));
    
    // Extract phone number using the same logic as the real webhook
    let phoneNumber = null;
    
    // Try direct phone field first
    phoneNumber = userData.phone || userData.Phone || userData.PHONE;
    
    // If not found, search through all fields for phone-like patterns
    if (!phoneNumber) {
      console.log('📞 Searching for phone number in all fields...');
      
      const phoneFields = [];
      
      for (const [key, value] of Object.entries(userData)) {
        // Check if field name contains 'phone', 'tel', or 'mobile'
        if (key.toLowerCase().includes('phone') || 
            key.toLowerCase().includes('tel') || 
            key.toLowerCase().includes('mobile') ||
            key.toLowerCase().includes('number')) {
          phoneFields.push({ field: key, value: value });
          console.log(`📞 Found potential phone field: ${key} = ${value}`);
          if (value && typeof value === 'string' && value.trim()) {
            phoneNumber = value.trim();
          }
        }
        
        // Check if value looks like a phone number (contains digits and common phone chars)
        if (typeof value === 'string' && /[\d\-\(\)\+\s]{10,}/.test(value)) {
          phoneFields.push({ field: key, value: value, reason: 'phone-like pattern' });
          console.log(`📞 Found phone-like value in field ${key}: ${value}`);
          if (!phoneNumber) {
            phoneNumber = value.trim();
          }
        }
      }
    }
    
    console.log('📞 Final extracted phone number:', phoneNumber);
    
    // Extract name using the same logic
    let providerName = userData.name || 
                      userData.display_name || 
                      userData.first_name || 
                      (userData.email ? userData.email.split('@')[0] : 'Unknown');
    
    if (userData.first_name && userData.last_name) {
      providerName = `${userData.first_name} ${userData.last_name}`;
    }
    
    res.json({
      success: true,
      debug_info: {
        all_fields: Object.keys(userData),
        extracted_data: {
          name: providerName,
          phone: phoneNumber,
          email: userData.email,
          user_id: userData.user_id
        },
        phone_extraction: {
          direct_phone_fields: {
            phone: userData.phone,
            Phone: userData.Phone,
            PHONE: userData.PHONE
          },
          found_phone_fields: Object.entries(userData).filter(([key, value]) => 
            key.toLowerCase().includes('phone') || 
            key.toLowerCase().includes('tel') || 
            key.toLowerCase().includes('mobile') ||
            key.toLowerCase().includes('number')
          ),
          phone_like_values: Object.entries(userData).filter(([key, value]) => 
            typeof value === 'string' && /[\d\-\(\)\+\s]{10,}/.test(value)
          )
        }
      },
      raw_data: userData
    });
    
  } catch (error) {
    console.error('❌ Debug test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      raw_data: req.body
    });
  }
});

module.exports = router;
