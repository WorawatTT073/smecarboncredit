const express = require('express');
const pool = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { ApiError, asyncRoute, parseYear, decimal, inRound, cancelListingsBeyondBalance } = require('../services/ets');

const router = express.Router();
const requireAdmin = requireRole('Admin');

const listRounds = asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT year, status FROM ets_rounds ORDER BY year DESC');
  res.json({ data: rows });
});

router.get('/public/rounds', listRounds);
router.get('/:year/emissions', asyncRoute(async (req, res) => {
  const year = parseYear(req.params.year);
  const { rows: [summary] } = await pool.query(`
    SELECT r.year, r.status,
           ARRAY(
             SELECT jsonb_build_object(
               'company_name', c.name,
               'industry_type', c.industry_type,
               'emitted_tco2e', totals.emitted_tco2e
             )
             FROM ets_allocations a
             JOIN companies c ON c.id = a.company_id
             CROSS JOIN LATERAL (
               SELECT SUM(e.carbon_ton_equivalent) AS emitted_tco2e
               FROM emission_records e
               WHERE e.company_id = a.company_id
                 AND e.record_date >= make_date(r.year, 1, 1)
                 AND e.record_date < make_date(r.year + 1, 1, 1)
             ) totals
             WHERE a.year = r.year
             ORDER BY totals.emitted_tco2e DESC NULLS LAST, c.name, c.id
           ) AS companies
    FROM ets_rounds r WHERE r.year = $1
  `, [year]);
  if (!summary) throw new ApiError(404, 'ไม่พบรอบปีนี้');
  res.json({ data: summary });
}));

router.use(requireAuth);
router.get('/', listRounds);

router.get('/:year/adjustments', requireRole('Admin'), asyncRoute(async (req, res) => {
  const year = parseYear(req.params.year);
  const { rows } = await pool.query(`
    SELECT a.id, a.year, c.name AS company_name, a.before_tco2e, a.after_tco2e,
           a.action, a.reason, a.actor_name, a.actor_email, a.created_at
    FROM credit_adjustments a JOIN companies c ON c.id = a.company_id
    WHERE a.year = $1 ORDER BY a.created_at DESC, a.id DESC
  `, [year]);
  res.json({ data: rows });
}));

router.get('/:year', requireRole('Admin', 'Company'), asyncRoute(async (req, res) => {
  const year = parseYear(req.params.year);
  const { rows } = await pool.query(`
    SELECT r.*,
           ARRAY(
             SELECT to_jsonb(c) FROM companies c
             WHERE $2::uuid IS NULL OR c.id = $2
             ORDER BY c.name
           ) AS companies,
           ARRAY(
             SELECT to_jsonb(b) FROM ets_company_balances b
             WHERE b.year = r.year AND ($2::uuid IS NULL OR b.company_id = $2)
             ORDER BY b.company_name
           ) AS balances,
           ARRAY(
             SELECT to_jsonb(l) FROM ets_listings l
             WHERE l.year = r.year AND ($2::uuid IS NULL OR l.seller_company_id = $2)
             ORDER BY l.created_at DESC, l.id DESC
           ) AS listings,
           ARRAY(
             SELECT to_jsonb(t) || jsonb_build_object('seller_name', s.name, 'buyer_name', b.name)
             FROM credit_transactions t
             JOIN companies s ON s.id = t.seller_company_id
             JOIN companies b ON b.id = t.buyer_company_id
             WHERE t.ets_year = r.year AND ($2::uuid IS NULL OR $2 IN (t.seller_company_id, t.buyer_company_id))
             ORDER BY t.created_at DESC, t.id DESC
           ) AS trades
    FROM ets_rounds r WHERE r.year = $1
  `, [year, req.user.company_id]);
  if (!rows.length) throw new ApiError(404, 'ไม่พบรอบปีนี้');
  res.json({ data: rows[0] });
}));

