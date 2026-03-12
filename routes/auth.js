const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

router.post('/login', async (req, res) => {
  const { username, pin } = req.body;
  try {
    const result = await pool.query(
      'SELECT u.*, o.name as org_name, o.type as org_type FROM users u JOIN organizations o ON u.organization_id = o.id WHERE u.username = $1 AND u.active = true',
      [username]
    );
    if (!result.rows.length) return res.json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(pin, user.pin_hash);
    if (!valid) return res.json({ error: 'Invalid credentials' });
    req.session.user = {
      id: user.id, username: user.username, role: user.role,
      full_name: user.full_name, organization_id: user.organization_id,
      org_name: user.org_name, org_type: user.org_type,
      center_id: user.center_id, classroom_id: user.classroom_id
    };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
