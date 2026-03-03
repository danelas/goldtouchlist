const express = require('express');
const router = express.Router();
const GeoService = require('../services/GeoService');

// GET /geo/check-distance?cityzip=...&provider_location=...&radius=40
// or /geo/check-distance?cityzip=...&listing_city=...&listing_location=...
router.get('/check-distance', async (req, res) => {
  try {
    const { cityzip, provider_location, listing_city, listing_location } = req.query;
    const radius = parseFloat(req.query.radius) || 40;

    if (!cityzip || !cityzip.toString().trim()) {
      return res.status(400).json({ success: false, error: 'MISSING_CLIENT_LOCATION', message: 'cityzip is required' });
    }

    let providerQuery = null;
    if (provider_location && provider_location.toString().trim()) {
      providerQuery = provider_location.toString().trim();
    } else if (listing_city || listing_location) {
      const parts = [];
      if (listing_city && listing_city.toString().trim()) parts.push(listing_city.toString().trim());
      if (listing_location && listing_location.toString().trim()) parts.push(listing_location.toString().trim());
      providerQuery = parts.join(', ');
    }

    if (!providerQuery) {
      return res.status(400).json({ success: false, error: 'MISSING_PROVIDER_LOCATION', message: 'Provide provider_location or listing_city/listing_location' });
    }

    const result = await GeoService.withinRadius(providerQuery, cityzip, radius);

    return res.json({
      success: true,
      allowed: result.allowed,
      distance_miles: result.distanceMiles,
      radius_miles: radius,
      provider_query: providerQuery,
      client_query: cityzip
    });
  } catch (error) {
    console.error('Geo check error:', error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error.message });
  }
});

module.exports = router;
