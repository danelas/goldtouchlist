const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Provider performance analytics
router.get('/providers', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.name,
        p.phone,
        COUNT(u.unlock_id) as total_teasers_sent,
        COUNT(CASE WHEN u.status = 'PAYMENT_LINK_SENT' OR u.status = 'REVEALED' THEN 1 END) as accepted_count,
        COUNT(CASE WHEN u.status = 'REVEALED' THEN 1 END) as paid_count,
        COUNT(CASE WHEN u.status = 'EXPIRED' THEN 1 END) as declined_count,
        ROUND(
          (COUNT(CASE WHEN u.status = 'PAYMENT_LINK_SENT' OR u.status = 'REVEALED' THEN 1 END)::decimal / 
           NULLIF(COUNT(u.unlock_id), 0)) * 100, 2
        ) as acceptance_rate,
        ROUND(
          (COUNT(CASE WHEN u.status = 'REVEALED' THEN 1 END)::decimal / 
           NULLIF(COUNT(CASE WHEN u.status = 'PAYMENT_LINK_SENT' OR u.status = 'REVEALED' THEN 1 END), 0)) * 100, 2
        ) as payment_rate,
        MAX(u.created_at) as last_teaser_sent,
        SUM(CASE WHEN u.status = 'REVEALED' THEN 20 ELSE 0 END) as total_revenue
      FROM providers p
      LEFT JOIN unlocks u ON p.id = u.provider_id
      GROUP BY p.id, p.name, p.phone
      ORDER BY accepted_count DESC, total_teasers_sent DESC
    `;

    const result = await pool.query(query);
    
    const analytics = result.rows.map(row => ({
      ...row,
      acceptance_rate: parseFloat(row.acceptance_rate) || 0,
      payment_rate: parseFloat(row.payment_rate) || 0,
      total_revenue: parseInt(row.total_revenue) || 0
    }));

    res.json({
      success: true,
      analytics,
      summary: {
        total_providers: analytics.length,
        active_providers: analytics.filter(p => p.total_teasers_sent > 0).length,
        top_performer: analytics[0]?.name || 'None',
        total_system_revenue: analytics.reduce((sum, p) => sum + p.total_revenue, 0)
      }
    });

  } catch (error) {
    console.error('Error getting provider analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get provider analytics'
    });
  }
});

// Daily provider signups
router.get('/dashboard/daily-providers', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const AnalyticsService = require('../services/AnalyticsService');
    const dailyProviders = await AnalyticsService.getDailyProviders(days);
    res.json({ success: true, dailyProviders });
  } catch (error) {
    console.error('Error getting daily providers:', error);
    res.status(500).json({ success: false, error: 'Failed to get daily providers' });
  }
});

// Recent activity analytics
router.get('/recent-activity', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    
    const query = `
      SELECT 
        DATE(u.created_at) as date,
        COUNT(*) as teasers_sent,
        COUNT(CASE WHEN u.status = 'PAYMENT_LINK_SENT' OR u.status = 'REVEALED' THEN 1 END) as accepted,
        COUNT(CASE WHEN u.status = 'REVEALED' THEN 1 END) as paid,
        SUM(CASE WHEN u.status = 'REVEALED' THEN 20 ELSE 0 END) as daily_revenue
      FROM unlocks u
      WHERE u.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(u.created_at)
      ORDER BY date DESC
    `;

    const result = await pool.query(query);
    
    res.json({
      success: true,
      activity: result.rows.map(row => ({
        ...row,
        daily_revenue: parseInt(row.daily_revenue) || 0
      })),
      period: `Last ${days} days`
    });

  } catch (error) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent activity'
    });
  }
});

// Lead conversion funnel
router.get('/conversion-funnel', async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_leads_created,
        COUNT(CASE WHEN u.unlock_id IS NOT NULL THEN 1 END) as leads_with_teasers,
        COUNT(CASE WHEN u.status = 'PAYMENT_LINK_SENT' OR u.status = 'REVEALED' THEN 1 END) as leads_accepted,
        COUNT(CASE WHEN u.status = 'REVEALED' THEN 1 END) as leads_paid
      FROM leads l
      LEFT JOIN unlocks u ON l.lead_id = u.lead_id
    `;

    const result = await pool.query(query);
    const data = result.rows[0];

    const funnel = {
      total_leads: parseInt(data.total_leads_created),
      sent_to_providers: parseInt(data.leads_with_teasers),
      accepted_by_providers: parseInt(data.leads_accepted),
      paid_and_unlocked: parseInt(data.leads_paid),
      conversion_rates: {
        lead_to_teaser: data.total_leads_created > 0 ? 
          Math.round((data.leads_with_teasers / data.total_leads_created) * 100) : 0,
        teaser_to_acceptance: data.leads_with_teasers > 0 ? 
          Math.round((data.leads_accepted / data.leads_with_teasers) * 100) : 0,
        acceptance_to_payment: data.leads_accepted > 0 ? 
          Math.round((data.leads_paid / data.leads_accepted) * 100) : 0
      }
    };

    res.json({
      success: true,
      funnel
    });

  } catch (error) {
    console.error('Error getting conversion funnel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversion funnel'
    });
  }
});

