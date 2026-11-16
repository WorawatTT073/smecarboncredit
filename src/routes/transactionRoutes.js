const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// GET /api/v1/credits/market — Public, Customer (Partner/Admin may also view when logged in)
router.get('/market', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id, t.seller_company_id, t.amount_tco2e, t.price_per_ton,
             t.status, t.created_at, s.name AS seller_company_name, s.industry_type
      FROM credit_transactions t
      JOIN companies s ON s.id = t.seller_company_id
      WHERE t.status = 'Open' AND t.buyer_company_id IS NULL
      ORDER BY t.created_at DESC;
    `);
    res.status(200).json({ count: result.rowCount, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/v1/credits/listings — bonus endpoint for Partner to open credits for sale.
router.post('/listings', requireAuth, requireRole('Partner'), async (req, res) => {
  const { seller_company_id, amount_tco2e, price_per_ton } = req.body;
  const amount = Number(amount_tco2e);
  const price = Number(price_per_ton);

  if (!seller_company_id || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'seller_company_id, amount_tco2e and price_per_ton must be valid positive values' });
  }

  try {
    const company = await pool.query('SELECT id FROM companies WHERE id = $1', [seller_company_id]);
    if (company.rowCount === 0) return res.status(404).json({ error: 'Seller company not found' });

    const result = await pool.query(`
      INSERT INTO credit_transactions (seller_company_id, buyer_company_id, amount_tco2e, price_per_ton, status)
      VALUES ($1, NULL, $2, $3, 'Open') RETURNING *;
    `, [seller_company_id, amount, price]);
    res.status(201).json({ message: 'Credit listing opened successfully', data: result.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid UUID format' });
    if (err.code === '23503') return res.status(404).json({ error: 'Company not found' });
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/v1/transactions — Customer, Partner
router.post('/', requireAuth, requireRole('Customer', 'Partner'), async (req, res) => {
  const { seller_company_id, buyer_company_id, amount_tco2e, price_per_ton } = req.body;
  const amount = Number(amount_tco2e);
  const price = Number(price_per_ton);

  if (!seller_company_id || !buyer_company_id || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'seller_company_id, buyer_company_id, amount_tco2e and price_per_ton must be valid positive values' });
  }
  if (seller_company_id === buyer_company_id) {
    return res.status(400).json({ error: 'Seller and buyer cannot be the same company' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const listing = await client.query(`
      SELECT id, seller_company_id, amount_tco2e, price_per_ton
      FROM credit_transactions
      WHERE seller_company_id = $1 AND status = 'Open' AND buyer_company_id IS NULL
        AND amount_tco2e >= $2
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;
    `, [seller_company_id, amount]);

    if (listing.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Seller does not have enough open credits at the requested amount' });
    }

    const source = listing.rows[0];
    if (Math.abs(Number(source.price_per_ton) - price) > 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'price_per_ton does not match the selected market listing' });
    }

    const transaction = await client.query(`
      INSERT INTO credit_transactions (seller_company_id, buyer_company_id, amount_tco2e, price_per_ton, status)
      VALUES ($1, $2, $3, $4, 'Pending') RETURNING *;
    `, [seller_company_id, buyer_company_id, amount, price]);

    const remaining = Number(source.amount_tco2e) - amount;
    if (remaining === 0) {
      await client.query("UPDATE credit_transactions SET status = 'Completed' WHERE id = $1", [source.id]);
    } else {
      await client.query('UPDATE credit_transactions SET amount_tco2e = $1 WHERE id = $2', [remaining, source.id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Transaction order created successfully', data: transaction.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid UUID format' });
    if (err.code === '23503') return res.status(404).json({ error: 'Company not found' });
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

module.exports = router;
