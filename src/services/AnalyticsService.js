const pool = require('../config/database');

class AnalyticsService {

  /**
   * Get daily lead counts for the last N days
   */
  static async getDailyLeads(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as leads_count,
        COUNT(DISTINCT client_phone) as unique_customers
      FROM leads 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    return result.rows;
  }

  /**
   * Get city-wise stats: leads today and unlock rates
   */
  static async getCityStats() {
    const result = await pool.query(`
      SELECT 
        l.city,
        COUNT(DISTINCT l.lead_id) as leads_today,
        COUNT(DISTINCT u.lead_id) as unlocks_today,
        COUNT(DISTINCT u.lead_id) as paid_today,
        ROUND(
          COUNT(DISTINCT u.lead_id) * 100.0 / 
          NULLIF(COUNT(DISTINCT l.lead_id), 0), 2
        ) as unlock_rate_percent,
        ROUND(
          COUNT(DISTINCT CASE WHEN u.status = 'REVEALED' THEN u.lead_id END) * 100.0 / 
          NULLIF(COUNT(DISTINCT l.lead_id), 0), 2
        ) as paid_rate_percent
      FROM leads l
      LEFT JOIN unlocks u ON l.lead_id = u.lead_id 
        AND DATE(u.created_at) = CURRENT_DATE
      WHERE DATE(l.created_at) = CURRENT_DATE
      GROUP BY l.city
      ORDER BY leads_today DESC, unlock_rate_percent DESC
    `);
    return result.rows;
  }

  /**
   * Get unlock statistics for the last N days
   */
  static async getUnlockStats(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as unlocks_created,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid_unlocks,
        COUNT(CASE WHEN status = 'REVEALED' THEN 1 END) as revealed_unlocks,
        COUNT(CASE WHEN status = 'TEASER_SENT' THEN 1 END) as teasers_sent,
        COUNT(CASE WHEN y_received_at IS NOT NULL THEN 1 END) as provider_responses
      FROM unlocks 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    return result.rows;
  }

