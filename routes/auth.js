const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) {
    return res.status(400).json({ success: false, error: 'Username and PIN required' });
  }
  try {
    const result = await pool.query(
      `SELECT u.*, c.name as center_name FROM users u
       LEFT JOIN centers c ON u.center_id = c.id
       WHERE LOWER(u.username) = LOWER($1) AND u.is_active = true`,
      [username.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid username or PIN' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(pin.toString(), user.pin_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid username or PIN' });
    }
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      center_id: user.center_id,
      center_name: user.center_name
    };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Get current session
router.get('/me', (req, res) => {
  if (!req.session?.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

module.exports = router;
