const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('./database');

const migrations = ['001-ets', '002-accounts', '003-company-viewer', '004-listing-approval', '005-evidence-credit-history', '006-emission-submissions'];

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sme-carbon-credit-schema'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
    for (const name of migrations) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rowCount) continue;

      const sql = await fs.readFile(path.join(__dirname, 'migrations', name + '.sql'), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = initializeDatabase;
