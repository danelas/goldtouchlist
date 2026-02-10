const axios = require('axios');

class MailerLiteService {
  static isEnabled() {
    const enabled = !!process.env.MAILERLITE_API_KEY;
    console.log(`📬 MailerLite enabled: ${enabled}, API key set: ${!!process.env.MAILERLITE_API_KEY}, Group ID set: ${!!process.env.MAILERLITE_GROUP_ID}`);
    return enabled;
  }

  static getClient() {
    return axios.create({
      baseURL: 'https://connect.mailerlite.com/api',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`
      }
    });
  }

  /**
   * Add a provider as a subscriber to MailerLite.
   * Optionally assign them to a group if MAILERLITE_GROUP_ID is set.
   */
  static async addSubscriber({ email, name, phone, serviceAreas, providerId }) {
    console.log(`📬 MailerLite addSubscriber called for: ${email || 'NO EMAIL'}, provider: ${providerId}`);
    
    if (!this.isEnabled()) {
      console.log('📬 MailerLiteService DISABLED (missing MAILERLITE_API_KEY env var)');
      return { skipped: true };
    }

    if (!email) {
      console.log('📬 MailerLiteService: No email provided, skipping');
      return { skipped: true };
    }

    const client = this.getClient();

    const subscriberData = {
      email,
      fields: {
        name: name || '',
        phone: phone || '',
        company: providerId || ''
      }
    };

    // Assign to group if configured
    const groupId = process.env.MAILERLITE_GROUP_ID;
    if (groupId) {
      subscriberData.groups = [groupId];
    }

    try {
      const response = await client.post('/subscribers', subscriberData);
      console.log(`MailerLite: Added subscriber ${email}`, response.data?.data?.id);
      return { success: true, subscriberId: response.data?.data?.id };
    } catch (error) {
      // 422 means subscriber already exists — not an error
      if (error.response?.status === 422) {
        console.log(`MailerLite: Subscriber ${email} already exists`);
        return { success: true, alreadyExists: true };
      }
      console.error('MailerLite: Error adding subscriber:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MailerLiteService;
