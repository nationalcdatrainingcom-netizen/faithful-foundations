const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { requireAuth, requireRole, canAccessCenter } = require('../middleware/auth');
const router = express.Router();

function generateUsername(fullName) {
  const parts = fullName.toLowerCase().trim().split(/\s+/);
  const base = parts.length >= 2
    ? parts[0] + '.' + parts[parts.length - 1]
    : parts[0];
  return base.replace(/[^a-z.]/g, '');
}

function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Get all centers
router.get('/centers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM centers ORDER BY name');
    res.json({ success: true, centers: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all users (filtered by role)
router.get('/users', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  const user = req.session.user;
  try {
    let query = `SELECT u.id, u.username, u.full_name, u.role, u.center_id, u.is_active,
                  u.created_at, u.last_login, c.name as center_name
                 FROM users u LEFT JOIN centers c ON u.center_id = c.id`;
    const params = [];
    if (user.role === 'center_director') {
      query += ' WHERE u.center_id = $1';
      params.push(user.center_id);
    }
    query += ' ORDER BY u.full_name';
    const result = await pool.query(query, params);
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create user
router.post('/users', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  const { full_name, role, center_id } = req.body;
  const caller = req.session.user;

  // Directors can only create teachers at their center
  if (caller.role === 'center_director' && (role !== 'teacher' || center_id !== caller.center_id)) {
    return res.status(403).json({ success: false, error: 'Directors can only create teachers at their center' });
  }

  try {
    let baseUsername = generateUsername(full_name);
    // Ensure unique username
    let username = baseUsername;
    let counter = 1;
    while (true) {
      const check = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (check.rows.length === 0) break;
      username = baseUsername + counter++;
    }

    const pin = generatePIN();
    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query(
      `INSERT INTO users (username, pin_hash, full_name, role, center_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, role, center_id`,
      [username, pinHash, full_name, role, center_id || null]
    );

    res.json({ success: true, user: result.rows[0], pin, username });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset user PIN
router.post('/users/:id/reset-pin', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  try {
    const pin = generatePIN();
    const pinHash = await bcrypt.hash(pin, 10);
    await pool.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pinHash, req.params.id]);
    res.json({ success: true, pin });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deactivate/reactivate user
router.post('/users/:id/toggle', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING is_active',
      [req.params.id]
    );
    res.json({ success: true, is_active: result.rows[0].is_active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all classrooms
router.get('/classrooms', requireAuth, async (req, res) => {
  const user = req.session.user;
  try {
    let query = `SELECT cl.*, c.name as center_name, u.full_name as teacher_name, u.username as teacher_username
                 FROM classrooms cl
                 LEFT JOIN centers c ON cl.center_id = c.id
                 LEFT JOIN users u ON cl.teacher_id = u.id
                 WHERE cl.is_active = true`;
    const params = [];
    if (user.role === 'center_director') {
      query += ' AND cl.center_id = $1';
      params.push(user.center_id);
    } else if (user.role === 'teacher') {
      query += ' AND cl.teacher_id = $1';
      params.push(user.id);
    }
    query += ' ORDER BY c.name, cl.name';
    const result = await pool.query(query, params);
    res.json({ success: true, classrooms: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create classroom
router.post('/classrooms', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  const { name, center_id, teacher_id, youngest_months, oldest_months, school_year } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO classrooms (name, center_id, teacher_id, youngest_months, oldest_months, school_year)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, center_id, teacher_id || null, youngest_months, oldest_months, school_year]
    );
    if (teacher_id) {
      await pool.query(
        'INSERT INTO classroom_history (classroom_id, teacher_id) VALUES ($1, $2)',
        [result.rows[0].id, teacher_id]
      );
    }
    res.json({ success: true, classroom: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Transfer classroom to new teacher
router.post('/classrooms/:id/transfer', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  const { new_teacher_id } = req.body;
  try {
    // Close out previous assignment
    await pool.query(
      `UPDATE classroom_history SET removed_at = NOW()
       WHERE classroom_id = $1 AND removed_at IS NULL`,
      [req.params.id]
    );
    // Assign new teacher
    await pool.query(
      'UPDATE classrooms SET teacher_id = $1 WHERE id = $2',
      [new_teacher_id, req.params.id]
    );
    if (new_teacher_id) {
      await pool.query(
        'INSERT INTO classroom_history (classroom_id, teacher_id) VALUES ($1, $2)',
        [req.params.id, new_teacher_id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update classroom age range
router.put('/classrooms/:id', requireAuth, requireRole('super_admin','multi_site_director','center_director'), async (req, res) => {
  const { name, youngest_months, oldest_months } = req.body;
  try {
    await pool.query(
      'UPDATE classrooms SET name=$1, youngest_months=$2, oldest_months=$3 WHERE id=$4',
      [name, youngest_months, oldest_months, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get teachers for a center (for dropdowns)
router.get('/centers/:centerId/teachers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name FROM users
       WHERE center_id = $1 AND role = 'teacher' AND is_active = true
       ORDER BY full_name`,
      [req.params.centerId]
    );
    res.json({ success: true, teachers: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
