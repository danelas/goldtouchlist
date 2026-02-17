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
        lead_id as id,
        client_name as title,
        city as subtitle,
        service_type as details,
        created_at as timestamp
      FROM leads 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      
      UNION ALL
      
      SELECT 
        'unlock' as type,
        CONCAT(lead_id, '-', provider_id) as id,
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
    const [leadsToday, unlocksToday, revenueToday, totalRevenue] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM leads WHERE DATE(created_at) = CURRENT_DATE'),
      pool.query('SELECT COUNT(*) as count FROM unlocks WHERE DATE(created_at) = CURRENT_DATE'),
      pool.query('SELECT COALESCE(SUM(price_cents), 0) as cents FROM unlocks WHERE DATE(paid_at) = CURRENT_DATE'),
      pool.query('SELECT COALESCE(SUM(price_cents), 0) as cents FROM unlocks WHERE paid_at IS NOT NULL')
    ]);

    return {
      leadsToday: parseInt(leadsToday.rows[0].count),
      unlocksToday: parseInt(unlocksToday.rows[0].count),
      revenueToday: parseInt(revenueToday.rows[0].cents) / 100,
      totalRevenue: parseInt(totalRevenue.rows[0].cents) / 100
    };
  }
}

module.exports = AnalyticsService;
