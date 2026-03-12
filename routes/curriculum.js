const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MICHIGAN_STANDARDS = `
Michigan Early Learning Standards (Birth to Kindergarten):
- Social-Emotional Development: Self-regulation, relationships, social skills
- Physical Development & Health: Gross motor, fine motor, health/safety
- Language & Literacy: Listening/speaking, phonological awareness, print concepts, writing
- Cognitive Development & General Knowledge: Math, Science, Social Studies, Creative Arts
- Approaches to Learning: Initiative, curiosity, persistence, creativity, problem-solving
`;

const INTEREST_AREAS = ['Blocks','Dramatic Play','Toys & Games','Art','Library/Book Corner',
  'Discovery/Science','Sand & Water','Music & Movement','Cooking/Sensory','Technology','Outdoors'];

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

function getAgeGroupLabel(y, o) {
  if (o <= 12) return 'Infant';
  if (o <= 36) return y < 12 ? 'Infant/Toddler' : 'Toddler';
  if (o <= 48) return y <= 36 ? 'Toddler/Preschool' : 'Preschool';
  return y <= 48 ? 'Preschool/Pre-K' : 'Pre-K';
}

function buildSystemPrompt(y, o) {
  const label = getAgeGroupLabel(y, o);
  return `You are an expert early childhood curriculum developer for The Children's Center (TCC), a licensed childcare organization in Michigan. You create original, research-based curriculum content that closely mirrors the structure and philosophy of Teaching Strategies Creative Curriculum but uses entirely original content.

CLASSROOM: Youngest ${y} months, Oldest ${o} months, Age group: ${label}
INTEREST AREAS: ${INTEREST_AREAS.join(', ')}
STANDARDS: ${MICHIGAN_STANDARDS}

Every activity must include differentiation for younger and older children.
RESPOND ONLY WITH VALID JSON. No markdown, no preamble.`;
}