router.post('/', requireAdmin, asyncRoute(async (req, res) => {
  const year = parseYear(req.body.year);
  const provided = req.body.allocations;
  let allocations;
  if (provided !== undefined) {
    if (!Array.isArray(provided) || provided.length === 0 || provided.length > 10000) {
      throw new ApiError(400, 'กรุณากำหนดสิทธิให้แต่ละบริษัท');
    }
    allocations = provided.map(item => {
      if (!item || typeof item.company_id !== 'string'
          || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.company_id)) {
        throw new ApiError(400, 'ข้อมูลบริษัทไม่ถูกต้อง');
      }
      return {
        company_id: item.company_id.toLowerCase(),
        amount_tco2e: decimal(item.amount_tco2e, 12, 4, true)
      };
    });
    if (new Set(allocations.map(item => item.company_id)).size !== allocations.length) {
      throw new ApiError(400, 'มีบริษัทซ้ำในรายการจัดสรรสิทธิ');
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (allocations) {
      await client.query('LOCK TABLE companies IN SHARE MODE');
      const { rows: companies } = await client.query('SELECT id FROM companies');
      const ids = new Set(companies.map(company => company.id));
      if (ids.size !== allocations.length || allocations.some(item => !ids.has(item.company_id))) {
        throw new ApiError(400, 'กรุณากำหนดสิทธิให้ครบทุกบริษัท แล้วลองสร้างรอบใหม่');
      }
    }
    const { rows: [round] } = await client.query(
      'INSERT INTO ets_rounds (year) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *', [year]
    );
    if (!round) throw new ApiError(409, 'มีรอบปีนี้แล้ว');
    if (allocations) {
      await client.query(`
        INSERT INTO ets_allocations (year, company_id, amount_tco2e)
        SELECT $1, entry.company_id, entry.amount_tco2e
        FROM jsonb_to_recordset($2::jsonb) AS entry(company_id uuid, amount_tco2e numeric)
      `, [year, JSON.stringify(allocations)]);
      await client.query(`
        INSERT INTO credit_adjustments
          (year, company_id, before_tco2e, after_tco2e, action, reason, changed_by, actor_name, actor_email)
        SELECT $1, entry.company_id, 0, entry.amount_tco2e, 'initial', 'จัดสรรสิทธิเริ่มต้นเมื่อสร้างรอบ', $3, $4, $5
        FROM jsonb_to_recordset($2::jsonb) AS entry(company_id uuid, amount_tco2e numeric)
      `, [year, JSON.stringify(allocations), req.auth.accountId, req.user.name, req.user.email]);
    }
    await client.query('COMMIT');
    res.status(201).json({ data: round });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.put('/:year/allocations/:companyId', requireAdmin, asyncRoute(async (req, res) => {
  const year = parseYear(req.params.year);
  const mode = req.body.mode ?? 'set';
  if (!['set', 'add', 'subtract'].includes(mode)) throw new ApiError(400, 'วิธีปรับสิทธิไม่ถูกต้อง');
  const amount = decimal(req.body.amount_tco2e, 12, 4, mode === 'set');
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 2000) throw new ApiError(400, 'กรุณาระบุเหตุผลปรับสิทธิ 1 ถึง 2000 ตัวอักษร');
  const result = await inRound(year, ['Reporting', 'Trading'], async client => {
    const { rows: [total] } = await client.query(`
      SELECT CASE $4
        WHEN 'add' THEN COALESCE(a.amount_tco2e, 0) + $3::numeric
        WHEN 'subtract' THEN COALESCE(a.amount_tco2e, 0) - $3::numeric
        ELSE $3::numeric
      END AS amount, COALESCE(a.amount_tco2e, 0) AS before_amount
      FROM companies c LEFT JOIN ets_allocations a ON a.company_id = c.id AND a.year = $1
      WHERE c.id = $2
    `, [year, req.params.companyId, amount, mode]);
    if (!total) throw new ApiError(404, 'ไม่พบบริษัท');
    if (Number(total.amount) < 0 || Number(total.amount) > 99999999.9999) {
      throw new ApiError(400, 'ยอดสิทธิหลังปรับต้องอยู่ระหว่าง 0 ถึง 99,999,999.9999 ตัน CO₂e');
    }
    const { rows } = await client.query(`
      INSERT INTO ets_allocations (year, company_id, amount_tco2e)
      VALUES ($1, $2, $3)
      ON CONFLICT (year, company_id) DO UPDATE SET amount_tco2e = EXCLUDED.amount_tco2e
      RETURNING *
    `, [year, req.params.companyId, total.amount]);
    if (!rows.length) throw new ApiError(404, 'ไม่พบบริษัท');
    await client.query(`
      INSERT INTO credit_adjustments
        (year, company_id, before_tco2e, after_tco2e, action, reason, changed_by, actor_name, actor_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [year, req.params.companyId, total.before_amount, rows[0].amount_tco2e,
        mode, reason, req.auth.accountId, req.user.name, req.user.email]);
    const cancelled = await cancelListingsBeyondBalance(client, year, req.params.companyId);
    return { data: rows[0], cancelled_listing_count: cancelled };
  });
  res.json(result);
}));

router.post('/:year/open', requireAdmin, asyncRoute(async (req, res) => {
  const year = parseYear(req.params.year);
  const data = await inRound(year, 'Reporting', async client => {
    const { rowCount } = await client.query('SELECT 1 FROM ets_allocations WHERE year = $1 LIMIT 1', [year]);
    if (!rowCount) throw new ApiError(409, 'ต้องจัดสรรสิทธิอย่างน้อยหนึ่งบริษัทก่อนเปิดตลาด');
    const { rows } = await client.query(`
      UPDATE ets_rounds SET status = 'Trading', verified_at = CURRENT_TIMESTAMP
      WHERE year = $1 RETURNING *
    `, [year]);
    return rows[0];
  });
  res.json({ data });
}));

router.post('/:year/close', requireAdmin, asyncRoute(async (req, res) => {
  const year = parseYear(req.params.year);
  const data = await inRound(year, 'Trading', async client => {
    await client.query("UPDATE ets_listings SET status = 'Cancelled' WHERE year = $1 AND status IN ('Open', 'Pending')", [year]);
    await client.query("UPDATE emission_submissions SET status = 'Cancelled', review_reason = 'รอบปีปิดแล้ว' WHERE year = $1 AND status = 'Pending'", [year]);
    const { rows } = await client.query(`
      UPDATE ets_rounds SET status = 'Closed', closed_at = CURRENT_TIMESTAMP WHERE year = $1 RETURNING *
    `, [year]);
    return rows[0];
  });
  res.json({ data });
}));

module.exports = router;
