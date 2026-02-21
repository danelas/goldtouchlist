const pool = require('../config/database');

class ManualMessageService {
  /**
   * Record an outbound manual message
   */
  static async recordOutboundMessage(phone, message, aiContext = null) {
    try {
      const result = await pool.query(`
        INSERT INTO manual_messages (phone, message, message_type, ai_context)
        VALUES ($1, $2, 'outbound', $3)
        RETURNING *
      `, [phone, message, aiContext]);
      
      console.log(`📝 Recorded manual message to ${phone}: ${message.substring(0, 50)}...`);
      return result.rows[0];
    } catch (error) {
      console.error('Error recording manual message:', error);
      throw error;
    }
  }

  /**
   * Check if an incoming message is a response to a recent manual message
   */
  static async findRecentManualMessage(phone, hours = 24) {
    try {
      const result = await pool.query(`
        SELECT * FROM manual_messages 
        WHERE phone = $1 
          AND message_type = 'outbound'
          AND response_received_at IS NULL
          AND sent_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY sent_at DESC
        LIMIT 1
      `, [phone]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding recent manual message:', error);
      return null;
    }
  }

  /**
   * Record a response to a manual message
   */
  static async recordResponse(messageId, responseText) {
    try {
      const result = await pool.query(`
        UPDATE manual_messages 
        SET response_received_at = NOW(),
            response_text = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [responseText, messageId]);
      
      if (result.rows.length > 0) {
        console.log(`📝 Recorded response to manual message: ${responseText}`);
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error recording manual message response:', error);
      throw error;
    }
  }

  /**
   * Get context for AI response based on previous manual message
   */
  static async getAIContext(phone, responseText) {
    try {
      const manualMessage = await this.findRecentManualMessage(phone);
      
      if (!manualMessage) {
        return null;
      }

      // Record the response
      await this.recordResponse(manualMessage.id, responseText);

      // Build AI context
      const context = {
        originalMessage: manualMessage.message,
        aiContext: manualMessage.ai_context,
        response: responseText,
        sentAt: manualMessage.sent_at
      };

      return context;
    } catch (error) {
      console.error('Error getting AI context:', error);
      return null;
    }
  }

  /**
   * Get all manual messages for a phone number
   */
  static async getMessageHistory(phone, limit = 10) {
    try {
      const result = await pool.query(`
        SELECT * FROM manual_messages 
        WHERE phone = $1
        ORDER BY sent_at DESC
        LIMIT $2
      `, [phone, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting message history:', error);
      return [];
    }
  }
}

module.exports = ManualMessageService;
