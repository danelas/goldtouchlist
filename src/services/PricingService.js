class PricingService {
  static SERVICE_PRICES_CENTS = {
    skincare: 1800,
    makeup: 1200,
    esthetics: 1200,
    cleaning: 1000,
    bodywork: 1500,
    beauty: 1200,
    massage: 1500,
  };

  static getPriceCentsForServiceType(serviceType) {
    if (!serviceType) return this.getDefaultPriceCents();
    const key = serviceType.toString().trim().toLowerCase();
    return this.SERVICE_PRICES_CENTS[key] ?? this.getDefaultPriceCents();
  }

  static getDefaultPriceCents() {
    return 2000; // $20
  }

  static formatPriceFromCents(cents) {
    const value = (cents ?? this.getDefaultPriceCents()) / 100;
    return `$${value.toFixed(2)}`;
  }
}

module.exports = PricingService;
