const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgrespassword',
  database: process.env.PGDATABASE || 'carbon_credit_db',
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL Database');
});

module.exports = pool;