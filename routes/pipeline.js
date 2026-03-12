const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

function requireAdmin(req, res, next) {
  if (!req.session.user || !['super_admin', 'content_admin'].includes(req.session.user.role))
    return res.status(403).json({ error: 'Not authorized' });
  next();
}

// ============================================================
// MEALTIME PRAYERS (rotate by day number)
// ============================================================
const MEALTIME_PRAYERS = [
  {
    name: 'Thankful Hearts',
    text: 'For food to eat and friends so dear,\nFor loving hands that brought it here,\nFor eyes to see and hearts that sing,\nWe thank You, God, for everything. Amen.'
  },
  {
    name: 'God is Great',
    text: 'God is great, God is good,\nLet us thank Him for our food.\nBy His hands we all are fed,\nGive us, Lord, our daily bread. Amen.'
  },
  {
    name: 'Little Seeds',
    text: 'Little seeds grow big and tall,\nGod takes care of one and all.\nThank You for this food today,\nBless our friends as we eat and play. Amen.'
  },
  {
    name: 'Trees and Bees',
    text: 'Thank You for the trees so tall,\nThank You for the rain that falls,\nThank You for the food we eat,\nEvery bite is made complete. Amen.'
  },
  {
    name: 'Gentle Hands',
    text: 'Gentle hands and thankful hearts,\nBless this food before we start.\nThank You, God, for loving care,\nBlessings on the food we share. Amen.'
  }
];

// ============================================================
// REVIEWER CHECKLIST
// ============================================================
const REVIEWER_SYSTEM_PROMPT = `You are a quality reviewer for Faithful Foundations, a faith-based early childhood curriculum. Your job is to review a generated Daily Learning Experience and score it against a precise checklist.

You must return ONLY valid JSON — no preamble, no explanation outside the JSON.

FORBIDDEN TERMS — automatic fail if any appear:
- Creative Curriculum, Mighty Minutes, Safe Place, School Family
- Small Group, ITE, Read-Aloud, Morning Meeting, Large Group Roundup
- Question of the Day, Yellow/Green/Blue/Purple (as assessment levels)
- Conscious Discipline (named explicitly)

REQUIRED SECTIONS — each must be present and complete:
1. HEADER BLOCK: vocabulary word + child-friendly definition + Spanish translation, Fruit of Spirit named, Let's Think question + display instructions, materials checklist, daily resources checklist
2. DISCOVERY CIRCLE: opening Fruitful Moment with full script, Let's Think review with teacher language, Heart Moment with exact script + scripture ≤10 words, main activity with 6-8 numbered steps + exact quoted language, transition Fruitful Moment
3. CHOICE TIME: 3 interest areas with setup + teacher language, Signs of Learning box with NAEYC objective + Circle of Friends social scenario with exact CD-informed language, Fruit of Spirit observation
4. STORY GATHERING: specific book title + author, Before/During (2-3 pauses)/After with exact teacher scripts, vocabulary carry-forward
5. SKILL BUILDERS PRIMARY: named activity, NAEYC objective, 5+ steps, teaching sequence TABLE with all 4 stages, multilingual learners section, including all children section, 3 observation questions
6. SKILL BUILDERS ADDITIONAL: named activity, objective, teaching sequence TABLE with all 4 stages
7. FRUITFUL MOMENT TRANSITION: complete script + NAEYC objective + 2 observation questions
8. OUTDOOR TIME: named activity, full instructions, teaching sequence TABLE with all 4 stages, Heart Moment connection, accommodations
9. REFLECTION TIME: Fruitful Moment to gather, learning reflection with exact language, Circle of Friends closing ritual fully scripted, Heart Moment closing, Family Connection with conversation starter
10. TEACHER'S HEART: exactly 3 reflective questions referencing today's Fruit of Spirit

QUALITY CHECKS:
- Teacher language must be in quotes throughout (not just described)
- Heart Moment appears at minimum 4 touchpoints across the day
- Fruit of Spirit woven naturally throughout — not just mentioned once
- Prior day learning referenced by name in at least one place
- Teaching sequence tables have all 4 stages: what you do + exact language
- Circle of Friends language is warm, restorative, never punitive
- Faith is invitational and wonder-based, never coercive

SCORING: Each of the 10 sections = 10 points. Quality checks = up to 10 bonus points deducted for failures.
Perfect score = 100. Auto-approve threshold = 100 only.

Return this exact JSON structure:
{
  "score": 0-100,
  "passed": true/false,
  "section_scores": {
    "header_block": 0-10,
    "discovery_circle": 0-10,
    "choice_time": 0-10,
    "story_gathering": 0-10,
    "skill_builders_primary": 0-10,
    "skill_builders_additional": 0-10,
    "fruitful_moment_transition": 0-10,
    "outdoor_time": 0-10,
    "reflection_time": 0-10,
    "teachers_heart": 0-10
  },
  "forbidden_terms_found": [],
  "missing_elements": [],
  "revision_notes": "Specific, actionable notes telling the generator exactly what to fix. Be precise — name the section and what is missing or wrong.",
  "strengths": "What was done well — 2-3 sentences."
}`;

