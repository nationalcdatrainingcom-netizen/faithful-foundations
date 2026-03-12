const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Michigan Early Learning Standards domains
const MICHIGAN_STANDARDS = `
Michigan Early Learning Standards (Birth to Kindergarten):
- Social-Emotional Development: Self-regulation, relationships, social skills
- Physical Development & Health: Gross motor, fine motor, health/safety
- Language & Literacy: Listening/speaking, phonological awareness, print concepts, writing
- Cognitive Development & General Knowledge: Math (counting, patterns, geometry, measurement), Science (inquiry, earth science, life science), Social Studies (self/family/community, history, geography), Creative Arts (visual art, music, drama, movement)
- Approaches to Learning: Initiative, curiosity, persistence, creativity, problem-solving
`;

const INTEREST_AREAS = [
  'Blocks', 'Dramatic Play', 'Toys & Games', 'Art', 'Library/Book Corner',
  'Discovery/Science', 'Sand & Water', 'Music & Movement', 'Cooking/Sensory',
  'Technology/Computers', 'Outdoors'
];

function getAgeGroupLabel(youngestMonths, oldestMonths) {
  if (oldestMonths <= 12) return 'Infant';
  if (oldestMonths <= 36) return youngestMonths < 12 ? 'Infant/Toddler' : 'Toddler';
  if (oldestMonths <= 48) return youngestMonths <= 36 ? 'Toddler/Preschool' : 'Preschool';
  return youngestMonths <= 48 ? 'Preschool/Pre-K' : 'Pre-K';
}

function getMonthName(monthNum) {
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  return months[monthNum - 1];
}

function buildSystemPrompt(youngestMonths, oldestMonths, ageGroupLabel) {
  return `You are an expert early childhood curriculum developer for The Children's Center (TCC), a licensed childcare organization in Michigan. You create original, research-based curriculum content that closely mirrors the structure and philosophy of Teaching Strategies Creative Curriculum but uses entirely original content.

CLASSROOM PROFILE:
- Youngest child: ${youngestMonths} months old
- Oldest child: ${oldestMonths} months old  
- Age group: ${ageGroupLabel}
- All content must be developmentally appropriate for this FULL range

CURRICULUM PHILOSOPHY (mirror Creative Curriculum approach):
- Study-based, project approach learning
- Child-initiated and teacher-supported exploration
- Learning through play in defined interest areas
- Whole child development across all domains
- Intentional teaching with clear objectives
- Interest areas: ${INTEREST_AREAS.join(', ')}

STANDARDS ALIGNMENT:
${MICHIGAN_STANDARDS}

DIFFERENTIATION REQUIREMENT:
Every activity must include differentiation:
- "For younger children (${youngestMonths} months)" — simpler version
- "For older children (${oldestMonths} months)" — extended/enriched version

TONE: Warm, practical, teacher-ready. Write as if speaking directly to a classroom teacher. Activities should require only common classroom materials.

RESPOND ONLY WITH VALID JSON. No markdown, no preamble, no explanation outside the JSON structure.`;
}

// Generate Monthly Overview
app.post('/api/generate/monthly', async (req, res) => {
  const { youngestMonths, oldestMonths, month, year, classroomName } = req.body;
  const ageGroupLabel = getAgeGroupLabel(youngestMonths, oldestMonths);
  const monthName = getMonthName(month);

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: buildSystemPrompt(youngestMonths, oldestMonths, ageGroupLabel),
      messages: [{
        role: 'user',
        content: `Generate a Monthly Curriculum Overview for ${monthName} ${year} for a ${ageGroupLabel} classroom${classroomName ? ` called "${classroomName}"` : ''}.

Return this exact JSON structure:
{
  "month": "${monthName} ${year}",
  "ageGroup": "${ageGroupLabel}",
  "studyTheme": "string - the main study/theme for the month (seasonal, nature-based, or concept-based)",
  "studyRationale": "string - 2-3 sentences why this study is developmentally appropriate for this age and season",
  "bigIdeas": ["string", "string", "string"] - 3 big conceptual ideas children will explore,
  "domainGoals": {
    "socialEmotional": "string - what children will develop",
    "physical": "string - what children will develop", 
    "languageLiteracy": "string - what children will develop",
    "cognitive": "string - what children will develop",
    "approachesToLearning": "string - what children will develop"
  },
  "vocabulary": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8"],
  "suggestedBooks": [
    {"title": "string", "author": "string", "connection": "string"},
    {"title": "string", "author": "string", "connection": "string"},
    {"title": "string", "author": "string", "connection": "string"}
  ],
  "environmentSetup": {
    "blocks": "string - how to set up this interest area for the study",
    "dramaticPlay": "string",
    "art": "string",
    "library": "string",
    "discovery": "string",
    "outdoors": "string"
  },
  "familyEngagement": {
    "monthlyLetter": "string - 3-4 sentence letter to families about the study",
    "homeActivities": ["string", "string", "string"]
  },
  "weeks": [
    {"weekNumber": 1, "weekFocus": "string - specific focus within the study"},
    {"weekNumber": 2, "weekFocus": "string"},
    {"weekNumber": 3, "weekFocus": "string"},
    {"weekNumber": 4, "weekFocus": "string"}
  ]
}`
      }]
    });

    const text = response.content[0].text;
    const data = JSON.parse(text);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate Weekly Lesson Plan
