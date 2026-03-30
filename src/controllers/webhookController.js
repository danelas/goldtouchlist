const Lead = require('../models/Lead');
const LeadProcessor = require('../services/LeadProcessor');
const Joi = require('joi');
const crypto = require('crypto');
const GeoService = require('../services/GeoService');

// Flexible validation schema for FluentForms data
const fluentFormsSchema = Joi.object({
  name: Joi.string().required(),
  phone: Joi.string().required(),
  cityzip: Joi.string().required(),
  date_time: Joi.string().allow('').optional(),
  length: Joi.string().allow('').optional(),
  type: Joi.string().allow('').optional(), // Made optional since it can be auto-detected
  location: Joi.string().allow('').optional(),
  contactpref: Joi.string().allow('').optional(),
  email: Joi.string().email().allow('').optional(),
  provider_id: Joi.alternatives().try(
    Joi.number().integer(),
    Joi.string().pattern(/^provider(\d+)$/)
  ).optional(),
  
  // Beauty service fields (flexible)
  bodywork: Joi.string().allow('').optional(),
  cleaning: Joi.string().allow('').optional(),
  esthetics: Joi.string().allow('').optional(),
  makeup: Joi.string().allow('').optional(),
  skincare: Joi.string().allow('').optional(),
  
  // Allow any additional fields
}).unknown(true); // This allows any additional fields not specified