// Get curriculum calendar for a classroom (all plans organized by month/week)
router.get('/classroom/:classroomId/calendar', requireAuth, async (req, res) => {
  try {
    const classroom = await getClassroom(req.params.classroomId, req.session.user);
    if (!classroom) return res.status(404).json({ success: false, error: 'Classroom not found' });

    const plans = await pool.query(
      `SELECT id, plan_type, month_num, week_num, day_name, study_theme, week_focus,
              is_complete, teacher_notes, created_at, updated_at
       FROM plans WHERE classroom_id = $1 AND school_year = $2
       ORDER BY month_num, week_num, day_name`,
      [req.params.classroomId, classroom.school_year]
    );

    res.json({ success: true, classroom, plans: plans.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get a single plan with full content
router.get('/plan/:planId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plans WHERE id = $1', [req.params.planId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Plan not found' });
    res.json({ success: true, plan: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate monthly plan
router.post('/generate/monthly', requireAuth, async (req, res) => {
  const { classroomId, monthNum, year } = req.body;
  try {
    const classroom = await getClassroom(classroomId, req.session.user);
    if (!classroom) return res.status(404).json({ success: false, error: 'Classroom not found' });

    // Check if already exists
    const existing = await pool.query(
      `SELECT * FROM plans WHERE classroom_id=$1 AND plan_type='monthly' AND month_num=$2 AND school_year=$3`,
      [classroomId, monthNum, classroom.school_year]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, plan: existing.rows[0], cached: true });
    }

    const monthName = MONTHS[monthNum - 1];
    const y = parseFloat(classroom.youngest_months);
    const o = parseFloat(classroom.oldest_months);

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: buildSystemPrompt(y, o),
      messages: [{
        role: 'user',
        content: `Generate a Monthly Curriculum Overview for ${monthName} ${year} for a ${getAgeGroupLabel(y,o)} classroom called "${classroom.name}" at ${classroom.center_name}.

Return this exact JSON:
{
  "month": "${monthName} ${year}",
  "ageGroup": "${getAgeGroupLabel(y,o)}",
  "studyTheme": "string",
  "studyRationale": "string",
  "bigIdeas": ["string","string","string"],
  "domainGoals": {
    "socialEmotional": "string",
    "physical": "string",
    "languageLiteracy": "string",
    "cognitive": "string",
    "approachesToLearning": "string"
  },
  "vocabulary": ["word1","word2","word3","word4","word5","word6","word7","word8"],
  "suggestedBooks": [
    {"title":"string","author":"string","connection":"string"},
    {"title":"string","author":"string","connection":"string"},
    {"title":"string","author":"string","connection":"string"}
  ],
  "environmentSetup": {
    "blocks": "string",
    "dramaticPlay": "string",
    "art": "string",
    "library": "string",
    "discovery": "string",
    "outdoors": "string"
  },
  "familyEngagement": {
    "monthlyLetter": "string",
    "homeActivities": ["string","string","string"]
  },
  "weeks": [
    {"weekNumber":1,"weekFocus":"string"},
    {"weekNumber":2,"weekFocus":"string"},
    {"weekNumber":3,"weekFocus":"string"},
    {"weekNumber":4,"weekFocus":"string"}
  ]
}`
      }]
    });

    const content = JSON.parse(response.content[0].text);
    const saved = await pool.query(
      `INSERT INTO plans (classroom_id, plan_type, school_year, month_num, study_theme, content, generated_by)
       VALUES ($1,'monthly',$2,$3,$4,$5,$6) RETURNING *`,
      [classroomId, classroom.school_year, monthNum, content.studyTheme, content, req.session.user.id]
    );

    res.json({ success: true, plan: saved.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate weekly plan
router.post('/generate/weekly', requireAuth, async (req, res) => {
  const { classroomId, monthNum, weekNum, studyTheme, weekFocus } = req.body;
  try {
    const classroom = await getClassroom(classroomId, req.session.user);
    if (!classroom) return res.status(404).json({ success: false, error: 'Classroom not found' });

    const existing = await pool.query(
      `SELECT * FROM plans WHERE classroom_id=$1 AND plan_type='weekly' AND month_num=$2 AND week_num=$3 AND school_year=$4`,
      [classroomId, monthNum, weekNum, classroom.school_year]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, plan: existing.rows[0], cached: true });
    }

    const monthName = MONTHS[monthNum - 1];
    const y = parseFloat(classroom.youngest_months);
    const o = parseFloat(classroom.oldest_months);
    const year = classroom.school_year.split('-')[monthNum >= 9 ? 0 : 1];

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 6000,
      system: buildSystemPrompt(y, o),
      messages: [{
        role: 'user',
        content: `Generate a Weekly Lesson Plan for Week ${weekNum} of ${monthName} ${year}.
Study Theme: "${studyTheme}", Week Focus: "${weekFocus}"
Classroom: "${classroom.name}" at ${classroom.center_name}

Return this exact JSON:
{
  "week": "Week ${weekNum} - ${monthName} ${year}",
  "studyTheme": "${studyTheme}",
  "weekFocus": "${weekFocus}",
  "ageGroup": "${getAgeGroupLabel(y,o)}",
  "weeklyObjectives": ["string","string","string","string"],
  "weeklyVocabulary": ["word1","word2","word3","word4"],
  "materials": ["item1","item2","item3","item4","item5","item6"],
  "days": [
    {
      "day": "Monday",
      "morningMeeting": {
        "greetingSong": "string",
        "calendarActivity": "string",
        "mightyMinuteActivity": "string",
        "readAloud": "string"
      },
      "smallGroup": {
        "activityName": "string",
        "objective": "string",
        "materials": ["item1","item2"],
        "instructions": "string",
        "youngerChildren": "string",
        "olderChildren": "string"
      },
      "interestAreas": [
        {"area":"string","activity":"string","materials":"string"},
        {"area":"string","activity":"string","materials":"string"},
        {"area":"string","activity":"string","materials":"string"}
      ],
      "outdoorActivity": "string",
      "familyEngagementTip": "string"
    },
    {"day":"Tuesday","morningMeeting":{},"smallGroup":{},"interestAreas":[],"outdoorActivity":"","familyEngagementTip":""},
    {"day":"Wednesday","morningMeeting":{},"smallGroup":{},"interestAreas":[],"outdoorActivity":"","familyEngagementTip":""},
    {"day":"Thursday","morningMeeting":{},"smallGroup":{},"interestAreas":[],"outdoorActivity":"","familyEngagementTip":""},
    {"day":"Friday","morningMeeting":{},"smallGroup":{},"interestAreas":[],"outdoorActivity":"","familyEngagementTip":""}
  ]
}`
      }]
    });

    const content = JSON.parse(response.content[0].text);
    const saved = await pool.query(
      `INSERT INTO plans (classroom_id, plan_type, school_year, month_num, week_num, study_theme, week_focus, content, generated_by)
       VALUES ($1,'weekly',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [classroomId, classroom.school_year, monthNum, weekNum, studyTheme, weekFocus, content, req.session.user.id]
    );

    res.json({ success: true, plan: saved.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate daily plan
router.post('/generate/daily', requireAuth, async (req, res) => {
  const { classroomId, monthNum, weekNum, dayName, studyTheme, weekFocus } = req.body;
  try {
    const classroom = await getClassroom(classroomId, req.session.user);
    if (!classroom) return res.status(404).json({ success: false, error: 'Classroom not found' });

    const existing = await pool.query(
      `SELECT * FROM plans WHERE classroom_id=$1 AND plan_type='daily' AND month_num=$2 AND week_num=$3 AND day_name=$4 AND school_year=$5`,
      [classroomId, monthNum, weekNum, dayName, classroom.school_year]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, plan: existing.rows[0], cached: true });
    }

    const monthName = MONTHS[monthNum - 1];
    const y = parseFloat(classroom.youngest_months);
    const o = parseFloat(classroom.oldest_months);
    const year = classroom.school_year.split('-')[monthNum >= 9 ? 0 : 1];

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: buildSystemPrompt(y, o),
      messages: [{
        role: 'user',
        content: `Generate a detailed Daily Plan for ${dayName}, Week ${weekNum} of ${monthName} ${year}.
Study: "${studyTheme}", Focus: "${weekFocus}", Classroom: "${classroom.name}"

Return this exact JSON:
{
  "day": "${dayName}",
  "date": "${monthName} ${year}, Week ${weekNum}",
  "studyTheme": "${studyTheme}",
  "ageGroup": "${getAgeGroupLabel(y,o)}",
  "schedule": [
    {"time":"7:00-8:30 AM","block":"Arrival & Morning Choice Time","teacherRole":"string","environmentNotes":"string","childrenDoing":"string"},
    {"time":"8:30-9:00 AM","block":"Morning Meeting","greeting":"string","calendar":"string",
      "mightyMinute":{"title":"string","fullInstructions":"string","materials":"string","michiganStandard":"string"},
      "readAloud":{"bookTitle":"string","beforeReading":"string","duringReading":"string","afterReading":"string"}},
    {"time":"9:00-9:45 AM","block":"Small Group","activityName":"string","fullInstructions":"string",
      "materials":["item1","item2"],"michiganStandard":"string","youngerAdaptation":"string","olderExtension":"string",
      "teacherTalkMoves":["string","string","string"]},
    {"time":"9:45-11:15 AM","block":"Interest Area Exploration","teacherFocus":"string",
      "interestAreas":[
        {"area":"Blocks","setup":"string","invitation":"string","teacherPrompts":["string","string"]},
        {"area":"Dramatic Play","setup":"string","invitation":"string","teacherPrompts":["string","string"]},
        {"area":"Art","setup":"string","invitation":"string","teacherPrompts":["string","string"]},
        {"area":"Library","setup":"string","invitation":"string","teacherPrompts":["string","string"]},
        {"area":"Discovery","setup":"string","invitation":"string","teacherPrompts":["string","string"]}
      ]},
    {"time":"11:15-11:45 AM","block":"Outdoor Time","activityName":"string","description":"string","studyConnection":"string","safetyNote":null},
    {"time":"11:45 AM-12:30 PM","block":"Lunch & Cleanup","conversationStarters":["string","string"],"vocabularyPractice":"string"},
    {"time":"12:30-2:30 PM","block":"Rest Time","transitionActivity":"string","teacherTasks":"string"},
    {"time":"2:30-3:30 PM","block":"Afternoon Activity","activity":"string","description":"string"},
    {"time":"3:30-6:00 PM","block":"Afternoon & Dismissal","activity":"string","familyEngagementTip":"string","conversationStarter":"string"}
  ],
  "teacherReflection":{
    "endOfDayPrompts":["string","string","string"],
    "observationFocus":"string",
    "tomorrowPrep":"string"
  }
}`
      }]
    });

    const content = JSON.parse(response.content[0].text);
    const saved = await pool.query(
      `INSERT INTO plans (classroom_id, plan_type, school_year, month_num, week_num, day_name, study_theme, week_focus, content, generated_by)
       VALUES ($1,'daily',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [classroomId, classroom.school_year, monthNum, weekNum, dayName, studyTheme, weekFocus, content, req.session.user.id]
    );

    res.json({ success: true, plan: saved.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark week complete / incomplete
router.post('/plan/:planId/complete', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE plans SET is_complete = NOT is_complete, updated_at = NOW() WHERE id = $1 RETURNING is_complete',
      [req.params.planId]
    );
    res.json({ success: true, is_complete: result.rows[0].is_complete });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save teacher notes on a plan
router.post('/plan/:planId/notes', requireAuth, async (req, res) => {
  const { notes } = req.body;
  try {
    await pool.query(
      'UPDATE plans SET teacher_notes = $1, updated_at = NOW() WHERE id = $2',
      [notes, req.params.planId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regenerate a plan (delete and regenerate)
router.delete('/plan/:planId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM plans WHERE id = $1', [req.params.planId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: get classroom with access check
async function getClassroom(classroomId, user) {
  let query = `SELECT cl.*, c.name as center_name
               FROM classrooms cl JOIN centers c ON cl.center_id = c.id
               WHERE cl.id = $1`;
  const params = [classroomId];
  const result = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  const cl = result.rows[0];
  // Access check
  if (user.role === 'teacher' && cl.teacher_id !== user.id) return null;
  if (user.role === 'center_director' && cl.center_id !== user.center_id) return null;
  return cl;
}

module.exports = router;
