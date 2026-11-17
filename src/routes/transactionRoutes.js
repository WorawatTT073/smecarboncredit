const express = require('express');
const pool = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { ApiError, asyncRoute, parseYear, decimal, inRound, requireAllocation } = require('../services/ets');

const parseEvidence = require('../services/listingEvidence');

const router = express.Router();
router.use(requireAuth, requireRole('Admin', 'Company'));
const companyAccount = requireRole('Company');

router.get('/market', asyncRoute(async (req, res) => {
  const year = req.query.year === undefined ? null : parseYear(req.query.year);
  const result = await pool.query(`
    SELECT l.id, l.year, l.seller_company_id, l.remaining_tco2e AS amount_tco2e,
           l.price_per_ton, l.status, l.created_at, c.name AS seller_company_name, c.industry_type
    FROM ets_listings l
    JOIN ets_rounds r ON r.year = l.year
    JOIN companies c ON c.id = l.seller_company_id
    WHERE l.status = 'Open' AND r.status = 'Trading' AND ($1::int IS NULL OR l.year = $1)
    ORDER BY l.created_at DESC, l.id DESC
  `, [year]);
  res.json({ count: result.rowCount, data: result.rows });
}));

router.post('/listings', companyAccount, asyncRoute(async (req, res) => {
  const year = parseYear(req.body.year);
  const amount = decimal(req.body.amount_tco2e, 12, 4);
  const price = decimal(req.body.price_per_ton, 10, 2);
  const companyId = req.user.company_id;
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (!description || description.length > 2000) throw new ApiError(400, 'ระบุรายละเอียดคำขอขาย 1 ถึง 2000 ตัวอักษร');

  const contactName = typeof req.body.contact_name === 'string' ? req.body.contact_name.trim() : '';
  const contactEmail = typeof req.body.contact_email === 'string' ? req.body.contact_email.trim() : '';
  const contactPhone = typeof req.body.contact_phone === 'string' ? req.body.contact_phone.trim() : '';
  if (!contactName || contactName.length > 100 || contactEmail.length > 254 || contactPhone.length > 50
      || (!contactEmail && !contactPhone) || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
    throw new ApiError(400, 'กรอกชื่อผู้ติดต่อและอีเมลหรือเบอร์โทรให้ถูกต้อง');
  }
  const evidence = parseEvidence(req.body.attachments);
  const data = await inRound(year, ['Reporting', 'Trading'], async client => {
    await requireAllocation(client, year, companyId);
    const { rows } = await client.query(`
      INSERT INTO ets_listings (year, seller_company_id, amount_tco2e, remaining_tco2e, price_per_ton,
                                description, contact_name, contact_email, contact_phone, status)
      VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'Pending') RETURNING *
    `, [year, companyId, amount, price, description, contactName, contactEmail, contactPhone]);
    for (const file of evidence) {
      await client.query(
        'INSERT INTO listing_evidence (listing_id, filename, media_type, content) VALUES ($1, $2, $3, $4)',
        [rows[0].id, file.filename, file.mediaType, file.content]
      );
    }
    return rows[0];
  });
  res.status(201).json({ data });
}));

router.get('/listings/:id', asyncRoute(async (req, res) => {
  const { rows: [listing] } = await pool.query(`
    SELECT l.*, c.name AS seller_name, reviewer.name AS reviewer_name,
           ARRAY(
             SELECT jsonb_build_object('id', e.id, 'filename', e.filename,
               'media_type', e.media_type, 'size_bytes', octet_length(e.content))
             FROM listing_evidence e WHERE e.listing_id = l.id ORDER BY e.created_at, e.id
           ) AS attachments
    FROM ets_listings l
    JOIN companies c ON c.id = l.seller_company_id
    LEFT JOIN app_accounts reviewer ON reviewer.id = l.reviewed_by
    WHERE l.id = $1 AND ($2::uuid IS NULL OR l.seller_company_id = $2)
  `, [req.params.id, req.user.company_id]);
  if (!listing) throw new ApiError(404, 'ไม่พบคำขอขาย');
  res.set('Cache-Control', 'no-store').json({ data: listing });
}));

