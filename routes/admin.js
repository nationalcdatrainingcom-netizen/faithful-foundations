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

const FF_SYSTEM_PROMPT = `You are the Faithful Foundations curriculum generator for The Children's Center (TCC), a faith-based early childhood program. Your role is to generate complete, detailed Daily Learning Experiences that integrate three frameworks seamlessly:

1. Academic Structure — investigation-based, play-centered learning aligned to NAEYC developmental domains
2. Social-Emotional Culture — Conscious Discipline principles woven naturally into teacher language (never referenced by name)
3. Faith Foundation — Fruits of the Spirit as living values; children are God's beloved creations with inherent worth

TCC's Core Vision: Every child is safe, valued, and known. Relationship is the heart of everything. The classroom is a Circle of Friends.

NAEYC DOMAINS: Social & Emotional Development (SE), Physical Development & Health (PD), Language & Literacy (LL), Cognitive Development (CD), Creative Arts (CA)
Format objectives as: [Domain] — [description]

NAMING — always use ONLY these terms:
- Faithful Foundations | Exploring [Topic] | Daily Learning Experience | Discovery Circle
- Choice Time | Story Gathering | Skill Builders | Outdoor Time | Reflection Time
- Fruitful Moments | Heart Moment | Signs of Learning | Peace Corner | Circle of Friends
- Let's Think | Not Yet Observed / Emerging / Developing / Mastering

NEVER use: Creative Curriculum, Mighty Minutes, Read-Aloud, Small Group, ITE, Safe Place, School Family, Question of the Day, Yellow/Green/Blue/Purple, Michigan Early Learning Standards

GENERATE ALL 10 SECTIONS COMPLETELY — no placeholders, no abbreviations:

1. HEADER BLOCK: vocabulary + child-friendly definition + Spanish, Fruit of Spirit, Let's Think + exact display instructions, materials checklist, daily resources checklist

2. DISCOVERY CIRCLE:
- Opening Fruitful Moment: name + complete chant/song/game text + numbered steps + exact teacher language
- Let's Think review: exact teacher language
- Heart Moment: exact 3-5 sentence script + wonder question + scripture ≤10 words paraphrased
- Main activity: named title + 6-8 numbered steps with exact quoted language + bold vocabulary + partner talk + prior learning connection + Choice Time setup
- Transition Fruitful Moment: complete script

3. CHOICE TIME: 3 interest areas (materials + setup + teacher language). Two Signs of Learning boxes (NAEYC objective + what it looks like + Circle of Friends social scenario with exact CD-informed language; and Fruit of Spirit watch with exact language)

4. STORY GATHERING: real book title + author, NAEYC objective, strategy name, Before/During (2-3 pauses)/After exact scripts, vocabulary carry-forward

5. SKILL BUILDERS PRIMARY: named activity + area + NAEYC objective + What's happening summary + materials + 5+ steps + teaching sequence TABLE (all 4 stages: what you do + exact language) + multilingual learners (3 items) + including all children (3 items) + 3 observation questions with objectives

6. SKILL BUILDERS ADDITIONAL: named activity + objective + materials + 4+ steps + teaching sequence TABLE all 4 stages

7. FRUITFUL MOMENT TRANSITION: complete script + NAEYC objective + 2 observation questions

8. OUTDOOR TIME: named activity + NAEYC objective + materials + full instructions + teaching sequence TABLE all 4 stages + Heart Moment connection + multilingual + inclusion accommodations

9. REFLECTION TIME: named Fruitful Moment to gather + learning reflection with exact language + Circle of Friends closing ritual fully written + Heart Moment closing 2-3 sentences + Family Connection with conversation starter

10. TEACHER'S HEART: 3 reflective questions referencing today's Fruit of Spirit

CONSCIOUS DISCIPLINE embedded throughout (never named): brain state awareness, positive intent, choices not demands, empathy before behavior, describe-don't-judge encouragement, Peace Corner as positive choice

FAITH: Heart Moment at 4 touchpoints. Wonder-based, invitational, never coercive.

Write EVERYTHING fully. Teacher language always in quotes. Rich enough to teach directly from.`;