class WebhookController {
  static async handleWordPressUserCreation(req, res) {
    try {
      console.log('Received WordPress user creation webhook:', JSON.stringify(req.body, null, 2));

      // Validate webhook secret if configured
      if (process.env.WORDPRESS_WEBHOOK_SECRET && process.env.NODE_ENV !== 'development') {
        const receivedSecret = req.headers['x-webhook-secret'] || req.body.webhook_secret;
        if (receivedSecret !== process.env.WORDPRESS_WEBHOOK_SECRET) {
          console.error('Invalid WordPress webhook secret');
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      // Extract user data from WordPress/HivePress
      const userData = req.body;
      
      console.log('📋 WordPress webhook - all received fields:', Object.keys(userData));
      console.log('📋 WordPress webhook - full data structure:', JSON.stringify(userData, null, 2));
      
      // Log each field individually to make it easier to spot phone fields
      console.log('📋 Individual field analysis:');
      for (const [key, value] of Object.entries(userData)) {
        console.log(`  - ${key}: ${JSON.stringify(value)} (type: ${typeof value})`);
      }
      
      // Validate required fields
      if (!userData.user_id || !userData.email) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          required: ['user_id', 'email'],
          received: Object.keys(userData)
        });
      }

      // Generate unique provider ID
      const Provider = require('../models/Provider');
      const providerId = await Provider.generateUniqueId();
      
      // Determine the best name to use (priority order)
      let providerName = userData.name || 
                        userData.display_name || 
                        userData.first_name || 
                        userData.email.split('@')[0];
      
      // If we have both first and last name, combine them
      if (userData.first_name && userData.last_name) {
        providerName = `${userData.first_name} ${userData.last_name}`;
      }
      
      // Extract phone number from various possible field formats
      let phoneNumber = null;
      
      // Try direct phone field first (including HivePress phone-type fields)
      phoneNumber = userData.phone || userData.Phone || userData.PHONE || 
                   userData.tel || userData.Tel || userData.TEL ||
                   userData.telephone || userData.Telephone ||
                   userData.phone_number || userData.phoneNumber ||
                   userData.user_phone || userData.contact_phone;
      
      // If not found, search through all fields for phone-like patterns
      if (!phoneNumber) {
        console.log('📞 Searching for phone number in all fields...');
        
        for (const [key, value] of Object.entries(userData)) {
          // Check if field name contains phone-related terms or HivePress patterns
          const keyLower = key.toLowerCase();
          if (keyLower.includes('phone') || 
              keyLower.includes('tel') || 
              keyLower.includes('mobile') ||
              keyLower.includes('number') ||
              keyLower.includes('hp-field') ||  // HivePress field pattern
              keyLower.includes('hp_field') ||  // Alternative HivePress pattern
              keyLower === 'tel' ||             // Direct tel field
              keyLower.startsWith('field_tel') || // WordPress custom field pattern
              keyLower.endsWith('_tel') ||      // Field ending with tel
              keyLower.endsWith('_phone')) {    // Field ending with phone
            console.log(`📞 Found potential phone field: ${key} = ${value}`);
            if (value && typeof value === 'string' && value.trim()) {
              phoneNumber = value.trim();
              break;
            }
          }
          
          // Check if value looks like a phone number (enhanced patterns)
          if (typeof value === 'string') {
            const cleanValue = value.trim();
            // Check for US phone numbers with +1, international format, or standard formats
            if (/^\+1[\d\-\(\)\s]{10,}/.test(cleanValue) ||           // +1 format
                /^\+\d{1,3}[\d\-\(\)\s]{8,}/.test(cleanValue) ||      // International format
                /^[\d\-\(\)\s]{10,}$/.test(cleanValue) ||             // Standard format
                /^\(\d{3}\)\s?\d{3}-?\d{4}$/.test(cleanValue)) {      // (123) 456-7890 format
              console.log(`📞 Found phone-like value in field ${key}: ${value}`);
              phoneNumber = cleanValue;
              break;
            }
          }
        }
      }
      
      console.log('📞 Final extracted phone number:', phoneNumber);
      
      // Create provider record
      const providerData = {
        id: providerId,
        wordpress_user_id: userData.user_id,
        email: userData.email,
        phone: phoneNumber,
        name: providerName,
        slug: userData.user_login || providerId,
        service_areas: userData.service_areas || [],
        is_verified: false, // New users start unverified
        first_lead_used: false,
        sms_opted_out: !phoneNumber // If no phone, opt out of SMS
      };

      const provider = await Provider.create(providerData);
      console.log('Provider created from WordPress user:', provider.id);

      res.json({ 
        success: true, 
        providerId: provider.id,
        wordpress_user_id: userData.user_id,
        message: 'Provider account created successfully'
      });

    } catch (error) {
      console.error('Error handling WordPress user creation webhook:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  static async handleFluentFormsWebhook(req, res) {
    try {
      console.log('Received FluentForms webhook:', JSON.stringify(req.body, null, 2));

      // Validate webhook secret if configured (skip in development)
      if (process.env.WEBHOOK_SECRET && process.env.NODE_ENV !== 'development') {
        const receivedSecret = req.headers['x-webhook-secret'] || req.body.webhook_secret;
        if (receivedSecret !== process.env.WEBHOOK_SECRET) {
          console.error('Invalid webhook secret');
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      // Extract form data - FluentForms typically sends data in different formats
      let formData = req.body;
      
      // Handle different FluentForms webhook formats
      if (req.body.data && req.body.data.fields) {
        // Format: { data: { fields: { fieldName: { value: "..." } } } }
        const fields = req.body.data.fields;
        formData = {};
        Object.keys(fields).forEach(key => {
          formData[key] = fields[key].value || fields[key];
        });
      } else if (req.body.form_data) {
        // Format: { form_data: { fieldName: "value" } }
        formData = req.body.form_data;
      }

      // Debug: Log the raw form data to understand the structure
      console.log('Raw form data structure:', JSON.stringify(formData, null, 2));
      console.log('Original req.body:', JSON.stringify(req.body, null, 2));
      
      // Fix field values that might be labels instead of actual values
      if (formData.length === 'Session Length Preference') {
        console.log('Detected field label instead of value for length field');
        
        // Try to find the actual value in the original request body
        if (req.body.data && req.body.data.fields && req.body.data.fields.length) {
          const lengthField = req.body.data.fields.length;
          console.log('Length field details:', JSON.stringify(lengthField, null, 2));
          
          // Look for actual selected value in different possible locations
          if (lengthField.selected_value) {
            formData.length = lengthField.selected_value;
          } else if (lengthField.raw_value) {
            formData.length = lengthField.raw_value;
          } else if (lengthField.options && lengthField.options.length > 0) {
            // If we have options, try to find the selected one
            const selectedOption = lengthField.options.find(opt => opt.selected);
            if (selectedOption) {
              formData.length = selectedOption.value || selectedOption.label;
            }
          }
        }
        
        // If still no value found, set to not specified
        if (formData.length === 'Session Length Preference') {
          formData.length = 'Not specified';
        }
      }
      
      // Clean up date_time field - remove any default time that FluentForms adds
      if (formData.date_time) {
        // Remove various time formats that FluentForms might add
        formData.date_time = formData.date_time
          .replace(/\s+12:00:00 AM/i, '')
          .replace(/\s+00:00:00/i, '')
          .replace(/\s+12:00 AM/i, '')
          .replace(/\s+00:00/i, '')
          .trim();
        console.log('Cleaned date_time field:', formData.date_time);
      }
      
      // Debug session length field
      console.log('Session length field value:', formData.length);
      console.log('Session length field type:', typeof formData.length);

      // Auto-detect service type from form data and form structure
      let detectedServiceType = formData.type || '';
      
      // Try to detect service type from form ID or form structure
      const formId = req.body.form_id || req.body.form?.id || '';
      console.log('📋 Form ID detected:', formId);
      
      // Map form IDs to service types (based on your form list)
      const formIdMap = {
        '17': 'Wellness',
        '13': 'Skincare',
        '12': 'Makeup', 
        '11': 'Esthetics',
        '10': 'Cleaning',
        '9': 'Bodywork',
        '8': 'Beauty',
        '7': 'Massage'
      };
      
      if (formId && formIdMap[formId]) {
        detectedServiceType = formIdMap[formId];
        console.log(`🎯 Detected service type from form ID ${formId}: ${detectedServiceType}`);
      }
      
      // If no form ID, try to detect from field names or content
      if (!detectedServiceType) {
        // Check for specific service-related fields or keywords in form data
        const allFormText = JSON.stringify(formData).toLowerCase();
        
        if (allFormText.includes('skincare')) detectedServiceType = 'Skincare';
        else if (allFormText.includes('makeup')) detectedServiceType = 'Makeup';
        else if (allFormText.includes('esthetics')) detectedServiceType = 'Esthetics';
        else if (allFormText.includes('cleaning')) detectedServiceType = 'Cleaning';
        else if (allFormText.includes('bodywork')) detectedServiceType = 'Bodywork';
        else if (allFormText.includes('beauty')) detectedServiceType = 'Beauty';
        else if (allFormText.includes('massage')) detectedServiceType = 'Massage';
        
        if (detectedServiceType) {
          console.log(`🔍 Detected service type from content: ${detectedServiceType}`);
        }
      }
      
      // If type is empty but length has service info, swap them
      if (!detectedServiceType && formData.length && 
          (formData.length.includes('Hair') || formData.length.includes('Beauty') || 
           formData.length.includes('Massage') || formData.length.includes('Wellness'))) {
        detectedServiceType = formData.length;
        formData.length = formData.type || 'Not specified';
        console.log(`🔄 Swapped type and length fields: type="${detectedServiceType}", length="${formData.length}"`);
      }
      
      // Set the detected service type
      formData.type = detectedServiceType || 'General Service';
      
      console.log('🎯 Final service type:', formData.type);
      console.log('📋 Final form data for validation:', JSON.stringify(formData, null, 2));

      // Validate the form data
      const { error, value } = fluentFormsSchema.validate(formData);
      if (error) {
        console.error('Validation error:', error.details);
        return res.status(400).json({ 
          error: 'Invalid form data', 
          details: error.details 
        });
      }

      // Convert provider_id from "provider10" format to numeric if needed
      if (value.provider_id && typeof value.provider_id === 'string') {
        const match = value.provider_id.match(/^provider(\d+)$/);
        if (match) {
          value.provider_id = parseInt(match[1]);
          console.log('Converted provider_id from string to number:', value.provider_id);
        }
      }

      // Optional geo enforcement: block out-of-range targeted submissions
      try {
        const geoEnforce = (process.env.GEO_ENFORCE ?? 'true') === 'true';
        const radiusMiles = parseInt(process.env.GEO_RADIUS_MILES || '40', 10);
        if (geoEnforce && value.provider_id && value.cityzip) {
          // Provider/listing location may be passed via hidden fields on the listing form
          const listingCity = value.listing_city;
          const listingLocation = value.listing_location;
          const providerLocation = value.provider_location; // e.g., "Miami, FL" or full address

          let providerQuery = null;
          if (providerLocation && providerLocation.toString().trim()) {
            providerQuery = providerLocation.toString().trim();
          } else if ((listingCity && listingCity.toString().trim()) || (listingLocation && listingLocation.toString().trim())) {
            const parts = [];
            if (listingCity && listingCity.toString().trim()) parts.push(listingCity.toString().trim());
            if (listingLocation && listingLocation.toString().trim()) parts.push(listingLocation.toString().trim());
            providerQuery = parts.join(', ');
          }

          if (providerQuery) {
            const result = await GeoService.withinRadius(providerQuery, value.cityzip, radiusMiles);
            if (!result.allowed) {
              console.log(`🚫 Out-of-range submission: provider="${providerQuery}", cityzip="${value.cityzip}", distance=${result.distanceMiles?.toFixed(1)}mi > radius=${radiusMiles}mi`);
              // Create the lead for analytics but DO NOT notify the provider
              const lead = await Lead.create(value);
              console.log('Lead created (out-of-range, provider not notified):', lead.lead_id);
              return res.json({
                success: true,
                out_of_range: true,
                leadId: lead.lead_id,
                message: 'Selected provider is outside travel radius',
                distance_miles: result.distanceMiles,
                radius_miles: radiusMiles
              });
            }
          } else {
            console.log('Geo enforcement enabled but no provider/listing location provided; skipping distance check');
          }
        }
      } catch (geoErr) {
        console.error('Geo enforcement error (continuing without block):', geoErr.message);
      }

      // Create the lead
      const lead = await Lead.create(value);
      console.log('Lead created:', lead.lead_id);
      console.log('Provider ID from form:', value.provider_id, 'Type:', typeof value.provider_id);

      // Process the lead asynchronously (with optional specific provider for testing)
      LeadProcessor.processNewLead(lead.lead_id, value.provider_id).catch(error => {
        console.error('Error processing lead:', error);
      });

      res.json({ 
        success: true, 
        leadId: lead.lead_id,
        providerId: value.provider_id || 'auto-matched',
        message: 'Lead received and processing started'
      });

    } catch (error) {
      console.error('Error handling FluentForms webhook:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  static async handleStripeWebhook(req, res) {
    // Verify crypto is available
    console.log('Stripe webhook handler - crypto available:', typeof crypto);
    console.log('Stripe webhook handler - crypto.createHmac available:', typeof crypto.createHmac);
    console.log('Stripe webhook handler - global.crypto available:', typeof global.crypto);
    
    // Ensure crypto is available globally for Stripe
    if (!global.crypto && typeof crypto !== 'undefined') {
      global.crypto = crypto;
      console.log('Set global.crypto from local crypto module');
    }
    
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      const sig = req.headers['stripe-signature'];
      
      // Additional validation
      if (!sig) {
        console.error('Missing Stripe signature header');
        return res.status(400).send('Webhook Error: Missing stripe-signature header');
      }
      
      if (!endpointSecret) {
        console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
        return res.status(500).send('Webhook Error: Server configuration error');
      }
      
      if (!req.body) {
        console.error('Missing request body');
        return res.status(400).send('Webhook Error: Missing request body');
      }
      
      // Use rawBody (Buffer) saved by express.json verify callback in server.js
      const payload = req.rawBody || req.body;
      
      console.log('Attempting to construct event with:');
      console.log('- rawBody available:', !!req.rawBody);
      console.log('- rawBody is Buffer:', Buffer.isBuffer(req.rawBody));
      console.log('- payload type:', typeof payload);
      console.log('- payload is Buffer:', Buffer.isBuffer(payload));
      console.log('- payload length:', payload?.length || 0);
      console.log('- Signature present:', !!sig);
      console.log('- Signature preview:', sig ? sig.substring(0, 30) + '...' : 'NONE');
      console.log('- Secret configured:', !!endpointSecret);
      console.log('- Secret prefix:', endpointSecret ? endpointSecret.substring(0, 8) + '...' : 'NONE');
      
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
      console.log('✅ Webhook signature verified successfully');
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      console.error('Error stack:', err.stack);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      console.log('🔔 Webhook event type:', event.type);
      console.log('🔔 Webhook event ID:', event.id);
      console.log('🔔 Webhook received at:', new Date().toISOString());
      
      if (event.type === 'checkout.session.completed') {
        console.log('💳 Processing checkout.session.completed webhook...');
        await WebhookController.handleCheckoutCompleted(event.data.object);
        console.log('✅ Webhook processing completed successfully');
      } else {
        console.log(`ℹ️ Ignoring webhook event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Error handling Stripe webhook:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  static async handleCheckoutCompleted(session) {
    const Unlock = require('../models/Unlock');
    const SMSService = require('../services/SMSService');
    const EmailService = require('../services/EmailService');
    const Lead = require('../models/Lead');
    const Provider = require('../models/Provider');

    try {
      const leadId = session.metadata.lead_id;
      const providerId = session.metadata.provider_id;
      const now = new Date().toISOString();

      console.log(`Checkout session completed for lead ${leadId}, provider ${providerId}`);
      console.log('Session ID:', session.id);
      console.log('Payment status:', session.payment_status);
      console.log('Session mode:', session.mode);
      console.log('Amount total:', session.amount_total);
      console.log('Currency:', session.currency);
      console.log('Session status:', session.status);
      console.log('Full session object:', JSON.stringify(session, null, 2));
      
      // CRITICAL: Only process if payment is actually completed
      if (session.payment_status !== 'paid') {
        console.log(`⚠️ Payment not completed yet (status: ${session.payment_status}), skipping webhook processing`);
        return;
      }
      
      console.log(`🎉 PAYMENT CONFIRMED! Processing payment for lead ${leadId}, provider ${providerId}`);
      
      // Check if this exact session has already been processed
      const pool = require('../config/database');
      const existingProcessed = await pool.query(
        'SELECT * FROM unlocks WHERE checkout_session_id = $1',
        [session.id]
      );
      
      console.log(`Checking for existing session ${session.id}:`, existingProcessed.rows);
      
      if (existingProcessed.rows.length > 0) {
        const existing = existingProcessed.rows[0];
        // Check if already processed (either by status or revealed_at timestamp)
        if (existing.status === 'PAID' || existing.status === 'REVEALED' || existing.revealed_at) {
          console.log(`⚠️ Session ${session.id} already processed with status ${existing.status}, revealed_at: ${existing.revealed_at}, ignoring duplicate webhook`);
          await pool.query(`
            INSERT INTO unlock_audit_log (
              lead_id, provider_id, event_type, checkout_session_id, notes, created_at
            ) VALUES ($1, $2, 'DUPLICATE_SESSION_WEBHOOK', $3, $4, CURRENT_TIMESTAMP)
          `, [leadId, providerId, session.id, `Session already processed with status ${existing.status}, revealed_at: ${existing.revealed_at}`]);
          return;
        } else {
          console.log(`Session ${session.id} exists but status is ${existing.status}, continuing processing`);
        }
      }

      // Check if unlock exists first
      const unlockRecord = await Unlock.findByLeadAndProvider(leadId, providerId);
      console.log('Found unlock record:', unlockRecord);
      
      if (!unlockRecord) {
        console.error(`❌ Unlock not found for lead ${leadId}, provider ${providerId}`);
        console.log('Searching for any unlocks with similar lead ID...');
        
        // Try to find any unlock with similar lead ID
        const pool = require('../config/database');
        const searchQuery = `SELECT * FROM unlocks WHERE lead_id::text LIKE $1 LIMIT 5`;
        const searchResult = await pool.query(searchQuery, [`${leadId.substring(0, 8)}%`]);
        console.log('Similar unlocks found:', searchResult.rows);
        return;
      }

      // Handle duplicate payment detection
      const duplicateCheck = await Unlock.handleDuplicatePayment(leadId, providerId, session.id);
      if (duplicateCheck.action === 'duplicate_payment') {
        console.log('Duplicate payment detected, skipping - already processed');
        const provider = await Provider.findById(providerId);
        if (provider) {
          await SMSService.sendSMS(provider.phone, 
            `Duplicate payment detected. Lead ${leadId.substring(0, 8)} was already unlocked. No additional charges applied.`
          );
          
          // DO NOT resend customer details - they already have them
          console.log('Duplicate payment notification sent, customer details NOT resent');
        }
        return;
      }

      // Find the unlock record
      const unlock = await Unlock.findByLeadAndProvider(leadId, providerId);
      if (!unlock) {
        console.error('Unlock not found for payment completion');
        return;
      }

      // Check if already processed (idempotency)
      if (unlock.status === 'PAID' || unlock.status === 'REVEALED') {
        console.log(`Payment already processed (status: ${unlock.status}), skipping duplicate webhook`);
        
        // Log duplicate webhook attempt for debugging
        const pool = require('../config/database');
        await pool.query(`
          INSERT INTO unlock_audit_log (
            lead_id, provider_id, event_type, checkout_session_id, notes, created_at
          ) VALUES ($1, $2, 'DUPLICATE_WEBHOOK', $3, $4, CURRENT_TIMESTAMP)
        `, [leadId, providerId, session.id, `Status already ${unlock.status}, webhook ignored`]);
        
        return;
      }

      // Handle payment after TTL
      if (unlock.ttl_expires_at && new Date(unlock.ttl_expires_at) < new Date()) {
        console.log('Payment received after TTL, but still revealing since provider paid');
        const result = await Unlock.handlePaymentAfterTTL(session.id);
        if (result.action === 'reveal_after_ttl') {
          console.log('Lead marked as closed to prevent new unlocks');
        }
      }

      // Update status to PAID with audit trail
      await Unlock.updateStatus(leadId, providerId, 'PAID', {
        paid_at: now,
        unlocked_at: now,
        checkout_session_id: session.id
      });

      // Get the private lead details
      const leadDetails = await Lead.getPrivateFields(leadId);
      const publicDetails = await Lead.getPublicFields(leadId);

      // Get provider info
      const provider = await Provider.findById(providerId);

      if (leadDetails && provider) {
        // Send client notification that provider is reviewing
        try {
          if (process.env.SEND_IMMEDIATE_CLIENT_NOTIFY === 'true') {
            const clientMessage = `A local provider is reviewing your request for ${publicDetails.preferred_time_window || 'your appointment'}. You may receive contact shortly.`;
            await SMSService.sendSMS(leadDetails.client_phone, clientMessage);
            console.log(`📱 Sent client notification: ${leadDetails.client_phone}`);
          }
        } catch (smsError) {
          console.error('Error sending client notification SMS:', smsError);
        }

        // Send reveal SMS
        await SMSService.sendRevealDetails(provider.phone, leadDetails, publicDetails, leadId);
        
        // Send provider notification about client contact
        try {
          const providerMessage = "Client notified. For best results, text within 5 minutes.";
          await SMSService.sendSMS(provider.phone, providerMessage);
          console.log(`📱 Sent provider notification: ${provider.phone}`);
        } catch (smsError) {
          console.error('Error sending provider notification SMS:', smsError);
        }

        try {
          await EmailService.sendUnlockedDetailsEmail({
            provider,
            privateDetails: leadDetails,
            publicDetails
          });
        } catch (emailError) {
          console.error('Error sending unlocked details email (SMS already sent):', emailError);
        }

        // Update status to REVEALED with audit trail
        await Unlock.updateStatus(leadId, providerId, 'REVEALED', {
          revealed_at: now
        });

        // Schedule follow-up SMS to client (15 min after booking time)
        try {
          const FollowUpService = require('../services/FollowUpService');
          await FollowUpService.scheduleFollowUp({
            leadId,
            providerId,
            clientPhone: leadDetails.client_phone,
            clientName: leadDetails.client_name,
            providerName: provider.name,
            bookingTime: publicDetails.preferred_time_window
          });
        } catch (fuErr) {
          console.error('Error scheduling follow-up (reveal still succeeded):', fuErr.message);
        }

        // Schedule provider contact follow-up (10 min after unlock)
        try {
          const ProviderContactFollowUpService = require('../services/ProviderContactFollowUpService');
          await ProviderContactFollowUpService.scheduleFollowUp(leadId, providerId, provider.phone, leadDetails.client_name);
        } catch (pcfErr) {
          console.error('Error scheduling provider contact follow-up (reveal still succeeded):', pcfErr.message);
        }

        console.log(`Successfully revealed lead details to provider ${providerId}`);
      }

    } catch (error) {
      console.error('Error processing checkout completion:', error);
      throw error;
    }
  }

  static async getProviderById(providerId) {
    const Provider = require('../models/Provider');
    return await Provider.findById(providerId);
  }
}

module.exports = WebhookController;
