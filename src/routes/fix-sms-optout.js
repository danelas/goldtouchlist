const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Fix SMS opt-out for providers who have phone numbers but are opted out
router.post('/fix-sms-optout', async (req, res) => {
  try {
    console.log('🔧 Fixing SMS opt-out for providers with phone numbers...');
    
    // Find providers who have phone numbers but are opted out of SMS
    const providersToFix = await pool.query(`
      SELECT id, name, phone, email, sms_opted_out 
      FROM providers 
      WHERE phone IS NOT NULL 
      AND phone != '' 
      AND sms_opted_out = true
    `);
    
    console.log(`📋 Found ${providersToFix.rows.length} providers to fix`);
    
    if (providersToFix.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No providers need fixing',
        fixed_count: 0
      });
    }
    
    // Update these providers to opt them back into SMS
    const updateResult = await pool.query(`
      UPDATE providers 
      SET sms_opted_out = false 
      WHERE phone IS NOT NULL 
      AND phone != '' 
      AND sms_opted_out = true
    `);
    
    console.log(`✅ Fixed ${updateResult.rowCount} providers`);
    
    res.json({
      success: true,
      message: `Fixed SMS opt-out for ${updateResult.rowCount} providers`,
      fixed_count: updateResult.rowCount,
      providers_fixed: providersToFix.rows.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fixing SMS opt-out:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check providers with phone/SMS issues
router.get('/check-sms-status', async (req, res) => {
  try {
    console.log('🔍 Checking SMS status for all providers...');
    
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_providers,
        COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as providers_with_phone,
        COUNT(CASE WHEN sms_opted_out = true THEN 1 END) as opted_out_total,
        COUNT(CASE WHEN phone IS NOT NULL AND phone != '' AND sms_opted_out = true THEN 1 END) as opted_out_with_phone,
        COUNT(CASE WHEN (phone IS NULL OR phone = '') AND sms_opted_out = true THEN 1 END) as opted_out_no_phone
      FROM providers
    `);
    
    const problematicProviders = await pool.query(`
      SELECT id, name, phone, email, sms_opted_out, created_at
      FROM providers 
      WHERE phone IS NOT NULL 
      AND phone != '' 
      AND sms_opted_out = true
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      statistics: stats.rows[0],
      problematic_providers: problematicProviders.rows,
      recommendations: {
        need_fixing: parseInt(stats.rows[0].opted_out_with_phone) > 0,
        fix_endpoint: '/debug/fix-sms-optout'
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking SMS status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