router.post('/lesson', requireAdmin, async (req, res) => {
  const {
    exploration_id, day_number, week_number, day_type, age_band,
    focus, fruit_of_spirit, vocabulary_word, lets_think, required_book,
    weekly_question, exploration_title, continuity_context,
    previous_days_summary, anchor_materials
  } = req.body;

  // Build age-appropriate context
  const ageBandDescriptions = {
    'infant_toddler': 'Infant/Toddler (0–18 months) — nonmobile to early walkers, preverbal to first words, learning through sensory experience, caregiver relationship is everything',
    'older_toddler': 'Older Toddler (18–30 months) — active movers, emerging language, parallel play, 2–5 minute attention spans, routine is security',
    'preschool': 'Preschool (2½–4 years) — curious investigators, expanding vocabulary, beginning cooperative play, 10–15 minute group times',
    'prek': 'Pre-K (4–5 years) — kindergarten preparation, longer attention, emerging literacy and math, complex play, peer relationships central'
  };

  const userMessage = `Generate a complete Daily Learning Experience for:

EXPLORATION: ${exploration_title}
WEEKLY QUESTION: ${weekly_question}
DAY: ${day_number} of 25 (Week ${week_number}, ${day_type})
TODAY'S FOCUS: ${focus}
FRUIT OF THE SPIRIT THIS WEEK: ${fruit_of_spirit}
AGE BAND: ${ageBandDescriptions[age_band] || age_band}
VOCABULARY WORD: ${vocabulary_word}
LET'S THINK: ${lets_think}
REQUIRED BOOK: ${required_book ? JSON.stringify(required_book) : 'Teacher selects appropriate book'}

CONTINUITY CONTEXT — what has happened before today:
${continuity_context || 'This is the first day of the exploration.'}

PREVIOUS DAYS SUMMARY:
${previous_days_summary || 'N/A'}

ANCHOR MATERIALS IN USE:
${anchor_materials || 'How to Describe a Tree chart, Class Tree Journal, Wonder Wall, Tree Parts poster'}

${day_type === 'introduction' ? `
SPECIAL INSTRUCTION — THIS IS DAY 1 (INTRODUCTION DAY):
- Include a complete tour of all newly set-up learning areas
- Introduce the exploration topic with wonder and excitement
- Introduce the Class Tree Journal and Wonder Wall
- Use language that welcomes children into something new and exciting
- The Heart Moment should establish this exploration as a gift from God to discover
` : ''}

Generate the COMPLETE Daily Learning Experience. Every section. Every word. Full teaching sequences for all 4 stages. Do not skip or abbreviate anything.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8000,
        system: FF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    if (!data.content?.[0]?.text) {
      return res.status(500).json({ error: 'AI generation failed', details: data });
    }

    const content = data.content[0].text;

    // Save to database
    const lessonId = uuidv4();
    await pool.query(`
      INSERT INTO daily_lessons 
        (id, exploration_id, day_number, week_number, day_type, age_band, focus, 
         fruit_of_spirit, vocabulary_word, lets_think, required_book, content, 
         status, generation_prompt, continuity_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (exploration_id, day_number, age_band) 
      DO UPDATE SET content = $12, status = 'draft', generation_prompt = $14
    `, [
      lessonId, exploration_id, day_number, week_number, day_type, age_band,
      focus, fruit_of_spirit, vocabulary_word, lets_think,
      required_book ? JSON.stringify(required_book) : null,
      content, 'draft',
      JSON.stringify({ model: 'claude-opus-4-5', focus, fruit_of_spirit, age_band }),
      continuity_context || null
    ]);

    res.json({ success: true, lesson_id: lessonId, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
