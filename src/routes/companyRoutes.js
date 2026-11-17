const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// PUT /api/v1/companies/:id
router.put('/:id', requireAuth, requireRole('Company', 'Admin'), async (req, res) => {
  const { id } = req.params;
  if (req.user.company_id && id !== req.user.company_id) {
    return res.status(403).json({ error: 'แก้ไขได้เฉพาะบริษัทในบัญชีนี้' });
  }
  const { name, industry_type, contact_email, reduction_target } = req.body;

  if (reduction_target !== undefined && (!Number.isFinite(Number(reduction_target)) || Number(reduction_target) < 0 || Number(reduction_target) > 100)) {
    return res.status(400).json({ error: 'reduction_target must be a number between 0 and 100' });
  }

  try {
    const result = await pool.query(`
      UPDATE companies
      SET name = COALESCE($1, name),
          industry_type = COALESCE($2, industry_type),
          contact_email = COALESCE($3, contact_email),
          reduction_target = COALESCE($4, reduction_target)
      WHERE id = $5
      RETURNING *;
    `, [name, industry_type, contact_email, reduction_target, id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
    res.status(200).json({ message: 'Company updated successfully', data: result.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid UUID format' });
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