async function reviewLesson(content, dayInfo) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: REVIEWER_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Review this Daily Learning Experience for Day ${dayInfo.day_number} (${dayInfo.focus}, Age Band: ${dayInfo.age_band}):\n\n${content}`
      }]
    })
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return { score: 0, passed: false, revision_notes: 'Reviewer could not parse the lesson.', missing_elements: ['Parse error'] };
  }
}

// ============================================================
// GENERATE SYSTEM PROMPT (imported from generate.js logic)
// ============================================================
const FF_SYSTEM_PROMPT = `You are the Faithful Foundations curriculum generator for The Children's Center (TCC), a faith-based early childhood program. Your role is to generate complete, detailed Daily Learning Experiences that integrate three frameworks seamlessly:

1. Academic Structure — investigation-based, play-centered learning aligned to NAEYC developmental domains
2. Social-Emotional Culture — Conscious Discipline principles woven naturally into teacher language (never referenced by name)
3. Faith Foundation — Fruits of the Spirit as living values; children are God's beloved creations with inherent worth

TCC's Core Vision: Every child is safe, valued, and known. Relationship is the heart of everything. The classroom is a Circle of Friends.

NAEYC DOMAINS: Social & Emotional Development (SE), Physical Development & Health (PD), Language & Literacy (LL), Cognitive Development (CD), Creative Arts (CA)

NAMING — always use ONLY these terms:
- Faithful Foundations | Exploring [Topic] | Daily Learning Experience | Discovery Circle
- Choice Time | Story Gathering | Skill Builders | Outdoor Time | Reflection Time
- Fruitful Moments | Heart Moment | Signs of Learning | Peace Corner | Circle of Friends
- Let's Think | Not Yet Observed / Emerging / Developing / Mastering

NEVER use: Creative Curriculum, Mighty Minutes, Read-Aloud, Small Group, ITE, Safe Place, School Family, Question of the Day, Yellow/Green/Blue/Purple, Conscious Discipline (named)

MEALTIME PRAYER — include in Reflection Time. Rotate through these prayers by day:
Day 1,6,11,16,21: "For food to eat and friends so dear, / For loving hands that brought it here, / For eyes to see and hearts that sing, / We thank You, God, for everything. Amen."
Day 2,7,12,17,22: "God is great, God is good, / Let us thank Him for our food. / By His hands we all are fed, / Give us, Lord, our daily bread. Amen."
Day 3,8,13,18,23: "Little seeds grow big and tall, / God takes care of one and all. / Thank You for this food today, / Bless our friends as we eat and play. Amen."
Day 4,9,14,19,24: "Thank You for the trees so tall, / Thank You for the rain that falls, / Thank You for the food we eat, / Every bite is made complete. Amen."
Day 5,10,15,20,25: "Gentle hands and thankful hearts, / Bless this food before we start. / Thank You, God, for loving care, / Blessings on the food we share. Amen."

GENERATE ALL 10 SECTIONS COMPLETELY:
1. HEADER BLOCK: vocabulary + child-friendly definition + Spanish, Fruit of Spirit, Let's Think + exact display instructions, materials checklist, daily resources checklist
2. DISCOVERY CIRCLE: opening Fruitful Moment (full script), Let's Think review (exact language), Heart Moment (exact script + scripture ≤10 words), main activity (6-8 steps exact language), transition Fruitful Moment
3. CHOICE TIME: 3 interest areas (setup + teacher language), Signs of Learning (NAEYC objective + Circle of Friends scenario exact language + Fruit of Spirit watch)
4. STORY GATHERING: real book + author, Before/During (2-3 pauses)/After exact scripts, vocabulary carry-forward
5. SKILL BUILDERS PRIMARY: named activity, NAEYC objective, 5+ steps, teaching sequence TABLE all 4 stages, multilingual learners, including all children, 3 observation questions
6. SKILL BUILDERS ADDITIONAL: named activity, objective, teaching sequence TABLE all 4 stages
7. FRUITFUL MOMENT TRANSITION: complete script + NAEYC objective + 2 observation questions
8. OUTDOOR TIME: named activity, full instructions, teaching sequence TABLE all 4 stages, Heart Moment connection, accommodations
9. REFLECTION TIME: Fruitful Moment to gather, learning reflection exact language, Circle of Friends closing ritual fully scripted, Heart Moment closing, mealtime prayer (rotate by day), Family Connection with conversation starter
10. TEACHER'S HEART: exactly 3 reflective questions referencing today's Fruit of Spirit

