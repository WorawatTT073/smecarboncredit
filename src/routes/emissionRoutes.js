const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { calculateCarbonEquivalent, isSupportedActivity } = require('../services/carbonCalculator');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// POST /api/v1/emissions — Partner (SME Owner)
router.post('/', requireAuth, requireRole('Partner'), async (req, res) => {
  const { company_id, activity_type, amount, record_date } = req.body;
  const numericAmount = Number(amount);

  if (!company_id || !activity_type || amount === undefined || !record_date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a number greater than 0' });
  }
  if (!isSupportedActivity(activity_type)) {
    return res.status(400).json({ error: 'Unsupported activity_type', allowed: ['ELECTRICITY', 'DIESEL', 'GASOLINE', 'WATER'] });
  }

  try {
    const company = await pool.query('SELECT id FROM companies WHERE id = $1', [company_id]);
    if (company.rowCount === 0) return res.status(404).json({ error: 'Company not found' });

    const carbon_ton_equivalent = calculateCarbonEquivalent(activity_type, numericAmount);
    const result = await pool.query(`
      INSERT INTO emission_records (company_id, activity_type, amount, carbon_ton_equivalent, record_date)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `, [company_id, activity_type.toUpperCase(), numericAmount, carbon_ton_equivalent, record_date]);

    res.status(201).json({ message: 'Emission recorded successfully', data: result.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid UUID/date format' });
    if (err.code === '23503') return res.status(404).json({ error: 'Company not found' });
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/v1/emissions/summary?company_id=...
router.get('/summary', requireAuth, async (req, res) => {
  const { company_id } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id is required' });

  try {
    const result = await pool.query(`
      SELECT company_id, COUNT(*)::int AS record_count,
             COALESCE(SUM(carbon_ton_equivalent), 0)::numeric AS total_tco2e
      FROM emission_records
      WHERE company_id = $1
      GROUP BY company_id;
    `, [company_id]);

    if (result.rowCount === 0) return res.status(200).json({ company_id, record_count: 0, total_tco2e: 0 });
    res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid company UUID' });
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/v1/emissions/:id — Partner, Admin
router.delete('/:id', requireAuth, requireRole('Partner', 'Admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM emission_records WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid UUID format' });
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
