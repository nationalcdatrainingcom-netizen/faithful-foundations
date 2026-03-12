const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../server');

function requireAdmin(req, res, next) {
  if (!req.session.user || !['super_admin', 'content_admin'].includes(req.session.user.role))
    return res.status(403).json({ error: 'Not authorized' });
  next();
}

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.active, u.email,
             c.name as center_name, cl.name as classroom_name
      FROM users u
      LEFT JOIN centers c ON u.center_id = c.id
      LEFT JOIN classrooms cl ON u.classroom_id = cl.id
      ORDER BY u.role, u.full_name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create user
router.post('/users', requireAdmin, async (req, res) => {
  const { username, pin, role, full_name, email, center_id, classroom_id, organization_id } = req.body;
  try {
    const pin_hash = await bcrypt.hash(pin, 10);
    const result = await pool.query(`
      INSERT INTO users (username, pin_hash, role, full_name, email, center_id, classroom_id, organization_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, username, role, full_name
    `, [username, pin_hash, role, full_name, email, center_id || null, classroom_id || null,
        organization_id || '00000000-0000-0000-0000-000000000001']);
    res.json({ success: true, user: result.rows[0], pin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get centers
router.get('/centers', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             COUNT(DISTINCT cl.id) as classroom_count,
             COUNT(DISTINCT u.id) as user_count
      FROM centers c
      LEFT JOIN classrooms cl ON cl.center_id = c.id
      LEFT JOIN users u ON u.center_id = c.id
      GROUP BY c.id ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get classrooms
router.get('/classrooms', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cl.*, c.name as center_name
      FROM classrooms cl
      JOIN centers c ON cl.center_id = c.id
      ORDER BY c.name, cl.age_band, cl.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create classroom
router.post('/classrooms', requireAdmin, async (req, res) => {
  const { center_id, name, age_band, age_range_label, teacher_name } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO classrooms (center_id, name, age_band, age_range_label, teacher_name)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [center_id, name, age_band, age_range_label, teacher_name]);
    res.json({ success: true, classroom: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get exploration status dashboard
router.get('/content-dashboard', requireAdmin, async (req, res) => {
  try {
    const explorations = await pool.query('SELECT * FROM explorations ORDER BY sort_order');
    const lessonCounts = await pool.query(`
      SELECT exploration_id, age_band, status, COUNT(*) as count
      FROM daily_lessons
      GROUP BY exploration_id, age_band, status
    `);
    res.json({ explorations: explorations.rows, lesson_counts: lessonCounts.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update exploration status
router.put('/explorations/:id', requireAdmin, async (req, res) => {
  const { status, scope_sequence, book_list } = req.body;
  try {
    const updates = [];
    const values = [];
    let idx = 1;
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (scope_sequence) { updates.push(`scope_sequence = $${idx++}`); values.push(JSON.stringify(scope_sequence)); }
    if (book_list) { updates.push(`book_list = $${idx++}`); values.push(JSON.stringify(book_list)); }
    if (status === 'published') { updates.push(`published_at = NOW()`); }
    values.push(req.params.id);
    await pool.query(`UPDATE explorations SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