Write EVERYTHING fully. Teacher language always in quotes.`;

async function generateLessonContent(lessonData) {
  const ageBandDescriptions = {
    'infant_toddler': 'Infant/Toddler (0–18 months) — nonmobile to early walkers, preverbal to first words, learning through sensory experience, caregiver relationship is everything',
    'older_toddler': 'Older Toddler (18–30 months) — active movers, emerging language, parallel play, 2–5 minute attention spans, routine is security',
    'preschool': 'Preschool (2½–4 years) — curious investigators, expanding vocabulary, beginning cooperative play, 10–15 minute group times',
    'prek': 'Pre-K (4–5 years) — kindergarten preparation, longer attention, emerging literacy and math, complex play, peer relationships central'
  };

  const userMessage = `Generate a complete Daily Learning Experience for:

EXPLORATION: ${lessonData.exploration_title}
WEEKLY QUESTION: ${lessonData.weekly_question}
DAY: ${lessonData.day_number} of 25 (Week ${lessonData.week_number}, ${lessonData.day_type})
TODAY'S FOCUS: ${lessonData.focus}
FRUIT OF THE SPIRIT THIS WEEK: ${lessonData.fruit_of_spirit}
AGE BAND: ${ageBandDescriptions[lessonData.age_band] || lessonData.age_band}
VOCABULARY WORD: ${lessonData.vocabulary_word}
LET'S THINK: ${lessonData.lets_think}
REQUIRED BOOK: ${lessonData.required_book ? JSON.stringify(lessonData.required_book) : 'Teacher selects'}
MEALTIME PRAYER FOR TODAY: ${MEALTIME_PRAYERS[(lessonData.day_number - 1) % 5].text}

CONTINUITY CONTEXT:
${lessonData.continuity_context || 'This is the first day of the exploration.'}

${lessonData.revision_notes ? `REVISION REQUIRED — Previous attempt failed review. Fix these specific issues:\n${lessonData.revision_notes}` : ''}

${lessonData.day_type === 'introduction' ? 'SPECIAL: Day 1 Introduction — include full learning area tour, introduce Class Tree Journal, Wonder Wall, and Tree Parts poster.' : ''}

Generate the COMPLETE Daily Learning Experience. Every section. Every word. Full teaching sequences for all 4 stages.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: FF_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error('API error: ' + (data.error?.message || JSON.stringify(data.error) || 'Unknown error'));
  }
  if (!data.content?.[0]?.text) {
    throw new Error('Empty response from API. Type: ' + data.type + ' Stop reason: ' + data.stop_reason);
  }
  return data.content[0].text;
}

// ============================================================
// BATCH JOB TRACKING (in-memory for now)
// ============================================================
const batchJobs = {};

// ============================================================
// ROUTES
// ============================================================

// Start a batch generation job
router.post('/batch', requireAdmin, async (req, res) => {
  const {
    exploration_id, age_band, days, exploration_title,
    scope_sequence // array of day objects from frontend
  } = req.body;

  const jobId = uuidv4();
  const dayList = days || Array.from({ length: 20 }, (_, i) => i + 1);

  batchJobs[jobId] = {
    id: jobId,
    exploration_id,
    age_band,
    total: dayList.length,
    completed: 0,
    approved: 0,
    flagged: 0,
    failed: 0,
    status: 'running',
    log: [],
    started_at: new Date().toISOString()
  };

  res.json({ job_id: jobId, message: `Batch job started for ${dayList.length} lessons` });

  // Run async — don't await
  runBatchJob(jobId, exploration_id, age_band, dayList, scope_sequence, exploration_title);
});

