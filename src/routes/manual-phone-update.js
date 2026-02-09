const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Manual phone number update for providers
router.post('/update-provider-phone', express.json(), async (req, res) => {
  try {
    const { provider_id, phone_number, email } = req.body;
    
    console.log('📞 Manual phone update request:', { provider_id, phone_number, email });
    
    if (!phone_number || (!provider_id && !email)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['phone_number', 'provider_id OR email']
      });
    }
    
    let updateQuery;
    let updateValues;
    
    if (provider_id) {
      updateQuery = `
        UPDATE providers 
        SET phone = $1, sms_opted_out = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, name, email, phone, sms_opted_out
      `;
      updateValues = [phone_number, provider_id];
    } else {
      updateQuery = `
        UPDATE providers 
        SET phone = $1, sms_opted_out = false, updated_at = CURRENT_TIMESTAMP
        WHERE email = $2
        RETURNING id, name, email, phone, sms_opted_out
      `;
      updateValues = [phone_number, email];
    }
    
    const result = await pool.query(updateQuery, updateValues);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
        searched_by: provider_id ? 'provider_id' : 'email',
        searched_value: provider_id || email
      });
    }
    
    const updatedProvider = result.rows[0];
    console.log('✅ Provider phone updated:', updatedProvider);
    
    res.json({
      success: true,
      message: 'Phone number updated successfully',
      provider: updatedProvider
    });
    
  } catch (error) {
    console.error('❌ Error updating provider phone:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk phone update from CSV or list
router.post('/bulk-update-phones', express.json(), async (req, res) => {
  try {
    const { updates } = req.body; // Array of {email, phone} or {provider_id, phone}
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        error: 'Missing updates array',
        expected_format: [
          { email: 'user@example.com', phone: '+15551234567' },
          { provider_id: 'provider8', phone: '+15559876543' }
        ]
      });
    }
    
    const results = [];
    
    for (const update of updates) {
      try {
        const { email, provider_id, phone } = update;
        
        if (!phone || (!email && !provider_id)) {
          results.push({
            update,
            success: false,
            error: 'Missing phone or identifier'
          });
          continue;
        }
        
        let updateQuery;
        let updateValues;
        
        if (provider_id) {
          updateQuery = `
            UPDATE providers 
            SET phone = $1, sms_opted_out = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, name, email, phone
          `;
          updateValues = [phone, provider_id];
        } else {
          updateQuery = `
            UPDATE providers 
            SET phone = $1, sms_opted_out = false, updated_at = CURRENT_TIMESTAMP
            WHERE email = $2
            RETURNING id, name, email, phone
          `;
          updateValues = [phone, email];
        }
        
        const result = await pool.query(updateQuery, updateValues);
        
        if (result.rows.length === 0) {
          results.push({
            update,
            success: false,
            error: 'Provider not found'
          });
        } else {
          results.push({
            update,
            success: true,
            provider: result.rows[0]
          });
        }
        
      } catch (error) {
        results.push({
          update,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `Updated ${successCount} of ${updates.length} providers`,
      results,
      summary: {
        total: updates.length,
        successful: successCount,
        failed: updates.length - successCount
      }
    });
    
  } catch (error) {
    console.error('❌ Error in bulk phone update:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
