const pool = require('../config/database');

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => handler(req, res).catch(next);
}

function parseYear(value) {
  if (!/^[0-9]{4}$/.test(String(value)) || Number(value) < 1900 || Number(value) > 9998) {
    throw new ApiError(400, 'ระบุปี ค.ศ. ระหว่าง 1900 ถึง 9998');
  }
  return Number(value);
}

function decimal(value, precision, scale, allowZero = false) {
  const number = String(value ?? '').trim();
  const pattern = new RegExp('^[0-9]{1,' + (precision - scale) + '}(\\.[0-9]{1,' + scale + '})?$');
  if ((typeof value !== 'number' && typeof value !== 'string') || !pattern.test(number)
      || (!allowZero && Number(number) === 0)) {
    throw new ApiError(400, 'จำนวนหรือราคาไม่ถูกต้อง กรุณาตรวจสอบค่าและจำนวนหลักทศนิยม');
  }
  return number;
}

// Serialize writes in each period so verification, listings and transfers see consistent balances.
async function inRound(year, allowedStatus, action) {
  const allowedStatuses = Array.isArray(allowedStatus) ? allowedStatus : [allowedStatus];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const round = await client.query('SELECT status FROM ets_rounds WHERE year = $1 FOR UPDATE', [year]);
    if (!round.rowCount) throw new ApiError(404, 'ไม่พบรอบปีนี้');
    const { status } = round.rows[0];
    if (!allowedStatuses.includes(status)) throw new ApiError(409, 'สถานะรอบปีไม่อนุญาตให้ทำรายการนี้');

    const result = await action(client, status);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function requireAllocation(client, year, companyId) {
  const allocation = await client.query(
    'SELECT 1 FROM ets_allocations WHERE year = $1 AND company_id = $2',
    [year, companyId]
  );
  if (!allocation.rowCount) throw new ApiError(403, 'บริษัทนี้ยังไม่ได้รับการจัดสรรสิทธิสำหรับรอบปีนี้');
}

async function cancelListingsBeyondBalance(client, year, companyId) {
  // Keep reservations in creation order and release newer listings that no longer fit.
  const { rowCount } = await client.query(`
    WITH reservations AS (
      SELECT id, SUM(remaining_tco2e) OVER (ORDER BY created_at, id) AS running_reserved
      FROM ets_listings
      WHERE year = $1 AND seller_company_id = $2 AND status = 'Open'
    )
    UPDATE ets_listings AS listing
    SET status = 'Cancelled'
    FROM reservations, ets_company_balances AS balance
    WHERE listing.id = reservations.id AND balance.year = $1 AND balance.company_id = $2
      AND reservations.running_reserved > GREATEST(balance.balance_tco2e, 0)
  `, [year, companyId]);
  return rowCount;
}

module.exports = { ApiError, asyncRoute, parseYear, decimal, inRound, requireAllocation, cancelListingsBeyondBalance };