  /**
   * Get response rates by provider
   */
  static async getProviderResponseRates(days = 30) {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.phone,
        COUNT(u.*) as total_teasers,
        COUNT(CASE WHEN u.y_received_at IS NOT NULL THEN 1 END) as responses,
        ROUND(
          COUNT(CASE WHEN u.y_received_at IS NOT NULL THEN 1 END) * 100.0 / 
          NULLIF(COUNT(u.*), 0), 2
        ) as response_rate_percent
      FROM providers p
      LEFT JOIN unlocks u ON p.id = u.provider_id 
        AND u.created_at >= CURRENT_DATE - INTERVAL '${days} days'
        AND u.status = 'TEASER_SENT'
      GROUP BY p.id, p.name, p.phone
      ORDER BY response_rate_percent DESC NULLS LAST
    `);
    return result.rows;
  }

  /**
   * Get revenue summary
   */
  static async getRevenueSummary(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE(paid_at) as date,
        COUNT(*) as paid_unlocks,
        COALESCE(SUM(price_cents), 0) as revenue_cents,
        COALESCE(SUM(price_cents), 0) / 100.0 as revenue_dollars
      FROM unlocks 
      WHERE paid_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(paid_at)
      ORDER BY date DESC
    `);
    return result.rows;
  }

  /**
   * Get top service types
   */
  static async getTopServiceTypes(days = 30) {
    const result = await pool.query(`
      SELECT 
        service_type,
        COUNT(*) as leads_count,
        COUNT(DISTINCT client_phone) as unique_customers
      FROM leads 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY service_type
      ORDER BY leads_count DESC
      LIMIT 10
    `);
    return result.rows;
  }

  /**
   * Get conversion funnel
   */
  static async getConversionFunnel(days = 30) {
    const result = await pool.query(`
      SELECT 
        'Leads Created' as stage,
        COUNT(*) as count
      FROM leads 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      
      UNION ALL
      
      SELECT 
        'Teasers Sent' as stage,
        COUNT(*) as count
      FROM unlocks 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
        AND status = 'TEASER_SENT'
      
      UNION ALL
      
      SELECT 
        'Provider Responded' as stage,
        COUNT(*) as count
      FROM unlocks 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
        AND y_received_at IS NOT NULL
      
      UNION ALL
      
      SELECT 
        'Paid' as stage,
        COUNT(*) as count
      FROM unlocks 
      WHERE paid_at >= CURRENT_DATE - INTERVAL '${days} days'
      
      UNION ALL
      
      SELECT 
        'Revealed' as stage,
        COUNT(*) as count
      FROM unlocks 
      WHERE revealed_at >= CURRENT_DATE - INTERVAL '${days} days'
    `);
    return result.rows;
  }

  /**
   * Get recent activity
   */
  static async getRecentActivity(limit = 50) {
    const result = await pool.query(`
      SELECT 
        'lead' as type,
        l.lead_id as id,
        l.client_name as title,
        l.city as subtitle,
        l.service_type as details,
        l.created_at as timestamp
      FROM leads l
      WHERE l.created_at >= CURRENT_DATE - INTERVAL '7 days'
      
      UNION ALL
      
      SELECT 
        'unlock' as type,
        CONCAT(u.lead_id, '-', u.provider_id) as id,
        p.name as title,
        u.status as subtitle,
        l.service_type as details,
        u.created_at as timestamp
      FROM unlocks u
      JOIN providers p ON u.provider_id = p.id
      JOIN leads l ON u.lead_id = l.lead_id
      WHERE u.created_at >= CURRENT_DATE - INTERVAL '7 days'
      
      ORDER BY timestamp DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  /**
   * Get summary stats for dashboard
   */
  static async getDashboardSummary() {
    const [leadsToday, paidUnlocksToday, revenueToday, totalRevenue, firstTimeFreeToday, providerContactsToday] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM leads WHERE DATE(created_at) = CURRENT_DATE'),
      pool.query('SELECT COUNT(*) as count FROM unlocks WHERE DATE(paid_at) = CURRENT_DATE'),
      pool.query('SELECT COALESCE(SUM(price_cents), 0) as cents FROM unlocks WHERE DATE(paid_at) = CURRENT_DATE'),
      pool.query('SELECT COALESCE(SUM(price_cents), 0) as cents FROM unlocks WHERE paid_at IS NOT NULL'),
      pool.query(`
        SELECT COUNT(DISTINCT u.provider_id) as count 
        FROM unlocks u 
        JOIN providers p ON u.provider_id = p.id 
        WHERE DATE(u.paid_at) = CURRENT_DATE 
        AND p.first_lead_used = false
      `),
      pool.query(`
        SELECT COUNT(*) as count 
        FROM provider_contact_followups 
        WHERE DATE(responded_at) = CURRENT_DATE 
        AND response_value = 1
      `)
    ]);

    return {
      leadsToday: parseInt(leadsToday.rows[0].count),
      paidUnlocksToday: parseInt(paidUnlocksToday.rows[0].count),
      revenueToday: parseInt(revenueToday.rows[0].cents) / 100,
      totalRevenue: parseInt(totalRevenue.rows[0].cents) / 100,
      firstTimeFreeToday: parseInt(firstTimeFreeToday.rows[0].count),
      providerContactsToday: parseInt(providerContactsToday.rows[0].count)
    };
  }

  /**
   * Get provider contact follow-up stats
   */
  static async getProviderContactStats(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as followups_sent,
        COUNT(CASE WHEN responded_at IS NOT NULL THEN 1 END) as responses_received,
        COUNT(CASE WHEN response_value = 1 THEN 1 END) as contacts_made,
        COUNT(CASE WHEN response_value = 2 THEN 1 END) as not_yet_contacted,
        ROUND(
          COUNT(CASE WHEN responded_at IS NOT NULL THEN 1 END) * 100.0 / 
          NULLIF(COUNT(*), 0), 2
        ) as response_rate_percent,
        ROUND(
          COUNT(CASE WHEN response_value = 1 THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN responded_at IS NOT NULL THEN 1 END), 0), 2
        ) as contact_success_rate_percent
      FROM provider_contact_followups 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    return result.rows;
  }

  /**
   * Get first-time free provider stats
   */
  static async getFirstTimeFreeStats(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE(u.paid_at) as date,
        COUNT(DISTINCT u.provider_id) as first_time_providers,
        COUNT(*) as first_time_unlocks,
        COALESCE(SUM(u.price_cents), 0) as revenue_cents,
        p.name as provider_name,
        p.phone as provider_phone
      FROM unlocks u
      JOIN providers p ON u.provider_id = p.id
      WHERE u.paid_at >= CURRENT_DATE - INTERVAL '${days} days'
      AND p.first_lead_used = false
      GROUP BY DATE(u.paid_at), p.provider_id, p.name, p.phone
      ORDER BY date DESC, first_time_unlocks DESC
    `);
    return result.rows;
  }

  /**
   * Get client funnel metrics for the week
   */
  static async getClientFunnelWeek() {
    const result = await pool.query(`
      WITH client_timeline AS (
        SELECT 
          l.lead_id,
          l.city,
          l.created_at as client_created_time,
          MIN(u.teaser_sent_at) as provider_notified_time,
          MIN(u.paid_at) as unlock_time,
          MIN(u.revealed_at) as phone_viewed_time,
          MIN(f.replied_at) as client_replied_time,
          MIN(CASE WHEN f.response = 'YES_REPLIED' THEN f.replied_at END) as booking_confirmed_time
        FROM leads l
        LEFT JOIN unlocks u ON l.lead_id = u.lead_id
        LEFT JOIN follow_ups f ON l.lead_id = f.lead_id
        WHERE l.created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY l.lead_id, l.city, l.created_at
      )
      SELECT 
        COUNT(*) as total_leads,
        COUNT(provider_notified_time) as sent_to_providers,
        COUNT(unlock_time) as unlocked,
        COUNT(phone_viewed_time) as phone_viewed,
        COUNT(client_replied_time) as client_responded,
        COUNT(booking_confirmed_time) as booked,
        ROUND(
          COUNT(unlock_time) * 100.0 / NULLIF(COUNT(provider_notified_time), 0), 2
        ) as unlock_rate_percent,
        ROUND(
          COUNT(phone_viewed_time) * 100.0 / NULLIF(COUNT(unlock_time), 0), 2
        ) as phone_view_rate_percent,
        ROUND(
          COUNT(client_replied_time) * 100.0 / NULLIF(COUNT(phone_viewed_time), 0), 2
        ) as client_response_rate_percent,
        ROUND(
          COUNT(booking_confirmed_time) * 100.0 / NULLIF(COUNT(client_replied_time), 0), 2
        ) as booking_rate_percent,
        ROUND(AVG(
          CASE 
            WHEN unlock_time IS NOT NULL AND provider_notified_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (unlock_time - provider_notified_time)) / 60 
          END
        ), 2) as avg_time_to_unlock_minutes,
        ROUND(AVG(
          CASE 
            WHEN phone_viewed_time IS NOT NULL AND unlock_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (phone_viewed_time - unlock_time)) / 60 
          END
        ), 2) as avg_time_to_phone_view_minutes,
        ROUND(AVG(
          CASE 
            WHEN client_replied_time IS NOT NULL AND phone_viewed_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (client_replied_time - phone_viewed_time)) / 60 
          END
        ), 2) as avg_time_to_client_reply_minutes
      FROM client_timeline
    `);
    return result.rows[0];
  }

  /**
   * Get detailed client timeline table
   */
  static async getClientTimelineTable(days = 7) {
    const result = await pool.query(`
      WITH client_timeline AS (
        SELECT 
          l.lead_id,
          l.city,
          l.created_at as client_created_time,
          MIN(u.teaser_sent_at) as provider_notified_time,
          MIN(u.paid_at) as unlock_time,
          MIN(u.revealed_at) as phone_viewed_time,
          MIN(f.replied_at) as client_replied_time,
          MIN(CASE WHEN f.response = 'YES_REPLIED' THEN f.replied_at END) as booking_confirmed_time,
          p.name as provider_name,
          p.phone as provider_phone
        FROM leads l
        LEFT JOIN unlocks u ON l.lead_id = u.lead_id
        LEFT JOIN follow_ups f ON l.lead_id = f.lead_id
        LEFT JOIN providers p ON u.provider_id = p.id
        WHERE l.created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY l.lead_id, l.city, l.created_at, p.name, p.phone
      )
      SELECT 
        lead_id,
        city,
        client_created_time,
        provider_notified_time,
        unlock_time,
        phone_viewed_time,
        client_replied_time,
        booking_confirmed_time,
        provider_name,
        provider_phone,
        CASE 
          WHEN unlock_time IS NOT NULL AND provider_notified_time IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (unlock_time - provider_notified_time)) / 60 
          ELSE NULL 
        END as time_to_unlock_minutes,
        CASE 
          WHEN phone_viewed_time IS NOT NULL AND unlock_time IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (phone_viewed_time - unlock_time)) / 60 
          ELSE NULL 
        END as time_to_phone_view_minutes,
        CASE 
          WHEN client_replied_time IS NOT NULL AND phone_viewed_time IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (client_replied_time - phone_viewed_time)) / 60 
          ELSE NULL 
        END as time_to_client_reply_minutes
      FROM client_timeline
      ORDER BY 
        CASE WHEN unlock_time IS NULL THEN 1 ELSE 0 END,
        time_to_unlock_minutes DESC NULLS LAST,
        client_created_time DESC
    `);
    return result.rows;
  }

  /**
   * Get unlock time distribution
   */
  static async getUnlockTimeDistribution(days = 7) {
    const result = await pool.query(`
      WITH unlock_times AS (
        SELECT 
          EXTRACT(EPOCH FROM (u.paid_at - u.teaser_sent_at)) / 60 as time_to_unlock_minutes
        FROM unlocks u
        WHERE u.paid_at >= CURRENT_DATE - INTERVAL '${days} days'
        AND u.teaser_sent_at IS NOT NULL
      )
      SELECT 
        COUNT(CASE WHEN time_to_unlock_minutes <= 5 THEN 1 END) as within_5_min,
        COUNT(CASE WHEN time_to_unlock_minutes > 5 AND time_to_unlock_minutes <= 15 THEN 1 END) as within_15_min,
        COUNT(CASE WHEN time_to_unlock_minutes > 15 AND time_to_unlock_minutes <= 60 THEN 1 END) as within_60_min,
        COUNT(CASE WHEN time_to_unlock_minutes > 60 THEN 1 END) as over_1_hour,
        COUNT(*) as total_unlocks,
        ROUND(
          COUNT(CASE WHEN time_to_unlock_minutes <= 5 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2
        ) as within_5_min_percent,
        ROUND(
          COUNT(CASE WHEN time_to_unlock_minutes > 5 AND time_to_unlock_minutes <= 15 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2
        ) as within_15_min_percent,
        ROUND(
          COUNT(CASE WHEN time_to_unlock_minutes > 15 AND time_to_unlock_minutes <= 60 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2
        ) as within_60_min_percent,
        ROUND(
          COUNT(CASE WHEN time_to_unlock_minutes > 60 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2
        ) as over_1_hour_percent
      FROM unlock_times
    `);
    return result.rows[0];
  }
}

module.exports = AnalyticsService;
