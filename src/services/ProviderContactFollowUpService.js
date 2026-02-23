const pool = require('../config/database');
const SMSService = require('./SMSService');

class ProviderContactFollowUpService {
  static PROVIDER_FOLLOW_UP_DELAY_MINUTES = 10;
  static PROVIDERS_PK = null; // Cache detected providers PK column name

  static async getProvidersPk() {
    if (this.PROVIDERS_PK) return this.PROVIDERS_PK;
    try {
      const result = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'providers' AND column_name IN ('provider_id','id')
        ORDER BY CASE column_name WHEN 'provider_id' THEN 0 ELSE 1 END
        LIMIT 1
      `);
      this.PROVIDERS_PK = result.rows[0]?.column_name || 'provider_id';
      return this.PROVIDERS_PK;
    } catch (e) {
      console.error('Error detecting providers PK, defaulting to provider_id:', e.message);
      this.PROVIDERS_PK = 'provider_id';
      return this.PROVIDERS_PK;
    }
  }

  static async getProvidersPkType() {
    try {
      const result = await pool.query(`
        SELECT column_name, data_type, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'providers' AND column_name IN ('provider_id','id')
        ORDER BY CASE column_name WHEN 'provider_id' THEN 0 ELSE 1 END
        LIMIT 1
      `);
      const row = result.rows[0] || {};
      const dt = row.data_type || 'integer';
      const len = row.character_maximum_length;
      if (dt === 'integer') return 'INTEGER';
      if (dt === 'uuid') return 'UUID';
      if (dt === 'character varying') return len ? `VARCHAR(${len})` : 'VARCHAR';
      return dt.toUpperCase();
    } catch (e) {
      console.error('Error detecting providers PK type, defaulting to INTEGER:', e.message);
      return 'INTEGER';
    }
  }

  static async ensureTableExists() {
    try {
      const exists = await pool.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'provider_contact_followups' LIMIT 1
      `);
      if (exists.rows.length > 0) return; // already exists

      const providersPk = await this.getProvidersPk();
      const providersPkType = await this.getProvidersPkType();
      const createSql = `
        CREATE TABLE IF NOT EXISTS provider_contact_followups (
          id SERIAL PRIMARY KEY,
          lead_id UUID NOT NULL REFERENCES leads(lead_id),
          provider_id ${providersPkType} NOT NULL REFERENCES providers(${providersPk}),
          status VARCHAR(50) DEFAULT 'SCHEDULED',
          sent_at TIMESTAMP,
          responded_at TIMESTAMP,
          response_value INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(lead_id, provider_id)
        )
      `;
      await pool.query(createSql);

      await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_lead_id ON provider_contact_followups(lead_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_provider_id ON provider_contact_followups(provider_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_status ON provider_contact_followups(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_contact_followups_sent_at ON provider_contact_followups(sent_at)`);

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

      console.log('✅ Created provider_contact_followups table and indexes');
    } catch (e) {
      console.error('Error ensuring provider_contact_followups exists:', e);
      // Do not throw to avoid crashing scheduler loop
    }
  }

  /**
   * Schedule a follow-up SMS to provider 10 minutes after unlock
   */
  static async scheduleFollowUp(leadId, providerId, providerPhone, clientName) {
    try {
      await this.ensureTableExists();
      // Check if follow-up already scheduled
      const existing = await pool.query(`
        SELECT * FROM provider_contact_followups 
        WHERE lead_id = $1 AND provider_id = $2
      `, [leadId, providerId]);

      if (existing.rows.length > 0) {
        console.log(`Provider follow-up already scheduled for lead ${leadId}, provider ${providerId}`);
        return existing.rows[0];
      }

      // Calculate send time (10 minutes from now)
      const sendAt = new Date(Date.now() + this.PROVIDER_FOLLOW_UP_DELAY_MINUTES * 60 * 1000);

      // Insert follow-up record
      const result = await pool.query(`
        INSERT INTO provider_contact_followups (lead_id, provider_id, status, sent_at)
        VALUES ($1, $2, 'SCHEDULED', $3)
        RETURNING *
      `, [leadId, providerId, sendAt]);

      const followUp = result.rows[0];
      console.log(`📅 Scheduled provider follow-up for ${sendAt.toISOString()} (lead ${leadId}, provider ${providerId})`);

      return followUp;
    } catch (error) {
      console.error('Error scheduling provider follow-up:', error);
      throw error;
    }
  }

  /**
   * Process all scheduled follow-ups that are due
   */
  static async processScheduledFollowUps() {
    try {
      const now = new Date();
      
      await this.ensureTableExists();
      const providersPk = await this.getProvidersPk();
      // Find follow-ups that are due to be sent
      const query = `
        SELECT f.*, l.client_name, p.phone as provider_phone, p.name as provider_name
        FROM provider_contact_followups f
        JOIN leads l ON f.lead_id = l.lead_id
        JOIN providers p ON f.provider_id = p.${providersPk}
        WHERE f.status = 'SCHEDULED' 
          AND f.sent_at <= $1
        ORDER BY f.sent_at ASC
        LIMIT 50
      `;
      const result = await pool.query(query, [now]);

      if (result.rows.length === 0) {
        return; // No follow-ups to send
      }

      console.log(`📤 Processing ${result.rows.length} provider contact follow-ups`);

      for (const followUp of result.rows) {
        await this.sendFollowUpSMS(followUp);
      }

    } catch (error) {
      console.error('Error processing scheduled follow-ups:', error);
    }
  }

  /**
   * Send the follow-up SMS to provider
   */
  static async sendFollowUpSMS(followUp) {
    try {
      const clientName = followUp.client_name || 'the client';
      const message = `Have you contacted ${clientName} yet? Reply 1 = Yes, 2 = Not yet`;

      // Send SMS
      await SMSService.sendSMS(followUp.provider_phone, message);

      // Update status to SENT
      await pool.query(`
        UPDATE provider_contact_followups 
        SET status = 'SENT', sent_at = NOW()
        WHERE id = $1
      `, [followUp.id]);

      console.log(`📱 Sent provider follow-up SMS to ${followUp.provider_phone} (lead ${followUp.lead_id})`);

    } catch (error) {
      console.error('Error sending follow-up SMS:', error);
      
      // Mark as FAILED but don't throw
      await pool.query(`
        UPDATE provider_contact_followups 
        SET status = 'FAILED'
        WHERE id = $1
      `, [followUp.id]);
    }
  }

  /**
   * Handle provider's response to follow-up
   */
  static async handleProviderResponse(providerPhone, response) {
    try {
      // Parse response (expecting 1 or 2)
      const responseValue = parseInt(response.trim());
      
      if (responseValue !== 1 && responseValue !== 2) {
        return { handled: false, reason: 'Invalid response format' };
      }

      // Find the most recent follow-up for this provider
      await this.ensureTableExists();
      const providersPk = await this.getProvidersPk();
      const selectSql = `
        SELECT f.*, p.name as provider_name, l.client_name
        FROM provider_contact_followups f
        JOIN providers p ON f.provider_id = p.${providersPk}
        JOIN leads l ON f.lead_id = l.lead_id
        WHERE p.phone = $1 AND f.status = 'SENT'
        ORDER BY f.sent_at DESC
        LIMIT 1
      `;
      const result = await pool.query(selectSql, [providerPhone]);

      if (result.rows.length === 0) {
        return { handled: false, reason: 'No pending follow-up found' };
      }

      const followUp = result.rows[0];

      // Update the follow-up with response
      await pool.query(`
        UPDATE provider_contact_followups 
        SET status = 'RESPONDED', 
            responded_at = NOW(),
            response_value = $1
        WHERE id = $2
      `, [responseValue, followUp.id]);

      const responseText = responseValue === 1 ? 'Yes' : 'Not yet';
      console.log(`📝 Provider follow-up response: ${followUp.provider_name} - ${responseText} for ${followUp.client_name}`);

      // Send confirmation
      const confirmation = responseValue === 1 
        ? "Thanks for letting us know! Glad you made contact."
        : "No problem. Keep us updated when you do reach out.";
      
      await SMSService.sendSMS(providerPhone, confirmation);

      return { 
        handled: true, 
        action: 'provider_contact_followup_response',
        response: responseText,
        leadId: followUp.lead_id,
        providerId: followUp.provider_id
      };

    } catch (error) {
      console.error('Error handling provider follow-up response:', error);
      return { handled: false, error: error.message };
    }
  }

  /**
   * Get analytics on provider contact follow-ups
   */
  static async getFollowUpStats(days = 30) {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_followups,
          COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'RESPONDED' THEN 1 END) as responded,
          COUNT(CASE WHEN response_value = 1 THEN 1 END) as contacted_yes,
          COUNT(CASE WHEN response_value = 2 THEN 1 END) as contacted_not_yet,
          ROUND(
            COUNT(CASE WHEN status = 'RESPONDED' THEN 1 END) * 100.0 / 
            NULLIF(COUNT(CASE WHEN status = 'SENT' THEN 1 END), 0), 2
          ) as response_rate_percent,
          ROUND(
            COUNT(CASE WHEN response_value = 1 THEN 1 END) * 100.0 / 
            NULLIF(COUNT(CASE WHEN status = 'RESPONDED' THEN 1 END), 0), 2
          ) as contact_rate_percent
        FROM provider_contact_followups 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      `);

      return result.rows[0];
    } catch (error) {
      console.error('Error getting follow-up stats:', error);
      throw error;
    }
  }
}

module.exports = ProviderContactFollowUpService;
