// ค่าสัมประสิทธิ์การปล่อยก๊าซเรือนกระจก (Emission Factor) ตามมาตรฐาน TGO
const EMISSION_FACTORS = {
  ELECTRICITY: 0.0004999, // tCO2e ต่อ kWh
  DIESEL: 0.002708,        // tCO2e ต่อ ลิตร
  GASOLINE: 0.002189,      // tCO2e ต่อ ลิตร
  WATER: 0.000207          // tCO2e ต่อ ลูกบาศก์เมตร
};

function calculateCarbonEquivalent(activityType, amount) {
  const typeKey = activityType.toUpperCase();
  const factor = EMISSION_FACTORS[typeKey] || 0.0005;
  return parseFloat((amount * factor).toFixed(4));
}

module.exports = { calculateCarbonEquivalent };