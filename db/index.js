const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDb() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('Database schema initialized');

    // Create super admin if not exists
    const adminCheck = await client.query(
      "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1"
    );
    if (adminCheck.rows.length === 0) {
      const pinHash = await bcrypt.hash('1234', 10);
      await client.query(
        `INSERT INTO users (username, pin_hash, full_name, role, center_id)
         VALUES ('admin', $1, 'Mary - Administrator', 'super_admin', NULL)`,
        [pinHash]
      );
      console.log('Super admin created: username=admin, PIN=1234');
    }
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
