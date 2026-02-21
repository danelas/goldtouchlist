const pool = require('../config/database');

const FOLLOW_UP_AFTER_BOOKING_MINUTES = 15; // Send follow-up 15 minutes after booking date/time
const FOLLOW_UP_FALLBACK_MINUTES = 30; // Fallback: 30 minutes after reveal if no booking time
const PROVIDER_REMINDER_DELAY_MINUTES = 15; // Remind provider 15 minutes after teaser if no unlock

// Status flow: SCHEDULED -> SENT -> YES_REPLIED | NO_REPLIED -> RECOVERY_OFFERED -> RECOVERY_ACCEPTED | COMPLETED | EXPIRED

class FollowUpService {

  /**
   * Schedule a follow-up SMS to the client after their lead is revealed to a provider.
   */
  static async scheduleFollowUp({ leadId, providerId, clientPhone, clientName, providerName, bookingTime }) {
    if (!clientPhone) {
      console.log('📞 FollowUp: No client phone, skipping follow-up');
      return null;
    }

    // Check if a follow-up already exists for this lead+provider
    const existing = await pool.query(
      'SELECT id FROM follow_ups WHERE lead_id = $1 AND provider_id = $2',
      [leadId, providerId]
    );

    if (existing.rows.length > 0) {
      console.log(`📞 FollowUp: Already scheduled for lead ${leadId} / provider ${providerId}`);
      return existing.rows[0];
    }

    // Schedule 15 min after booking date/time; fall back to 30 min from now if no booking time
    let sendAfter;
    if (bookingTime) {
      const bookingDate = new Date(bookingTime);
      if (!isNaN(bookingDate.getTime()) && bookingDate.getTime() > Date.now()) {
        sendAfter = new Date(bookingDate.getTime() + FOLLOW_UP_AFTER_BOOKING_MINUTES * 60 * 1000);
        console.log(`📞 FollowUp: Using booking time ${bookingDate.toISOString()} + 15 min`);
      } else {
        // Booking time is in the past or invalid — use fallback
        sendAfter = new Date(Date.now() + FOLLOW_UP_FALLBACK_MINUTES * 60 * 1000);
        console.log(`📞 FollowUp: Booking time past/invalid, using fallback ${FOLLOW_UP_FALLBACK_MINUTES} min from now`);
      }
    } else {
      sendAfter = new Date(Date.now() + FOLLOW_UP_FALLBACK_MINUTES * 60 * 1000);
      console.log(`📞 FollowUp: No booking time provided, using fallback ${FOLLOW_UP_FALLBACK_MINUTES} min from now`);
    }

    const result = await pool.query(`
      INSERT INTO follow_ups (lead_id, provider_id, client_phone, client_name, provider_name, status, send_after)
      VALUES ($1, $2, $3, $4, $5, 'SCHEDULED', $6)
      RETURNING *
    `, [leadId, providerId, clientPhone, clientName || 'there', providerName || 'the provider', sendAfter]);

    console.log(`📞 FollowUp: Scheduled for ${clientPhone} at ${sendAfter.toISOString()} (lead ${leadId})`);
    return result.rows[0];
  }

