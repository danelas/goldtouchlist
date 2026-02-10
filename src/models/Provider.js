const pool = require('../config/database');
const MailerLiteService = require('../services/MailerLiteService');

class Provider {
  static async findById(providerId) {
    // Handle both numeric IDs and string IDs like "provider10"
    let query, params;
    
    if (typeof providerId === 'string' && providerId.startsWith('provider')) {
      // Use the string ID directly (like "provider10")
      query = 'SELECT * FROM providers WHERE id = $1';
      params = [providerId];
    } else {
      // Convert numeric ID to string format (10 -> "provider10")
      const stringId = `provider${providerId}`;
      query = 'SELECT * FROM providers WHERE id = $1';
      params = [stringId];
    }
    
    try {
      const result = await pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding provider:', error);
      throw error;
    }
  }

  static async findByPhone(phoneNumber) {
    // Normalize phone number - try multiple formats
    const cleanPhone = phoneNumber.replace(/[^\d]/g, ''); // Remove all non-digits
    
    // Try different phone number formats
    const phoneFormats = [
      phoneNumber, // Original format
      `+${cleanPhone}`, // Add + prefix
      `+1${cleanPhone.substring(1)}`, // Add +1 prefix if it starts with 1
      cleanPhone, // Just digits
      `1${cleanPhone}` // Add 1 prefix
    ];
    
    console.log('Trying phone formats:', phoneFormats);
    
    try {
      // Try each format
      for (const format of phoneFormats) {
        const query = 'SELECT * FROM providers WHERE phone = $1';
        const result = await pool.query(query, [format]);
        if (result.rows.length > 0) {
          console.log(`Found provider with phone format: ${format}`);
          return result.rows[0];
        }
      }
      
      console.log('No provider found with any phone format');
      return null;
    } catch (error) {
      console.error('Error finding provider by phone:', error);
      throw error;
    }
  }

  static async findMatchingProviders(leadData) {
    // Find providers that match the lead criteria
    const query = `
      SELECT * FROM providers 
      ORDER BY id
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error finding matching providers:', error);
      throw error;
    }
  }

  static async updateOptOutStatus(phoneNumber, optedOut) {
    // Note: Opt-out functionality not implemented in current database schema
    console.log(`Opt-out request for ${phoneNumber} - not implemented`);
    return null;
  }

  static async create(providerData) {
    // Handle both old format (phone, name) and new format (full object)
    let cleanData;
    
    if (typeof providerData === 'object' && providerData.id) {
      // New format - full provider object
      cleanData = {
        id: providerData.id,
        phone: providerData.phone ? providerData.phone.replace(/[^\d+]/g, '') : null,
        email: providerData.email || null,
        name: providerData.name,
        wordpress_user_id: providerData.wordpress_user_id || null,
        slug: providerData.slug || null,
        service_areas: providerData.service_areas || [],
        is_verified: providerData.is_verified !== undefined ? providerData.is_verified : true,
        first_lead_used: providerData.first_lead_used !== undefined ? providerData.first_lead_used : false,
        sms_opted_out: providerData.sms_opted_out !== undefined ? providerData.sms_opted_out : false
      };
    } else {
      // Old format - just phone and name
      const { phone, name } = providerData;
      const cleanPhone = phone.replace(/[^\d+]/g, '');
      
      // Generate provider ID (find next available)
      const countResult = await pool.query('SELECT COUNT(*) FROM providers');
      const nextId = `provider${parseInt(countResult.rows[0].count) + 1}`;
      
      cleanData = {
        id: nextId,
        phone: cleanPhone,
        name: name,
        email: null,
        wordpress_user_id: null,
        slug: null,
        service_areas: [],
        is_verified: true,
        first_lead_used: false,
        sms_opted_out: false
      };
    }

    const query = `
      INSERT INTO providers (
        id, phone, email, name, wordpress_user_id, slug, 
        service_areas, is_verified, first_lead_used, sms_opted_out
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      cleanData.id,
      cleanData.phone,
      cleanData.email,
      cleanData.name,
      cleanData.wordpress_user_id,
      cleanData.slug,
      cleanData.service_areas,
      cleanData.is_verified,
      cleanData.first_lead_used,
      cleanData.sms_opted_out
    ];

    try {
      const result = await pool.query(query, values);
      const provider = result.rows[0];

      // Sync to MailerLite contact list
      try {
        console.log(`📬 Provider.create: syncing ${provider.email || 'NO EMAIL'} to MailerLite`);
        await MailerLiteService.addSubscriber({
          email: provider.email,
          name: provider.name,
          phone: provider.phone,
          providerId: provider.id
        });
      } catch (mlError) {
        console.error('📬 MailerLite sync failed (provider still created):', mlError.message);
      }

      return provider;
    } catch (error) {
      console.error('Error creating provider:', error);
      throw error;
    }
  }