app.post('/api/generate/weekly', async (req, res) => {
  const { youngestMonths, oldestMonths, month, year, weekNumber, studyTheme, weekFocus, classroomName } = req.body;
  const ageGroupLabel = getAgeGroupLabel(youngestMonths, oldestMonths);
  const monthName = getMonthName(month);

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 5000,
      system: buildSystemPrompt(youngestMonths, oldestMonths, ageGroupLabel),
      messages: [{
        role: 'user',
        content: `Generate a Weekly Lesson Plan for Week ${weekNumber} of ${monthName} ${year}.
Study Theme: "${studyTheme}"
Week Focus: "${weekFocus}"
Classroom: ${classroomName || ageGroupLabel + ' Classroom'}

Return this exact JSON structure:
{
  "week": "Week ${weekNumber} - ${monthName} ${year}",
  "studyTheme": "${studyTheme}",
  "weekFocus": "${weekFocus}",
  "ageGroup": "${ageGroupLabel}",
  "classroomName": "${classroomName || ''}",
  "weeklyObjectives": ["string", "string", "string", "string"],
  "weeklyVocabulary": ["word1", "word2", "word3", "word4"],
  "materials": ["item1", "item2", "item3", "item4", "item5", "item6"],
  "days": [
    {
      "day": "Monday",
      "morningMeeting": {
        "greetingSong": "string - name/description of greeting",
        "calendarActivity": "string",
        "mightyMinuteActivity": "string - short engaging circle activity title and brief description",
        "readAloud": "string - book title and brief discussion question"
      },
      "smallGroup": {
        "activityName": "string",
        "objective": "string - Michigan standard reference",
        "materials": ["item1", "item2"],
        "instructions": "string - step by step",
        "youngerChildren": "string - adaptation",
        "olderChildren": "string - extension"
      },
      "interestAreas": [
        {"area": "string", "activity": "string", "materials": "string"},
        {"area": "string", "activity": "string", "materials": "string"},
        {"area": "string", "activity": "string", "materials": "string"}
      ],
      "outdoorActivity": "string",
      "familyEngagementTip": "string"
    },
    {"day": "Tuesday", "morningMeeting": {}, "smallGroup": {}, "interestAreas": [], "outdoorActivity": "", "familyEngagementTip": ""},
    {"day": "Wednesday", "morningMeeting": {}, "smallGroup": {}, "interestAreas": [], "outdoorActivity": "", "familyEngagementTip": ""},
    {"day": "Thursday", "morningMeeting": {}, "smallGroup": {}, "interestAreas": [], "outdoorActivity": "", "familyEngagementTip": ""},
    {"day": "Friday", "morningMeeting": {}, "smallGroup": {}, "interestAreas": [], "outdoorActivity": "", "familyEngagementTip": ""}
  ]
}`
      }]
    });

    const text = response.content[0].text;
    const data = JSON.parse(text);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate Daily Plan
