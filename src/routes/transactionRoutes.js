const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/v1/credits/market
router.get('/market', async (req, res) => {
  try {
    const query = `
      SELECT t.id, t.amount_tco2e, t.price_per_ton, t.status, t.created_at,
             s.name as seller_company_name, s.industry_type
      FROM credit_transactions t
      JOIN companies s ON t.seller_company_id = s.id
      WHERE t.status = 'Pending'
      ORDER BY t.created_at DESC;
    `;
    const result = await pool.query(query);
    res.status(200).json({ count: result.rowCount, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/transactions
router.post('/', async (req, res) => {
  const { seller_company_id, buyer_company_id, amount_tco2e, price_per_ton } = req.body;

  if (!seller_company_id || !buyer_company_id || !amount_tco2e || !price_per_ton) {
    return res.status(400).json({ error: 'Missing required transaction details' });
  }

  try {
    const query = `
      INSERT INTO credit_transactions (seller_company_id, buyer_company_id, amount_tco2e, price_per_ton, status)
      VALUES ($1, $2, $3, $4, 'Pending')
      RETURNING *;
    `;
    const values = [seller_company_id, buyer_company_id, amount_tco2e, price_per_ton];
    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'Transaction order created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;