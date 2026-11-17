const express = require('express');
const pool = require('../config/database');
const { calculateCarbonEquivalent, isSupportedActivity } = require('../services/carbonCalculator');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { ApiError, asyncRoute, parseYear, decimal, inRound, requireAllocation } = require('../services/ets');

const parseEvidence = require('../services/listingEvidence');
const router = express.Router();
router.use(requireAuth, requireRole('Admin', 'Company'));
router.use('/submissions', require('./emissionSubmissionRoutes'));

function companyScope(req) {
  const requested = req.query.company_id;
  if (req.user.company_id && requested && requested !== req.user.company_id) {
    throw new ApiError(403, 'ดูได้เฉพาะข้อมูลของบริษัทในบัญชีนี้');
  }
  const companyId = req.user.company_id || requested;
  if (!companyId) throw new ApiError(400, 'กรุณาเลือกบริษัท');
  return companyId;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.post('/', requireRole('Company'), asyncRoute(async (req, res) => {
  const { activity_type, period_start, period_end } = req.body;
  const amount = decimal(req.body.amount, 12, 2);
  if (!isSupportedActivity(activity_type)) throw new ApiError(400, 'ประเภทกิจกรรมไม่ถูกต้อง');
  if (!validDate(period_start) || !validDate(period_end) || period_start > period_end
      || period_start.slice(0, 4) !== period_end.slice(0, 4)) {
    throw new ApiError(400, 'กรุณาระบุช่วงวันที่ใช้งานให้ถูกต้องและอยู่ในรอบปีเดียวกัน');
  }
  const document = typeof req.body.document_number === 'string' ? req.body.document_number.trim() : '';
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
  if (!document || document.length > 100 || notes.length > 2000) {
    throw new ApiError(400, 'ระบุเลขที่เอกสารไม่เกิน 100 ตัวอักษร และหมายเหตุไม่เกิน 2000 ตัวอักษร');
  }
  const files = parseEvidence(req.body.attachments);
  if (!files.length) throw new ApiError(400, 'กรุณาแนบหลักฐานประกอบอย่างน้อย 1 ไฟล์');
  const year = parseYear(period_end.slice(0, 4));
  const companyId = req.user.company_id;
  const total = calculateCarbonEquivalent(activity_type, amount);
  try {
    const data = await inRound(year, ['Reporting', 'Trading'], async client => {
      await requireAllocation(client, year, companyId);
      const { rows: [submission] } = await client.query(`
        INSERT INTO emission_submissions
          (year, company_id, activity_type, amount, carbon_ton_equivalent, period_start, period_end,
           document_number, notes, submitted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
      `, [year, companyId, activity_type.toUpperCase(), amount, total, period_start, period_end,
          document, notes, req.auth.accountId]);
      for (const file of files) {
        await client.query(
          'INSERT INTO emission_evidence (submission_id, filename, media_type, content) VALUES ($1,$2,$3,$4)',
          [submission.id, file.filename, file.mediaType, file.content]
        );
      }
      return submission;
    });
    res.status(201).json({ data });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'idx_emission_document_once') {
      throw new ApiError(409, 'เลขเอกสารนี้ถูกยื่นสำหรับกิจกรรมนี้แล้ว กรุณาตรวจสอบรายการเดิม');
    }
    throw error;
  }
}));

router.get('/', asyncRoute(async (req, res) => {
  const companyId = companyScope(req);
  const year = req.query.year === undefined ? null : parseYear(req.query.year);
  const { rows } = await pool.query(`
    SELECT id, activity_type, amount, carbon_ton_equivalent, record_date::text AS record_date,
           EXISTS (SELECT 1 FROM emission_submissions s WHERE s.record_id = emission_records.id) AS reviewed_submission
    FROM emission_records WHERE company_id = $1
      AND ($2::int IS NULL OR (record_date >= make_date($2, 1, 1) AND record_date < make_date($2 + 1, 1, 1)))
    ORDER BY record_date DESC, id DESC
  `, [companyId, year]);
  res.json({ data: rows });
}));

router.get('/summary', asyncRoute(async (req, res) => {
  const companyId = companyScope(req);
  const year = req.query.year === undefined ? null : parseYear(req.query.year);
  const { rows } = await pool.query(`
    SELECT $1::uuid AS company_id, COUNT(*)::int AS record_count,
           COALESCE(SUM(carbon_ton_equivalent), 0) AS total_tco2e
    FROM emission_records WHERE company_id = $1
      AND ($2::int IS NULL OR (record_date >= make_date($2, 1, 1) AND record_date < make_date($2 + 1, 1, 1)))
  `, [companyId, year]);
  res.json({ data: rows[0] });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const { rows: [record] } = await pool.query(`
    SELECT company_id, EXTRACT(YEAR FROM record_date)::int AS year FROM emission_records WHERE id = $1
  `, [req.params.id]);
  if (!record || (req.user.company_id && req.user.company_id !== record.company_id)) {
    throw new ApiError(404, 'ไม่พบรายการการปล่อย');
  }
  await inRound(record.year, 'Reporting', async client => {
    const reviewed = await client.query('SELECT 1 FROM emission_submissions WHERE record_id = $1', [req.params.id]);
    if (reviewed.rowCount) throw new ApiError(409, 'รายการนี้อนุมัติจากคำขอแล้ว จึงลบไม่ได้');
    const { rowCount } = await client.query('DELETE FROM emission_records WHERE id = $1', [req.params.id]);
    if (!rowCount) throw new ApiError(404, 'ไม่พบรายการการปล่อย');
  });
  res.status(204).end();
}));

module.exports = router;