app.post('/api/generate/daily', async (req, res) => {
  const { youngestMonths, oldestMonths, month, year, weekNumber, dayName, studyTheme, weekFocus, classroomName } = req.body;
  const ageGroupLabel = getAgeGroupLabel(youngestMonths, oldestMonths);
  const monthName = getMonthName(month);

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: buildSystemPrompt(youngestMonths, oldestMonths, ageGroupLabel),
      messages: [{
        role: 'user',
        content: `Generate a detailed Daily Classroom Plan for ${dayName}, Week ${weekNumber} of ${monthName} ${year}.
Study Theme: "${studyTheme}"
Week Focus: "${weekFocus}"
Classroom: ${classroomName || ageGroupLabel + ' Classroom'}

Return this exact JSON structure:
{
  "day": "${dayName}",
  "date": "${monthName}, Week ${weekNumber} ${year}",
  "studyTheme": "${studyTheme}",
  "ageGroup": "${ageGroupLabel}",
  "schedule": [
    {
      "time": "7:00 - 8:30 AM",
      "block": "Arrival & Morning Choice Time",
      "teacherRole": "string - what teacher does during this time",
      "environmentNotes": "string - how environment is set up",
      "childrenDoing": "string"
    },
    {
      "time": "8:30 - 9:00 AM", 
      "block": "Morning Meeting / Circle Time",
      "greeting": "string - specific greeting activity",
      "calendar": "string - calendar/weather activity",
      "mightyMinute": {
        "title": "string",
        "fullInstructions": "string - exactly how to lead this activity step by step",
        "materials": "string or none",
        "michiganStandard": "string"
      },
      "readAloud": {
        "bookTitle": "string",
        "beforeReading": "string - engagement question",
        "duringReading": "string - discussion prompt",
        "afterReading": "string - extension activity or question"
      }
    },
    {
      "time": "9:00 - 9:45 AM",
      "block": "Small Group / Intentional Teaching",
      "activityName": "string",
      "fullInstructions": "string - complete step-by-step teacher guide",
      "materials": ["item1", "item2", "item3"],
      "michiganStandard": "string",
      "youngerAdaptation": "string",
      "olderExtension": "string",
      "teacherTalkMoves": ["string - example teacher question/prompt", "string", "string"]
    },
    {
      "time": "9:45 - 11:15 AM",
      "block": "Interest Area Exploration",
      "teacherFocus": "string - which area teacher will intentionally support today and why",
      "interestAreas": [
        {"area": "Blocks", "setup": "string", "invitation": "string - what's set out to invite play", "teacherPrompts": ["string", "string"]},
        {"area": "Dramatic Play", "setup": "string", "invitation": "string", "teacherPrompts": ["string", "string"]},
        {"area": "Art", "setup": "string", "invitation": "string", "teacherPrompts": ["string", "string"]},
        {"area": "Library", "setup": "string", "invitation": "string", "teacherPrompts": ["string", "string"]},
        {"area": "Discovery/Science", "setup": "string", "invitation": "string", "teacherPrompts": ["string", "string"]}
      ]
    },
    {
      "time": "11:15 - 11:45 AM",
      "block": "Outdoor Time",
      "activityName": "string",
      "description": "string - full outdoor activity description",
      "studyConnection": "string - how it connects to the study theme",
      "safetyNote": "string if applicable, else null"
    },
    {
      "time": "11:45 AM - 12:30 PM",
      "block": "Lunch & Cleanup",
      "conversationStarters": ["string", "string"],
      "vocabularyPractice": "string - how to weave vocabulary into mealtime"
    },
    {
      "time": "12:30 - 2:30 PM",
      "block": "Rest Time",
      "transitionActivity": "string - quiet activity to settle children",
      "teacherTasks": "string - documentation or prep during rest"
    },
    {
      "time": "2:30 - 3:30 PM",
      "block": "Afternoon Choice & Small Group",
      "activity": "string",
      "description": "string"
    },
    {
      "time": "3:30 - 6:00 PM",
      "block": "Afternoon / Dismissal",
      "activity": "string",
      "familyEngagementTip": "string - specific tip for families today",
      "conversationStarter": "string - what teacher can share with families at pickup"
    }
  ],
  "teacherReflection": {
    "endOfDayPrompts": ["string - reflection question", "string", "string"],
    "observationFocus": "string - what to watch for and document today",
    "tomorrowPrep": "string - one thing to prepare for tomorrow"
  }
}`
      }]
    });

    const text = response.content[0].text;
    const data = JSON.parse(text);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TCC Curriculum app running on port ${PORT}`));
