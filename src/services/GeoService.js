const https = require('https');

class GeoService {
  static cache = new Map();

  static async geocode(query) {
    if (!query || !query.toString().trim()) return null;
    const key = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!key) {
      console.warn('GeoService: GOOGLE_GEOCODING_API_KEY not set, skipping geocode');
      return null;
    }

    const q = query.toString().trim();
    const cacheKey = `gc:${q.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (data && data.status === 'OK' && data.results && data.results[0]) {
      const loc = data.results[0].geometry.location;
      const result = { lat: loc.lat, lng: loc.lng };
      this.cache.set(cacheKey, result);
      return result;
    }

    console.warn('GeoService: geocode failed for', q, 'status:', data && data.status);
    return null;
  }

  static haversineMiles(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static async checkDistance(providerLocationQuery, clientLocationQuery) {
    const [prov, cli] = await Promise.all([
      this.geocode(providerLocationQuery),
      this.geocode(clientLocationQuery)
    ]);

    if (!prov || !cli) {
      return { ok: false, reason: 'GEOCODE_FAILED', distanceMiles: null };
    }

    const distanceMiles = this.haversineMiles(prov.lat, prov.lng, cli.lat, cli.lng);
    return { ok: true, distanceMiles };
  }

  static async withinRadius(providerLocationQuery, clientLocationQuery, radiusMiles = 40) {
    const res = await this.checkDistance(providerLocationQuery, clientLocationQuery);
    if (!res.ok) return { allowed: true, distanceMiles: null }; // fail-open to avoid hard blocks
    return { allowed: res.distanceMiles <= radiusMiles, distanceMiles: res.distanceMiles };
  }
}

module.exports = GeoService;
