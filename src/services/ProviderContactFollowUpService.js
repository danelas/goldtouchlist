const pool = require('../config/database');
const SMSService = require('./SMSService');

class ProviderContactFollowUpService {
  static PROVIDER_FOLLOW_UP_DELAY_MINUTES = 10;

  /**
   * Schedule a follow-up SMS to provider 10 minutes after unlock
   */
  static async scheduleFollowUp(leadId, providerId, providerPhone, clientName) {
    try {
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
      
      // Find follow-ups that are due to be sent
      const result = await pool.query(`
        SELECT f.*, l.client_name, p.phone as provider_phone, p.name as provider_name
        FROM provider_contact_followups f
        JOIN leads l ON f.lead_id = l.lead_id
        JOIN providers p ON f.provider_id = p.provider_id
        WHERE f.status = 'SCHEDULED' 
          AND f.sent_at <= $1
        ORDER BY f.sent_at ASC
        LIMIT 50
      `, [now]);

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
      const result = await pool.query(`
        SELECT f.*, p.name as provider_name, l.client_name
        FROM provider_contact_followups f
        JOIN providers p ON f.provider_id = p.provider_id
        JOIN leads l ON f.lead_id = l.lead_id
        WHERE p.phone = $1 AND f.status = 'SENT'
        ORDER BY f.sent_at DESC
        LIMIT 1
      `, [providerPhone]);

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