router.get('/listings/:id/evidence/:evidenceId', asyncRoute(async (req, res) => {
  const { rows: [file] } = await pool.query(`
    SELECT e.filename, e.media_type, e.content
    FROM listing_evidence e JOIN ets_listings l ON l.id = e.listing_id
    WHERE e.id = $1 AND l.id = $2 AND ($3::uuid IS NULL OR l.seller_company_id = $3)
  `, [req.params.evidenceId, req.params.id, req.user.company_id]);
  if (!file) throw new ApiError(404, 'ไม่พบไฟล์หลักฐาน');
  const encodedName = encodeURIComponent(file.filename).replace(/['()*]/g,
    char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  res.set({
    'Content-Type': file.media_type,
    'Content-Disposition': "attachment; filename=\"evidence\"; filename*=UTF-8''" + encodedName,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  }).send(file.content);
}));

router.put('/listings/:id/review', requireRole('Admin'), asyncRoute(async (req, res) => {
  const { decision } = req.body;
  if (!['approve', 'reject'].includes(decision)) throw new ApiError(400, 'ผลตรวจสอบไม่ถูกต้อง');
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length > 2000 || (decision === 'reject' && !reason)) {
    throw new ApiError(400, 'กรุณาระบุเหตุผลที่ไม่อนุมัติ ไม่เกิน 2000 ตัวอักษร');
  }
  const { rows: [listing] } = await pool.query('SELECT year FROM ets_listings WHERE id = $1', [req.params.id]);
  if (!listing) throw new ApiError(404, 'ไม่พบคำขอขาย');
  const data = await inRound(listing.year, 'Trading', async client => {
    const { rows: [pending] } = await client.query("SELECT * FROM ets_listings WHERE id = $1 AND status = 'Pending'", [req.params.id]);
    if (!pending) throw new ApiError(409, 'คำขอนี้ตรวจสอบแล้วหรือถูกยกเลิก');
    if (decision === 'approve') {
      const { rows: [balance] } = await client.query(
        'SELECT available_tco2e >= $3::numeric AS enough FROM ets_company_balances WHERE year = $1 AND company_id = $2',
        [pending.year, pending.seller_company_id, pending.remaining_tco2e]
      );
      if (!balance?.enough) throw new ApiError(409, 'สิทธิที่ลงขายได้ไม่พอสำหรับอนุมัติคำขอนี้');
    }
    const { rows } = await client.query(
      'UPDATE ets_listings SET status = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, review_reason = $4 WHERE id = $1 RETURNING *',
      [pending.id, decision === 'approve' ? 'Open' : 'Rejected', req.auth.accountId, reason]
    );
    return rows[0];
  });
  res.json({ data });
}));

router.delete('/listings/:id', companyAccount, asyncRoute(async (req, res) => {
  const { rows: [listing] } = await pool.query('SELECT year FROM ets_listings WHERE id = $1', [req.params.id]);
  if (!listing) throw new ApiError(404, 'ไม่พบประกาศขาย');
  const data = await inRound(listing.year, ['Reporting', 'Trading'], async client => {
    const { rows } = await client.query(`
      UPDATE ets_listings SET status = 'Cancelled'
      WHERE id = $1 AND seller_company_id = $2 AND status IN ('Open', 'Pending')
      RETURNING *
    `, [req.params.id, req.user.company_id]);
    if (!rows.length) throw new ApiError(409, 'ยกเลิกได้เฉพาะประกาศของบริษัทที่ยังเปิดขาย');
    return rows[0];
  });
  res.json({ data });
}));

router.post('/', companyAccount, asyncRoute(async (req, res) => {
  const { listing_id } = req.body;
  if (!listing_id) throw new ApiError(400, 'กรุณาเลือกประกาศขาย');
  const amount = decimal(req.body.amount_tco2e, 12, 4);
  const companyId = req.user.company_id;
  const { rows: [listing] } = await pool.query('SELECT year FROM ets_listings WHERE id = $1', [listing_id]);
  if (!listing) throw new ApiError(404, 'ไม่พบประกาศขาย');

  const data = await inRound(listing.year, 'Trading', async client => {
    await requireAllocation(client, listing.year, companyId);
    const { rows: [source] } = await client.query(`
      UPDATE ets_listings
      SET remaining_tco2e = remaining_tco2e - $2::numeric,
          status = CASE WHEN remaining_tco2e = $2::numeric THEN 'Completed' ELSE 'Open' END
      WHERE id = $1 AND status = 'Open' AND remaining_tco2e >= $2::numeric AND seller_company_id <> $3
      RETURNING id, year, seller_company_id, price_per_ton
    `, [listing_id, amount, companyId]);
    if (!source) throw new ApiError(409, 'ประกาศปิดแล้ว จำนวนคงเหลือไม่พอ หรือเป็นประกาศของบริษัทคุณ');

    const { rows } = await client.query(`
      INSERT INTO credit_transactions
          (ets_listing_id, ets_year, seller_company_id, buyer_company_id, amount_tco2e, price_per_ton, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'Completed')
      RETURNING *
    `, [source.id, source.year, source.seller_company_id, companyId, amount, source.price_per_ton]);
    return rows[0];
  });
  res.status(201).json({ data });
}));

module.exports = router;