// Get batch job status
router.get('/batch/:jobId', requireAdmin, (req, res) => {
  const job = batchJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Get all recent batch jobs
router.get('/batch', requireAdmin, (req, res) => {
  const jobs = Object.values(batchJobs).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  res.json(jobs);
});

async function runBatchJob(jobId, explorationId, ageBand, dayList, scopeSequence, explorationTitle) {
  const job = batchJobs[jobId];

  for (const dayNum of dayList) {
    const dayData = scopeSequence?.find(d => d.day === dayNum);
    if (!dayData) {
      job.log.push({ day: dayNum, status: 'skipped', note: 'No scope data for this day' });
      job.failed++;
      job.completed++;
      continue;
    }

    job.log.push({ day: dayNum, status: 'generating', note: 'Generating...' });

    let content = null;
    let reviewResult = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        // Generate
        content = await generateLessonContent({
          ...dayData,
          exploration_id: explorationId,
          exploration_title: explorationTitle || 'Exploring Trees',
          age_band: ageBand,
          revision_notes: attempts > 1 ? reviewResult?.revision_notes : null
        });

        if (!content) throw new Error('Empty content from generator');

        // Review
        reviewResult = await reviewLesson(content, { day_number: dayNum, focus: dayData.focus, age_band: ageBand });

        if (reviewResult.passed && reviewResult.score === 100) {
          // Perfect score — auto-approve
          const lessonId = uuidv4();
          await pool.query(`
            INSERT INTO daily_lessons
              (id, exploration_id, day_number, week_number, day_type, age_band, focus,
               fruit_of_spirit, vocabulary_word, lets_think, required_book, content,
               status, mary_notes, generation_prompt, continuity_notes, approved_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
            ON CONFLICT (exploration_id, day_number, age_band)
            DO UPDATE SET content=$12, status=$13, mary_notes=$14, approved_at=NOW()
          `, [
            lessonId, explorationId, dayNum, dayData.week, dayData.type,
            ageBand, dayData.focus, dayData.fruit_of_spirit || '',
            dayData.vocab || '', dayData.letsThink || '',
            dayData.book ? JSON.stringify(dayData.book) : null,
            content, 'approved',
            `Auto-approved. Score: ${reviewResult.score}/100. Strengths: ${reviewResult.strengths}`,
            JSON.stringify({ attempt: attempts, score: reviewResult.score }),
            dayData.continuity || null
          ]);

          job.log[job.log.length - 1] = {
            day: dayNum, status: 'approved',
            note: `Score: ${reviewResult.score}/100 on attempt ${attempts}. Auto-approved.`,
            score: reviewResult.score
          };
          job.approved++;
          break;

        } else {
          // Didn't pass — log and retry
          job.log[job.log.length - 1] = {
            day: dayNum, status: attempts < maxAttempts ? 'retrying' : 'flagged',
            note: `Attempt ${attempts}: Score ${reviewResult.score}/100. ${reviewResult.revision_notes}`,
            score: reviewResult.score
          };
        }

      } catch (err) {
        job.log[job.log.length - 1] = {
          day: dayNum, status: 'error', note: `Attempt ${attempts} error: ${err.message}`
        };
      }

      // Small delay between attempts
      await new Promise(r => setTimeout(r, 3000));
    }

    // After max attempts — save as draft for Mary's review if not approved
    if (!reviewResult?.passed || reviewResult.score < 100) {
      if (content) {
        const lessonId = uuidv4();
        try {
          await pool.query(`
            INSERT INTO daily_lessons
              (id, exploration_id, day_number, week_number, day_type, age_band, focus,
               fruit_of_spirit, vocabulary_word, lets_think, required_book, content,
               status, mary_notes, generation_prompt, continuity_notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            ON CONFLICT (exploration_id, day_number, age_band)
            DO UPDATE SET content=$12, status=$13, mary_notes=$14
          `, [
            lessonId, explorationId, dayNum, dayData.week, dayData.type,
            ageBand, dayData.focus, dayData.fruit_of_spirit || '',
            dayData.vocab || '', dayData.letsThink || '',
            dayData.book ? JSON.stringify(dayData.book) : null,
            content, 'draft',
            `Needs Mary's review. Best score: ${reviewResult?.score || 0}/100 after ${attempts} attempts. Issues: ${reviewResult?.revision_notes || 'Unknown'}`,
            JSON.stringify({ attempts, final_score: reviewResult?.score }),
            dayData.continuity || null
          ]);
        } catch (dbErr) {
          job.log[job.log.length - 1].note += ` | DB save error: ${dbErr.message}`;
        }
      }
      job.flagged++;
    }

    job.completed++;
    // Delay between lessons to avoid rate limits
    await new Promise(r => setTimeout(r, 5000));
  }

  job.status = 'complete';
  job.completed_at = new Date().toISOString();
}

module.exports = router;
module.exports.MEALTIME_PRAYERS = MEALTIME_PRAYERS;
