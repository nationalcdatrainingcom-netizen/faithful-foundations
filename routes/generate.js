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

const FF_SYSTEM_PROMPT = `You are the Faithful Foundations curriculum generator for The Children's Center (TCC), a faith-based early childhood program. Generate complete, detailed Daily Learning Experiences integrating:
1. Academic Structure — investigation-based, play-centered, NAEYC domains
2. Social-Emotional Culture — Conscious Discipline principles woven in (never named)
3. Faith Foundation — Fruits of the Spirit as living values

NAMING — always use ONLY: Faithful Foundations | Exploring [Topic] | Daily Learning Experience | Discovery Circle | Choice Time | Story Gathering | Skill Builders | Outdoor Time | Reflection Time | Fruitful Moments | Heart Moment | Signs of Learning | Peace Corner | Circle of Friends | Let's Think | Bible Storytime | Goodbye Circle | Not Yet Observed / Emerging / Developing / Mastering\n\nSCHEDULE ORDER (for context): Breakfast → Discovery Circle → Choice Time (AM snack available as a center) → Clean Up → Reflection Time → Skill Builders → Outdoor Time → Lunch → Story Gathering → Rest Time → Snack → Bible Storytime → Choice Time → Clean Up → Goodbye Circle

NEVER use: Creative Curriculum, Mighty Minutes, Read-Aloud, Small Group, ITE, Safe Place, School Family, Question of the Day, Yellow/Green/Blue/Purple, Conscious Discipline (named)

NAEYC DOMAINS: SE = Social/Emotional, PD = Physical, LL = Language/Literacy, CD = Cognitive, CA = Creative Arts

Write EVERYTHING fully. Teacher language always in quotes. Rich enough to teach directly from. Heart Moment at 4 touchpoints minimum. Faith is invitational and wonder-based, never coercive.`;

const MEALTIME_PRAYERS = [
  'For food to eat and friends so dear,\nFor loving hands that brought it here,\nFor eyes to see and hearts that sing,\nWe thank You, God, for everything. Amen.',
  'God is great, God is good,\nLet us thank Him for our food.\nBy His hands we all are fed,\nGive us, Lord, our daily bread. Amen.',
  'Little seeds grow big and tall,\nGod takes care of one and all.\nThank You for this food today,\nBless our friends as we eat and play. Amen.',
  'Thank You for the trees so tall,\nThank You for the rain that falls,\nThank You for the food we eat,\nEvery bite is made complete. Amen.',
  'Gentle hands and thankful hearts,\nBless this food before we start.\nThank You, God, for loving care,\nBlessings on the food we share. Amen.'
];

const AGE_BANDS = {
  'infant_toddler': 'Infant/Toddler (0-18 months) — nonmobile to early walkers, preverbal, sensory learning, caregiver relationship is everything',
  'older_toddler': 'Older Toddler (18-30 months) — active movers, emerging language, parallel play, 2-5 minute attention spans',
  'preschool': 'Preschool (2.5-4 years) — curious investigators, expanding vocabulary, beginning cooperative play, 10-15 minute group times',
  'prek': 'Pre-K (4-5 years) — kindergarten preparation, longer attention, emerging literacy and math, complex play'
};

async function callAPI(userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
    body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 8000, system: FF_SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] })
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('API error: ' + (data.error && data.error.message || JSON.stringify(data)));
  if (!data.content || !data.content[0] || !data.content[0].text) throw new Error('Empty API response: ' + JSON.stringify(data));
  return data.content[0].text;
}

function buildContext(p) {
  return 'EXPLORATION: ' + (p.exploration_title || 'Exploring Trees') + '\n' +
    'WEEKLY QUESTION: ' + (p.weekly_question || '') + '\n' +
    'DAY: ' + (p.day_number || p.day) + ' of 25 (Week ' + (p.week_number || p.week) + ', ' + (p.day_type || p.type) + ')\n' +
    'FOCUS: ' + p.focus + '\n' +
    'FRUIT OF THE SPIRIT: ' + (p.fruit_of_spirit || '') + '\n' +
    'AGE BAND: ' + (AGE_BANDS[p.age_band] || p.age_band) + '\n' +
    'VOCABULARY WORD: ' + (p.vocabulary_word || p.vocab || '') + '\n' +
    "LET'S THINK: " + (p.lets_think || p.letsThink || '') + '\n' +
    'BOOK: ' + (p.required_book ? JSON.stringify(p.required_book) : (p.book ? JSON.stringify(p.book) : 'Teacher selects')) + '\n' +
    'CONTINUITY: ' + (p.continuity_context || p.continuity || 'First day of exploration.') + '\n' +
    ((p.day_type || p.type) === 'introduction' ? 'SPECIAL DAY 1: Include full learning area tour, introduce Class Tree Journal, Wonder Wall, Tree Parts poster.\n' : '') +
    (p.revision_notes ? 'REVISION NEEDED: ' + p.revision_notes + '\n' : '');
}

