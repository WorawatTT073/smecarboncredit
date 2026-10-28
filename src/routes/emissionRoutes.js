const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { calculateCarbonEquivalent } = require('../services/carbonCalculator');

// POST /api/v1/emissions
router.post('/', async (req, res) => {
  const { company_id, activity_type, amount, record_date } = req.body;

  if (!company_id || !activity_type || !amount || !record_date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const carbon_ton_equivalent = calculateCarbonEquivalent(activity_type, amount);

  try {
    const query = `
      INSERT INTO emission_records (company_id, activity_type, amount, carbon_ton_equivalent, record_date)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [company_id, activity_type, amount, carbon_ton_equivalent, record_date];
    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'Emission recorded successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/emissions/{id}
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM emission_records WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;