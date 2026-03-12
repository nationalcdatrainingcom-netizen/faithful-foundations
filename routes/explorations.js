const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Get all explorations (published + coming soon) — for delivery site
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, topic, suggested_month, status, weeks_available, 
       total_days, core_days, overarching_question, book_list, sort_order
       FROM explorations ORDER BY sort_order, title`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single exploration with full details
router.get('/:id', async (req, res) => {
  try {
    const exp = await pool.query('SELECT * FROM explorations WHERE id = $1', [req.params.id]);
    if (!exp.rows.length) return res.status(404).json({ error: 'Not found' });
    
    // Get available lessons for this exploration (published only for non-admins)
    const user = req.session.user;
    const isAdmin = user && ['super_admin', 'content_admin'].includes(user.role);
    const statusFilter = isAdmin ? ['draft', 'in_review', 'approved', 'published'] : ['published'];
    
    const lessons = await pool.query(
      `SELECT id, day_number, week_number, day_type, age_band, focus, 
       fruit_of_spirit, vocabulary_word, lets_think, required_book, status
       FROM daily_lessons 
       WHERE exploration_id = $1 AND status = ANY($2)
       ORDER BY day_number, age_band`,
      [req.params.id, statusFilter]
    );
    
    res.json({ ...exp.rows[0], lessons: lessons.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get weekly teaching guide (all 5 days for a week, all age bands)
router.get('/:id/week/:weekNum', async (req, res) => {
  try {
    const lessons = await pool.query(
      `SELECT id, day_number, week_number, day_type, age_band, focus,
       fruit_of_spirit, vocabulary_word, vocabulary_definition, vocabulary_spanish,
       lets_think, lets_think_display_instructions, required_book, fruitful_moments, status
       FROM daily_lessons
       WHERE exploration_id = $1 AND week_number = $2
       ORDER BY day_number, age_band`,
      [req.params.id, req.params.weekNum]
    );
    res.json(lessons.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