async function generateTwoPart(params) {
  const ctx = buildContext(params);
  const prayer = MEALTIME_PRAYERS[((parseInt(params.day_number || params.day) || 1) - 1) % 5];

  // PART 1 — sections 1-5
  const part1msg = ctx + '\n\nGenerate PART 1 of this Daily Learning Experience — sections 1 through 5 ONLY:\n\n## 1. HEADER BLOCK\nVocabulary + child-friendly definition + Spanish translation, Fruit of Spirit, Lets Think question + display instructions, materials checklist, daily resources checklist\n\n## 2. DISCOVERY CIRCLE\nOpening Fruitful Moment (full script with name + complete text + numbered steps), Lets Think review (exact language), Heart Moment (exact 3-5 sentence script + wonder question + scripture 10 words or fewer), Main activity (named + 6-8 steps exact language + vocabulary + partner talk + prior learning + Choice Time setup), Transition Fruitful Moment (complete script)\n\n## 3. CHOICE TIME\n3 interest areas (materials + setup + teacher language). Signs of Learning (NAEYC objective + Circle of Friends scenario exact language). Fruit of Spirit observation.\n\n## 4. STORY GATHERING\nReal book title + author, NAEYC objective, Before/During (2-3 pauses)/After exact scripts, vocabulary carry-forward\n\n## 5. SKILL BUILDERS PRIMARY\nNamed activity + NAEYC objective + materials + 5+ steps + teaching sequence TABLE with all 4 stages (stage name | what teacher does | exact teacher language) + multilingual learners (3 strategies) + including all children (3 strategies) + 3 observation questions';

  const part1 = await callAPI(part1msg);

  await new Promise(r => setTimeout(r, 2000));

  // PART 2 — sections 6-10
  const part2msg = ctx + '\n\nGenerate PART 2 of this Daily Learning Experience — sections 6 through 10 ONLY:\n\n## 6. SKILL BUILDERS ADDITIONAL\nNamed activity + objective + materials + 4+ steps + teaching sequence TABLE all 4 stages\n\n## 7. FRUITFUL MOMENT TRANSITION\nComplete script + NAEYC objective + 2 observation questions\n\n## 8. OUTDOOR TIME\nNamed activity + NAEYC objective + materials + full instructions + teaching sequence TABLE all 4 stages + Heart Moment connection (exact script) + multilingual strategies + inclusion accommodations\n\n## 9. REFLECTION TIME\nNamed Fruitful Moment to gather (full script), Learning reflection (exact language), Circle of Friends closing ritual (fully scripted), Heart Moment closing (2-3 sentences), Mealtime prayer:\n\n' + prayer + '\n\nFamily Connection with conversation starter\n\n## 10. TEACHERS HEART\nExactly 3 reflective questions referencing today\'s Fruit of Spirit (' + (params.fruit_of_spirit || '') + ')';

  const part2 = await callAPI(part2msg);

  return part1.trim() + '\n\n---\n\n' + part2.trim();
}

// Single lesson route
router.post('/lesson', requireAdmin, async (req, res) => {
  const p = req.body;
  try {
    const content = await generateTwoPart(p);
    const lessonId = uuidv4();
    await pool.query(
      'INSERT INTO daily_lessons (id, exploration_id, day_number, week_number, day_type, age_band, focus, fruit_of_spirit, vocabulary_word, lets_think, required_book, content, status, generation_prompt, continuity_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (exploration_id, day_number, age_band) DO UPDATE SET content=$12, status=\'draft\', generation_prompt=$14',
      [lessonId, p.exploration_id, p.day_number || p.day, p.week_number || p.week, p.day_type || p.type,
       p.age_band, p.focus, p.fruit_of_spirit, p.vocabulary_word || p.vocab,
       p.lets_think || p.letsThink,
       (p.required_book || p.book) ? JSON.stringify(p.required_book || p.book) : null,
       content, 'draft',
       JSON.stringify({ model: 'claude-sonnet-4-5-20250929', focus: p.focus, age_band: p.age_band }),
       p.continuity_context || p.continuity || null]
    );
    res.json({ success: true, lesson_id: lessonId, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.generateTwoPart = generateTwoPart;
module.exports.MEALTIME_PRAYERS = MEALTIME_PRAYERS;
