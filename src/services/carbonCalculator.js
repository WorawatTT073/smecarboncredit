// Demo emission factors. Verify the exact TGO source/year before academic submission.
const EMISSION_FACTORS = {
  ELECTRICITY: 0.0004999,
  DIESEL: 0.002708,
  GASOLINE: 0.002189,
  WATER: 0.000207
};

function isSupportedActivity(activityType) {
  return typeof activityType === 'string' && Object.prototype.hasOwnProperty.call(EMISSION_FACTORS, activityType.toUpperCase());
}

function calculateCarbonEquivalent(activityType, amount) {
  if (!isSupportedActivity(activityType)) throw new Error('Unsupported activity type');
  const factor = EMISSION_FACTORS[activityType.toUpperCase()];
  return Number((Number(amount) * factor).toFixed(4));
}

module.exports = { calculateCarbonEquivalent, isSupportedActivity, EMISSION_FACTORS };
