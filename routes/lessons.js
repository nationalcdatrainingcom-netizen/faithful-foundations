const express = require('express');
const router = express.Router();
const { pool } = require('../server');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !['super_admin', 'content_admin'].includes(req.session.user.role))
    return res.status(403).json({ error: 'Not authorized' });
  next();
}

// Get single lesson (full content)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_lessons WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update lesson content/notes (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const { content, mary_notes, status } = req.body;
  try {
    const updates = [];
    const values = [];
    let idx = 1;
    if (content !== undefined) { updates.push(`content = $${idx++}`); values.push(content); }
    if (mary_notes !== undefined) { updates.push(`mary_notes = $${idx++}`); values.push(mary_notes); }
    if (status !== undefined) {
      updates.push(`status = $${idx++}`); values.push(status);
      if (status === 'approved') { updates.push(`approved_at = NOW()`); }
      if (status === 'published') { updates.push(`published_at = NOW()`); }
    }
    values.push(req.params.id);
    await pool.query(`UPDATE daily_lessons SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve lesson (super_admin only)
router.post('/:id/approve', requireAdmin, async (req, res) => {
  const { notes } = req.body;
  try {
    await pool.query(
      'UPDATE daily_lessons SET status = $1, mary_notes = $2, approved_at = NOW() WHERE id = $3',
      ['approved', notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish lesson (makes it visible to all subscribers)
router.post('/:id/publish', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE daily_lessons SET status = $1, published_at = NOW() WHERE id = $2 AND status = $3',
      ['published', req.params.id, 'approved']
    );
    // Update exploration weeks_available
    await pool.query(`
      UPDATE explorations SET weeks_available = (
        SELECT COUNT(DISTINCT week_number) FROM daily_lessons 
        WHERE exploration_id = (SELECT exploration_id FROM daily_lessons WHERE id = $1)
        AND status = 'published' AND age_band = 'preschool'
      ) WHERE id = (SELECT exploration_id FROM daily_lessons WHERE id = $1)
    `, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send back for revision
router.post('/:id/revise', requireAdmin, async (req, res) => {
  const { notes } = req.body;
  try {
    await pool.query(
      'UPDATE daily_lessons SET status = $1, mary_notes = $2 WHERE id = $3',
      ['draft', notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