// Scheduled leads status
router.get('/scheduled-leads', async (req, res) => {
  try {
    const LeadScheduler = require('../services/LeadScheduler');
    
    // Get scheduled leads status
    const status = await LeadScheduler.getScheduledLeadsStatus();
    
    // Get detailed pending leads
    const pendingLeads = await pool.query(`
      SELECT 
        sl.*,
        p.name as provider_name,
        l.client_name,
        l.service_type,
        l.city
      FROM scheduled_leads sl
      JOIN providers p ON sl.provider_id = p.id
      JOIN leads l ON sl.lead_id = l.lead_id
      WHERE sl.status = 'pending'
      ORDER BY sl.scheduled_for ASC
      LIMIT 20
    `);
    
    res.json({
      success: true,
      status_summary: status,
      pending_leads: pendingLeads.rows,
      business_hours_info: {
        current_time: new Date(),
        is_business_hours: LeadScheduler.isBusinessHours(),
        next_business_hour: LeadScheduler.getNextBusinessHour()
      }
    });

  } catch (error) {
    console.error('Error getting scheduled leads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduled leads'
    });
  }
});

// City stats (leads today and unlock rates)
router.get('/dashboard/cities', async (req, res) => {
  try {
    const AnalyticsService = require('../services/AnalyticsService');
    const cityStats = await AnalyticsService.getCityStats();
    
    res.json({
      success: true,
      cityStats
    });
  } catch (error) {
    console.error('Error getting city stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get city stats'
    });
  }
});

// Dashboard summary
router.get('/dashboard/summary', async (req, res) => {
  try {
    const AnalyticsService = require('../services/AnalyticsService');
    const summary = await AnalyticsService.getDashboardSummary();
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard summary'
    });
  }
});

// Daily leads
router.get('/dashboard/daily-leads', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const AnalyticsService = require('../services/AnalyticsService');
    const dailyLeads = await AnalyticsService.getDailyLeads(days);
    
    res.json({
      success: true,
      dailyLeads
    });
  } catch (error) {
    console.error('Error getting daily leads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get daily leads'
    });
  }
});

// Provider response rates
router.get('/dashboard/provider-responses', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const AnalyticsService = require('../services/AnalyticsService');
    const responseRates = await AnalyticsService.getProviderResponseRates(days);
    
    res.json({
      success: true,
      responseRates
    });
  } catch (error) {
    console.error('Error getting provider response rates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get provider response rates'
    });
  }
});

// Revenue summary
router.get('/dashboard/revenue', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const AnalyticsService = require('../services/AnalyticsService');
    const revenue = await AnalyticsService.getRevenueSummary(days);
    
    res.json({
      success: true,
      revenue
    });
  } catch (error) {
    console.error('Error getting revenue summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue summary'
    });
  }
});

// Top service types
router.get('/dashboard/service-types', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const AnalyticsService = require('../services/AnalyticsService');
    const serviceTypes = await AnalyticsService.getTopServiceTypes(days);
    
    res.json({
      success: true,
      serviceTypes
    });
  } catch (error) {
    console.error('Error getting top service types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get top service types'
    });
  }
});

// Conversion funnel
router.get('/dashboard/funnel', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const AnalyticsService = require('../services/AnalyticsService');
    const funnel = await AnalyticsService.getConversionFunnel(days);
    
    res.json({
      success: true,
      funnel
    });
  } catch (error) {
    console.error('Error getting conversion funnel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversion funnel'
    });
  }
});

// Recent activity
router.get('/dashboard/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const AnalyticsService = require('../services/AnalyticsService');
    const activity = await AnalyticsService.getRecentActivity(limit);
    
    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent activity'
    });
  }
});

// Provider contact follow-up stats
router.get('/dashboard/provider-contacts', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await AnalyticsService.getProviderContactStats(days);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting provider contact stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get provider contact stats'
    });
  }
});

// First-time free provider stats
router.get('/dashboard/first-time-free', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await AnalyticsService.getFirstTimeFreeStats(days);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting first-time free stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get first-time free stats'
    });
  }
});

// Client funnel metrics for the week
router.get('/dashboard/client-funnel', async (req, res) => {
  try {
    const funnel = await AnalyticsService.getClientFunnelWeek();
    res.json({
      success: true,
      data: funnel
    });
  } catch (error) {
    console.error('Error getting client funnel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get client funnel'
    });
  }
});

// Client timeline table
router.get('/dashboard/client-timeline', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const timeline = await AnalyticsService.getClientTimelineTable(days);
    res.json({
      success: true,
      data: timeline
    });
  } catch (error) {
    console.error('Error getting client timeline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get client timeline'
    });
  }
});

// Unlock time distribution
router.get('/dashboard/unlock-distribution', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const distribution = await AnalyticsService.getUnlockTimeDistribution(days);
    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('Error getting unlock distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unlock distribution'
    });
  }
});

module.exports = router;