  /**
   * Process all follow-ups that are due to be sent.
   * Called periodically by the scheduler.
   */
  static async processScheduledFollowUps() {
    const SMSService = require('./SMSService');

    const due = await pool.query(`
      SELECT * FROM follow_ups
      WHERE status = 'SCHEDULED' AND send_after <= NOW()
      ORDER BY send_after ASC
      LIMIT 10
    `);

    if (due.rows.length === 0) return;

    console.log(`📞 FollowUp: Processing ${due.rows.length} scheduled follow-ups`);

    for (const followUp of due.rows) {
      try {
        const message = `Hi ${followUp.client_name}, just checking — did ${followUp.provider_name} reach out to you yet?\nReply YES or NO.`;

        await SMSService.sendSMS(followUp.client_phone, message);

        await pool.query(`
          UPDATE follow_ups SET status = 'SENT', sent_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [followUp.id]);

        console.log(`📞 FollowUp: Sent check-in to ${followUp.client_phone} (follow-up #${followUp.id})`);
      } catch (error) {
        console.error(`📞 FollowUp: Error sending follow-up #${followUp.id}:`, error.message);
      }
    }
  }

  /**
   * Handle an incoming SMS from a client phone number.
   * Returns { handled: true, ... } if this was a follow-up reply, or { handled: false } if not.
   */
  static async handleClientReply(clientPhone, message) {
    // Clean the phone number for matching
    const cleanPhone = clientPhone.replace(/[^\d+]/g, '');

    // Find the most recent SENT or NO_REPLIED follow-up for this phone
    const result = await pool.query(`
      SELECT * FROM follow_ups
      WHERE client_phone = $1 AND status IN ('SENT', 'RECOVERY_OFFERED')
      ORDER BY sent_at DESC
      LIMIT 1
    `, [cleanPhone]);

    if (result.rows.length === 0) {
      // Also try without + prefix or with +1 prefix
      const altPhones = [
        cleanPhone.startsWith('+') ? cleanPhone.substring(1) : `+${cleanPhone}`,
        cleanPhone.startsWith('+1') ? cleanPhone.substring(2) : `+1${cleanPhone}`
      ];

      for (const altPhone of altPhones) {
        const altResult = await pool.query(`
          SELECT * FROM follow_ups
          WHERE client_phone = $1 AND status IN ('SENT', 'RECOVERY_OFFERED')
          ORDER BY sent_at DESC
          LIMIT 1
        `, [altPhone]);

        if (altResult.rows.length > 0) {
          return await this._processReply(altResult.rows[0], message);
        }
      }

      return { handled: false };
    }

    return await this._processReply(result.rows[0], message);
  }

  /**
   * Process the actual reply based on follow-up status.
   */
  static async _processReply(followUp, message) {
    const SMSService = require('./SMSService');
    const normalized = message.trim().toUpperCase();
    const isYes = /^(Y|YES|YE|YEP|YEAH|YA)$/i.test(normalized);
    const isNo = /^(N|NO|NAH|NOPE)$/i.test(normalized);

    // Step 1: Client replies to "did provider reach out?"
    if (followUp.status === 'SENT') {
      if (isYes) {
        await pool.query(`
          UPDATE follow_ups SET status = 'YES_REPLIED', replied_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [followUp.id]);

        await SMSService.sendSMS(followUp.client_phone,
          "Great! If you need anything else, we're here. Have a wonderful experience!\n\nYou can also browse other available providers here:\nhttps://goldtouchlist.com"
        );

        console.log(`📞 FollowUp #${followUp.id}: Client confirmed provider reached out ✅`);
        return { handled: true, action: 'yes_confirmed' };
      }

      if (isNo) {
        await pool.query(`
          UPDATE follow_ups SET status = 'NO_REPLIED', replied_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [followUp.id]);

        // Offer recovery
        await SMSService.sendSMS(followUp.client_phone,
          "Thanks for letting us know. Would you like us to connect you with another available provider in your area?\nReply YES to receive options."
        );

        await pool.query(`
          UPDATE follow_ups SET status = 'RECOVERY_OFFERED', recovery_offered_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [followUp.id]);

        console.log(`📞 FollowUp #${followUp.id}: Client said NO — recovery offered`);
        return { handled: true, action: 'no_recovery_offered' };
      }

      // Unrecognized reply to the check-in
      await SMSService.sendSMS(followUp.client_phone,
        "Sorry, I didn't understand that. Did the provider reach out to you?\nReply YES or NO."
      );
      return { handled: true, action: 'unrecognized_resend' };
    }

    // Step 2: Client replies to recovery offer ("would you like another provider?")
    if (followUp.status === 'RECOVERY_OFFERED') {
      if (isYes) {
        await pool.query(`
          UPDATE follow_ups SET status = 'RECOVERY_ACCEPTED', updated_at = NOW()
          WHERE id = $1
        `, [followUp.id]);

        // Trigger recovery: re-process the lead to find another provider
        try {
          await this._triggerRecovery(followUp);
        } catch (recoveryError) {
          console.error(`📞 FollowUp #${followUp.id}: Recovery failed:`, recoveryError.message);
          await SMSService.sendSMS(followUp.client_phone,
            "We're looking into available providers for you. Someone from our team will follow up shortly."
          );
        }

        console.log(`📞 FollowUp #${followUp.id}: Client accepted recovery ✅`);
        return { handled: true, action: 'recovery_accepted' };
      }

      if (isNo) {
        await pool.query(`
          UPDATE follow_ups SET status = 'COMPLETED', updated_at = NOW()
          WHERE id = $1
        `, [followUp.id]);

        await SMSService.sendSMS(followUp.client_phone,
          "No problem. If you change your mind, feel free to submit a new request at goldtouchlist.com. Thank you!"
        );

        console.log(`📞 FollowUp #${followUp.id}: Client declined recovery`);
        return { handled: true, action: 'recovery_declined' };
      }

      // Unrecognized reply to recovery offer
      await SMSService.sendSMS(followUp.client_phone,
        "Would you like us to connect you with another provider?\nReply YES or NO."
      );
      return { handled: true, action: 'unrecognized_recovery_resend' };
    }

    return { handled: false };
  }

  /**
   * Trigger recovery: find another provider for the client's lead.
   */
  static async _triggerRecovery(followUp) {
    const SMSService = require('./SMSService');
    const Lead = require('../models/Lead');
    const Provider = require('../models/Provider');
    const LeadProcessor = require('./LeadProcessor');

    const lead = await Lead.findById(followUp.lead_id);
    if (!lead) {
      await SMSService.sendSMS(followUp.client_phone,
        "We're sorry, this request has expired. Please submit a new request at goldtouchlist.com."
      );
      return;
    }

    // Find providers who haven't already been assigned this lead
    const allProviders = await Provider.findMatchingProviders(lead);
    const existingUnlocks = await pool.query(
      'SELECT provider_id FROM unlocks WHERE lead_id = $1',
      [followUp.lead_id]
    );
    const excludeIds = new Set(existingUnlocks.rows.map(r => r.provider_id));

    const availableProviders = allProviders.filter(p => {
      const pid = p.id || p.provider_id;
      return !excludeIds.has(pid) && !p.sms_opted_out;
    });

    if (availableProviders.length === 0) {
      await SMSService.sendSMS(followUp.client_phone,
        "We're currently looking for available providers in your area. We'll reach out as soon as someone is available. Thank you for your patience!"
      );
      return;
    }

    // Re-process the lead with remaining providers
    await SMSService.sendSMS(followUp.client_phone,
      "We're connecting you with another available provider now. You should hear from them soon!"
    );

    // Send teasers to the next available providers
    try {
      await LeadProcessor.processLead(lead, availableProviders);
      console.log(`📞 FollowUp Recovery: Re-sent lead ${followUp.lead_id} to ${availableProviders.length} new providers`);
    } catch (err) {
      console.error('📞 FollowUp Recovery: Error re-processing lead:', err.message);
    }
  }

  /**
   * Schedule a reminder SMS to the provider if they don't unlock the lead.
   * Called after a teaser is sent.
   */
  static async scheduleProviderReminder({ leadId, providerId, providerPhone, providerName }) {
    if (!providerPhone) {
      console.log('📞 FollowUp: No provider phone, skipping reminder');
      return null;
    }

    // Check if a reminder already exists for this lead+provider
    const existing = await pool.query(
      "SELECT id FROM follow_ups WHERE lead_id = $1 AND provider_id = $2 AND status = 'PROVIDER_REMINDER_SCHEDULED'",
      [leadId, providerId]
    );

    if (existing.rows.length > 0) {
      console.log(`📞 FollowUp: Provider reminder already scheduled for lead ${leadId} / provider ${providerId}`);
      return existing.rows[0];
    }

    const sendAfter = new Date(Date.now() + PROVIDER_REMINDER_DELAY_MINUTES * 60 * 1000);

    const result = await pool.query(`
      INSERT INTO follow_ups (lead_id, provider_id, client_phone, client_name, provider_name, status, send_after)
      VALUES ($1, $2, $3, $4, $5, 'PROVIDER_REMINDER_SCHEDULED', $6)
      RETURNING *
    `, [leadId, providerId, providerPhone, null, providerName || 'Provider', sendAfter]);

    console.log(`📞 FollowUp: Provider reminder scheduled for ${providerPhone} at ${sendAfter.toISOString()} (lead ${leadId})`);
    return result.rows[0];
  }

  /**
   * Process provider reminders that are due.
   * Sends a nudge if the unlock is still in TEASER_SENT or PAYMENT_LINK_SENT status.
   */
  static async processProviderReminders() {
    const SMSService = require('./SMSService');
    const Unlock = require('../models/Unlock');

    const due = await pool.query(`
      SELECT * FROM follow_ups
      WHERE status = 'PROVIDER_REMINDER_SCHEDULED' AND send_after <= NOW()
      ORDER BY send_after ASC
      LIMIT 10
    `);

    if (due.rows.length === 0) return;

    console.log(`📞 FollowUp: Processing ${due.rows.length} provider reminders`);

    for (const reminder of due.rows) {
      try {
        // Check if the provider has already unlocked this lead
        const unlock = await Unlock.findByLeadAndProvider(reminder.lead_id, reminder.provider_id);

        if (!unlock || unlock.status === 'PAID' || unlock.status === 'REVEALED') {
          // Already unlocked — no reminder needed
          await pool.query(`
            UPDATE follow_ups SET status = 'COMPLETED', updated_at = NOW()
            WHERE id = $1
          `, [reminder.id]);
          console.log(`📞 FollowUp: Provider already unlocked lead ${reminder.lead_id}, skipping reminder`);
          continue;
        }

        if (unlock.status === 'EXPIRED' || unlock.status === 'DECLINED') {
          // Provider declined or expired — no reminder
          await pool.query(`
            UPDATE follow_ups SET status = 'COMPLETED', updated_at = NOW()
            WHERE id = $1
          `, [reminder.id]);
          continue;
        }

        // Provider hasn't unlocked yet — send reminder
        await SMSService.sendSMS(reminder.client_phone,
          "Reminder: A customer is awaiting your contact. Don't miss this opportunity — unlock their details now!"
        );

        await pool.query(`
          UPDATE follow_ups SET status = 'PROVIDER_REMINDER_SENT', sent_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [reminder.id]);

        console.log(`📞 FollowUp: Sent provider reminder to ${reminder.client_phone} for lead ${reminder.lead_id}`);
      } catch (error) {
        console.error(`📞 FollowUp: Error sending provider reminder #${reminder.id}:`, error.message);
      }
    }
  }

  /**
   * Expire old follow-ups that never got a reply (after 24 hours).
   */
  static async expireStaleFollowUps() {
    const result = await pool.query(`
      UPDATE follow_ups
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE status IN ('SENT', 'RECOVERY_OFFERED')
      AND sent_at < NOW() - INTERVAL '24 hours'
      RETURNING id
    `);

    if (result.rows.length > 0) {
      console.log(`📞 FollowUp: Expired ${result.rows.length} stale follow-ups`);
    }
  }
}

module.exports = FollowUpService;
