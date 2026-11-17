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
  // Amounts have two decimal places and demo factors have up to seven.
  // Integer arithmetic keeps midpoint rounding consistent with the decimal values.
  const amountHundredths = BigInt(Math.round(Number(amount) * 100));
  const factorTenMillionths = BigInt(Math.round(factor * 10_000_000));
  const roundedTenThousandths = (amountHundredths * factorTenMillionths + 50_000n) / 100_000n;
  return Number(roundedTenThousandths) / 10_000;
}

const carbonCalculator = { calculateCarbonEquivalent, isSupportedActivity, EMISSION_FACTORS };

if (typeof module !== 'undefined') module.exports = carbonCalculator;