  static async generateUniqueId() {
    // Find the highest existing provider number
    const query = `
      SELECT id FROM providers 
      WHERE id ~ '^provider[0-9]+$' 
      ORDER BY CAST(SUBSTRING(id FROM 9) AS INTEGER) DESC 
      LIMIT 1
    `;
    
    try {
      const result = await pool.query(query);
      let nextNumber = 1;
      
      if (result.rows.length > 0) {
        const lastId = result.rows[0].id;
        const lastNumber = parseInt(lastId.replace('provider', ''));
        nextNumber = lastNumber + 1;
      }
      
      return `provider${nextNumber}`;
    } catch (error) {
      console.error('Error generating unique provider ID:', error);
      // Fallback to count-based method
      const countResult = await pool.query('SELECT COUNT(*) FROM providers');
      return `provider${parseInt(countResult.rows[0].count) + 1}`;
    }
  }

  static async getRateLimitInfo(providerId, windowMinutes = 60) {
    const query = `
      SELECT COUNT(*) as message_count
      FROM unlocks 
      WHERE provider_id = $1 
      AND last_sent_at > CURRENT_TIMESTAMP - INTERVAL '${windowMinutes} minutes'
    `;

    try {
      const result = await pool.query(query, [providerId]);
      return {
        messageCount: parseInt(result.rows[0].message_count),
        windowMinutes,
        isRateLimited: parseInt(result.rows[0].message_count) >= 10 // Max 10 messages per hour
      };
    } catch (error) {
      console.error('Error getting rate limit info:', error);
      return { messageCount: 0, windowMinutes, isRateLimited: false };
    }
  }

  static async isOptedOut(phoneNumber) {
    // Opt-out functionality not implemented in current database schema
    return false;
  }

  static async findBySlug(slug) {
    const query = 'SELECT * FROM providers WHERE slug = $1';
    
    try {
      const result = await pool.query(query, [slug]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding provider by slug:', error);
      throw error;
    }
  }

  static async getAllWithUrls(baseUrl = '') {
    const query = `
      SELECT 
        id,
        name,
        phone,
        created_at,
        updated_at
      FROM providers 
      ORDER BY name
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows.map(provider => {
        // Generate a slug since column doesn't exist yet
        const slug = Provider.generateSlug(provider.name, provider.id);
        return {
          ...provider,
          slug: slug,
          form_url: `${baseUrl}/form/${slug}`,
          profile_url: `${baseUrl}/provider/${slug}`
        };
      });
    } catch (error) {
      console.error('Error getting all providers with URLs:', error);
      throw error;
    }
  }

  static generateSlug(name, providerId) {
    // Create URL-friendly slug from name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
    
    // Extract numeric part from provider ID (provider1 -> 1)
    const numericId = typeof providerId === 'string' ? 
      providerId.replace('provider', '') : providerId;
    
    return `${baseSlug}-${numericId}`;
  }

  static async updateSlug(providerId, slug) {
    const query = `
      UPDATE providers 
      SET slug = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [slug, providerId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating provider slug:', error);
      throw error;
    }
  }

  static async markFirstLeadUsed(providerId) {
    const query = `
      UPDATE providers 
      SET first_lead_used = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [providerId]);
      console.log(`✅ Marked first lead as used for provider ${providerId}`);
      return result.rows[0];
    } catch (error) {
      console.error('Error marking first lead as used:', error);
      throw error;
    }
  }

  static async hasUsedFirstLead(providerId) {
    const query = 'SELECT first_lead_used FROM providers WHERE id = $1';
    
    try {
      console.log(`Querying first_lead_used for provider: ${providerId}`);
      const result = await pool.query(query, [providerId]);
      console.log(`Query result:`, result.rows[0]);
      
      if (!result.rows[0]) {
        console.log(`⚠️ Provider ${providerId} not found in database`);
        return true; // Provider doesn't exist, treat as already used
      }
      
      const hasUsed = result.rows[0].first_lead_used || false;
      console.log(`Provider ${providerId} first_lead_used value:`, hasUsed);
      return hasUsed;
    } catch (error) {
      console.error('❌ Error checking first lead status:', error);
      console.error('Error details:', error.message);
      return true; // Default to true (already used) on error to be safe
    }
  }
}

module.exports = Provider;
