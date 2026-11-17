const express = require('express');
const pool = require('../config/database');
const { requireRole } = require('../middleware/authMiddleware');
const { ApiError, asyncRoute, parseYear, inRound, cancelListingsBeyondBalance } = require('../services/ets');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  const year = parseYear(req.query.year);
  const { rows } = await pool.query(`
    SELECT s.id, s.company_id, c.name AS company_name, s.activity_type, s.amount, s.carbon_ton_equivalent,
           s.period_start::text, s.period_end::text, s.document_number, s.status, s.created_at
    FROM emission_submissions s JOIN companies c ON c.id = s.company_id
    WHERE s.year = $1 AND ($2::uuid IS NULL OR s.company_id = $2)
    ORDER BY s.created_at DESC, s.id DESC
  `, [year, req.user.company_id]);
  res.json({ data: rows });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const { rows: [data] } = await pool.query(`
    SELECT s.*, s.period_start::text AS period_start, s.period_end::text AS period_end,
           c.name AS company_name, reviewer.name AS reviewer_name,
           ARRAY(
             SELECT jsonb_build_object('id', e.id, 'filename', e.filename,
               'size_bytes', octet_length(e.content))
             FROM emission_evidence e WHERE e.submission_id = s.id ORDER BY e.created_at, e.id
           ) AS attachments
    FROM emission_submissions s JOIN companies c ON c.id = s.company_id
    LEFT JOIN app_accounts reviewer ON reviewer.id = s.reviewed_by
    WHERE s.id = $1 AND ($2::uuid IS NULL OR s.company_id = $2)
  `, [req.params.id, req.user.company_id]);
  if (!data) throw new ApiError(404, 'ไม่พบคำขอยอดใช้จริง');
  res.set('Cache-Control', 'no-store').json({ data });
}));

router.get('/:id/evidence/:fileId', asyncRoute(async (req, res) => {
  const { rows: [file] } = await pool.query(`
    SELECT e.filename, e.media_type, e.content
    FROM emission_evidence e JOIN emission_submissions s ON s.id = e.submission_id
    WHERE s.id = $1 AND e.id = $2 AND ($3::uuid IS NULL OR s.company_id = $3)
  `, [req.params.id, req.params.fileId, req.user.company_id]);
  if (!file) throw new ApiError(404, 'ไม่พบไฟล์หลักฐาน');
  res.attachment(file.filename);
  res.set({ 'Content-Type': file.media_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.send(file.content);
}));

router.put('/:id/review', requireRole('Admin'), asyncRoute(async (req, res) => {
  const { decision } = req.body;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!['approve', 'reject'].includes(decision) || reason.length > 2000 || (decision === 'reject' && !reason)) {
    throw new ApiError(400, 'ระบุผลตรวจสอบและเหตุผลเมื่อไม่อนุมัติ');
  }
  const { rows: [request] } = await pool.query('SELECT year FROM emission_submissions WHERE id = $1', [req.params.id]);
  if (!request) throw new ApiError(404, 'ไม่พบคำขอ');
  const result = await inRound(request.year, ['Reporting', 'Trading'], async (client, roundStatus) => {
    const { rows: [submission] } = await client.query(
      "SELECT * FROM emission_submissions WHERE id = $1 AND status = 'Pending'", [req.params.id]
    );
    if (!submission) throw new ApiError(409, 'คำขอนี้ตรวจสอบแล้วหรือถูกยกเลิก');
    let recordId = null;
    let cancelled = 0;
    if (decision === 'approve') {
      const { rows: [record] } = await client.query(`
        INSERT INTO emission_records (company_id, activity_type, amount, carbon_ton_equivalent, record_date)
        VALUES ($1, $2, $3, $4, $5) RETURNING id
      `, [submission.company_id, submission.activity_type, submission.amount,
          submission.carbon_ton_equivalent, submission.period_end]);
      recordId = record.id;
      if (roundStatus === 'Trading') {
        cancelled = await cancelListingsBeyondBalance(client, submission.year, submission.company_id);
      }
    }
    const { rows: [data] } = await client.query(`
      UPDATE emission_submissions
      SET status = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, review_reason = $4, record_id = $5
      WHERE id = $1 RETURNING id, status
    `, [submission.id, decision === 'approve' ? 'Approved' : 'Rejected', req.auth.accountId, reason, recordId]);
    return { data, cancelled_listing_count: cancelled };
  });
  res.json(result);
}));

router.delete('/:id', requireRole('Company'), asyncRoute(async (req, res) => {
  const { rows: [request] } = await pool.query(
    'SELECT year FROM emission_submissions WHERE id = $1 AND company_id = $2',
    [req.params.id, req.user.company_id]
  );
  if (!request) throw new ApiError(404, 'ไม่พบคำขอ');
  await inRound(request.year, ['Reporting', 'Trading'], async client => {
    const { rowCount } = await client.query(
      "UPDATE emission_submissions SET status = 'Cancelled' WHERE id = $1 AND status = 'Pending'", [req.params.id]
    );
    if (!rowCount) throw new ApiError(409, 'ยกเลิกได้เฉพาะคำขอที่รอตรวจสอบ');
  });
  res.status(204).end();
}));

module.exports = router;
