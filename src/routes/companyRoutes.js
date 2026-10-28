const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// PUT /api/v1/companies/{id}
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, industry_type, contact_email } = req.body;

  try {
    const query = `
      UPDATE companies 
      SET name = COALESCE($1, name),
          industry_type = COALESCE($2, industry_type),
          contact_email = COALESCE($3, contact_email)
      WHERE id = $4
      RETURNING *;
    `;
    const result = await pool.query(query, [name, industry_type, contact_email, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.status(200).json({
      message: 'Company profile updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;