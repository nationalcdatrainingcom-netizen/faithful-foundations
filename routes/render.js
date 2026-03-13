const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ============================================================
// SECTION COLORS & ICONS
// ============================================================
const SECTION_STYLES = {
  'HEADER BLOCK':           { bg: '#1B4332', accent: '#52B788', icon: '🌳' },
  'DISCOVERY CIRCLE':       { bg: '#1B4332', accent: '#74C69D', icon: '⭕' },
  'CHOICE TIME':            { bg: '#2D6A4F', accent: '#95D5B2', icon: '🎨' },
  'STORY GATHERING':        { bg: '#1B4332', accent: '#52B788', icon: '📖' },
  'SKILL BUILDERS PRIMARY': { bg: '#2D6A4F', accent: '#B7E4C7', icon: '🌱' },
  'SKILL BUILDERS ADDITIONAL': { bg: '#2D6A4F', accent: '#B7E4C7', icon: '✨' },
  'FRUITFUL MOMENT':        { bg: '#F4A261', accent: '#E76F51', icon: '🍎' },
  'OUTDOOR TIME':           { bg: '#2D6A4F', accent: '#95D5B2', icon: '☀️' },
  'REFLECTION TIME':        { bg: '#1B4332', accent: '#52B788', icon: '💛' },
  "TEACHER'S HEART":        { bg: '#774936', accent: '#C4956A', icon: '❤️' },
  'SIGNS OF LEARNING':      { bg: '#4A5568', accent: '#90CDF4', icon: '👁' },
  'CIRCLE OF FRIENDS':      { bg: '#553C9A', accent: '#B794F4', icon: '🤝' },
  'HEART MOMENT':           { bg: '#702459', accent: '#FBB6CE', icon: '✝️' },
  'MATERIALS':              { bg: '#2B6CB0', accent: '#90CDF4', icon: '📋' },
};

// ============================================================
// IMAGE FETCHING
// ============================================================
async function fetchBookCover(title, author) {
  try {
    const query = encodeURIComponent(title + ' ' + author);
    const res = await fetch('https://openlibrary.org/search.json?q=' + query + '&limit=1');
    const data = await res.json();
    if (data.docs && data.docs[0] && data.docs[0].cover_i) {
      return 'https://covers.openlibrary.org/b/id/' + data.docs[0].cover_i + '-M.jpg';
    }
  } catch (e) {}
  return null;
}

async function generateConceptImage(concept, style) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: 'Create a simple SVG illustration of: ' + concept + '. Style: ' + (style || 'child-friendly, colorful, educational, flat design, clean lines') + '. Return ONLY the SVG code starting with <svg, nothing else. Use bright greens, browns, and warm colors. Make it suitable for an early childhood classroom curriculum. Width 400, height 300.'
        }]
      })
    });
    const data = await response.json();
    const svg = data.content && data.content[0] && data.content[0].text;
    if (svg && svg.trim().startsWith('<svg')) return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch (e) {}
  return null;
}

// ============================================================
// MARKDOWN → STRUCTURED HTML PARSER
// ============================================================
function parseAndRenderLesson(markdown, lessonMeta) {
  const lines = markdown.split('\n');
  let html = '';
  let currentSection = null;
  let currentSubsection = null;
  let inTeacherScript = false;
  let inSidebar = false;
  let sidebarContent = '';
  let mainContent = '';
  let fruitfulMoments = [];
  let materialsContent = '';
  let inMaterials = false;

  function closeSection() {
    if (currentSection) {
      if (inSidebar) {
        mainContent += '</div>'; // close main col
        mainContent += '<div class="sidebar-col">' + sidebarContent + '</div>';
        mainContent += '</div>'; // close row
        inSidebar = false;
        sidebarContent = '';
      }
      html += '<div class="section-wrapper">';
      const style = SECTION_STYLES[currentSection] || { bg: '#1B4332', accent: '#52B788', icon: '🌿' };
      html += '<div class="section-header" style="background:' + style.bg + ';border-left:6px solid ' + style.accent + ';">';
      html += '<span class="section-icon">' + style.icon + '</span>';
      html += '<span class="section-title">' + currentSection + '</span>';
      html += '</div>';
      html += '<div class="section-body">' + mainContent + '</div>';
      html += '</div>';
      mainContent = '';
      currentSection = null;
    }
  }

  function renderLine(line) {
    // H1 — lesson title
    if (line.startsWith('# ')) {
      return '<h1 class="lesson-title">' + line.slice(2) + '</h1>';
    }
    // H2 — section headers
    if (line.startsWith('## ')) {
      const title = line.slice(3).replace(/^\d+\.\s*/, '').trim();
      return '__SECTION__' + title;
    }
    // H3 — subsection
    if (line.startsWith('### ')) {
      return '<h3 class="subsection-title">' + line.slice(4) + '</h3>';
    }
    // H4
    if (line.startsWith('#### ')) {
      return '<h4 class="sub-subsection">' + line.slice(5) + '</h4>';
    }
    // Bold line (teacher script cue)
    if (line.match(/^\*\*TEACHER:\*\*/)) {
      return '<div class="teacher-script"><span class="script-label">TEACHER</span><span class="script-text">' + line.replace(/\*\*TEACHER:\*\*\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') + '</span></div>';
    }
    if (line.match(/^\*\*CHILDREN:\*\*/)) {
      return '<div class="children-script"><span class="script-label children-label">CHILDREN</span><span class="script-text">' + line.replace(/\*\*CHILDREN:\*\*\s*/, '') + '</span></div>';
    }
    // Named speaker (e.g. **MASON:** or **SOFIA:**)
    if (line.match(/^\*\*[A-Z][A-Z]+:\*\*/)) {
      const speaker = line.match(/^\*\*([A-Z]+):\*\*/)[1];
      const text = line.replace(/^\*\*[A-Z]+:\*\*\s*/, '');
      return '<div class="child-script"><span class="script-label child-label">' + speaker + '</span><span class="script-text">' + text + '</span></div>';
    }
    // STEP lines
    if (line.match(/^\*\*STEP \d+/)) {
      return '<div class="step-header">' + line.replace(/\*\*(.*?)\*\*/g, '$1') + '</div>';
    }
    // Italic lines (stage directions)
    if (line.match(/^\*[^*]/) && line.match(/\*$/)) {
      return '<p class="stage-direction">' + line.replace(/^\*/, '').replace(/\*$/, '') + '</p>';
    }
    // Bold text inline
    if (line.match(/\*\*/)) {
      return '<p>' + line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') + '</p>';
    }
    // Bullet
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return '<li>' + line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</li>';
    }
    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      return '<li class="numbered">' + line.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</li>';
    }
    // Horizontal rule
    if (line === '---') return '<hr class="section-divider">';
    // Empty line
    if (line.trim() === '') return '';
    // Default paragraph
    return '<p>' + line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') + '</p>';
  }

  // First pass — extract materials block
  let inMatBlock = false;
  let matLines = [];
  let nonMatLines = [];
  for (const line of lines) {
    if (line.match(/^## .*MATERIALS|^## .*PREPARATION|MATERIALS CHECKLIST/i)) {
      inMatBlock = true;
    }
    if (inMatBlock) {
      matLines.push(line);
      if (line.startsWith('## ') && matLines.length > 1) { inMatBlock = false; nonMatLines.push(line); }
    } else {
      nonMatLines.push(line);
    }
  }

  // Detect fruitful moments
  let fruitfulBuffer = [];
  let inFruitful = false;

  // Second pass — build HTML
  let listOpen = false;
  let currentSectionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect FRUITFUL MOMENT blocks for extraction
    if (line.toUpperCase().includes('FRUITFUL MOMENT') && !line.startsWith('#')) {
      inFruitful = true;
      fruitfulBuffer = [line];
      continue;
    }
    if (inFruitful) {
      if (line.startsWith('##') || line.startsWith('---')) {
        if (fruitfulBuffer.length > 2) {
          fruitfulMoments.push(fruitfulBuffer.join('\n'));
        }
        fruitfulBuffer = [];
        inFruitful = false;
      } else {
        fruitfulBuffer.push(line);
        continue;
      }
    }

    // Section detection
    if (line.startsWith('## ')) {
      closeSection();
      currentSection = line.slice(3).replace(/^\d+\.\s*/, '').trim().toUpperCase();
      // Start sidebar layout for CHOICE TIME (has Circle of Friends scenarios)
      if (currentSection.includes('CHOICE TIME')) {
        inSidebar = true;
        mainContent = '<div class="content-row"><div class="main-col">';
        sidebarContent = '<div class="sidebar-card"><div class="sidebar-header">🤝 Circle of Friends Scenarios</div>';
      }
      continue;
    }

    // Route Circle of Friends content to sidebar
    if (inSidebar && line.toUpperCase().includes('CIRCLE OF FRIENDS SCENARIO')) {
      mainContent += '</div>'; // close main col temporarily? No — collect sidebar separately
      // Collect sidebar lines
      sidebarContent += '<div class="cof-scenario">';
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('##') && !lines[j].toUpperCase().includes('NAEYC OBJECTIVE') && j < i + 40) {
        if (lines[j].trim()) sidebarContent += renderLine(lines[j]);
        j++;
      }
      sidebarContent += '</div>';
      i = j - 1;
      continue;
    }

    // Wrap consecutive list items
    const rendered = renderLine(line);
    const isListItem = rendered.startsWith('<li');

    if (isListItem && !listOpen) {
      mainContent += '<ul class="lesson-list">';
      listOpen = true;
    } else if (!isListItem && listOpen) {
      mainContent += '</ul>';
      listOpen = false;
    }

    mainContent += rendered;
  }

  if (listOpen) mainContent += '</ul>';
  closeSection();

  return { html, fruitfulMoments, materialsContent };
}

// ============================================================
// RENDER LESSON AS FULL HTML PAGE
// ============================================================
async function buildLessonPage(lesson) {
  const { html, fruitfulMoments } = parseAndRenderLesson(lesson.content || '', lesson);

  // Try to get book cover
  let bookCoverHtml = '';
  if (lesson.required_book) {
    try {
      const book = typeof lesson.required_book === 'string' ? JSON.parse(lesson.required_book) : lesson.required_book;
      const coverUrl = await fetchBookCover(book.title, book.author);
      if (coverUrl) {
        bookCoverHtml = '<div class="book-cover-widget"><img src="' + coverUrl + '" alt="' + book.title + '" class="book-cover-img"><div class="book-cover-label"><strong>' + book.title + '</strong><br><em>' + book.author + '</em></div></div>';
      }
    } catch (e) {}
  }

  // Generate tree parts SVG concept image
  const treePartsImg = await generateConceptImage('a tree showing labeled parts: trunk, branches, leaves, and roots underground', 'educational diagram, child-friendly, colorful, flat design, earthy greens and browns');

  const fruitfulHTML = fruitfulMoments.length ? fruitfulMoments.map((fm, i) =>
    '<div class="fruitful-card printable-fruitful"><div class="fruitful-card-header">🍎 Fruitful Moment ' + (i + 1) + '</div><div class="fruitful-card-body">' + fm.replace(/\n/g, '<br>') + '</div></div>'
  ).join('') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Faithful Foundations — Day ${lesson.day_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap');

  :root {
    --green-dark: #1B4332;
    --green-mid: #2D6A4F;
    --green-light: #52B788;
    --green-pale: #D8F3DC;
    --gold: #D4A017;
    --gold-light: #FFF3CD;
    --brown: #774936;
    --cream: #FDFAF5;
    --text: #1A1A2E;
    --text-light: #4A5568;
    --border: #E2E8F0;
    --purple: #553C9A;
    --purple-light: #E9D8FD;
    --red: #C53030;
    --red-light: #FFF5F5;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Source Sans 3', sans-serif;
    background: var(--cream);
    color: var(--text);
    font-size: 15px;
    line-height: 1.7;
  }

  /* TOP BAR */
  .lesson-topbar {
    background: var(--green-dark);
    color: white;
    padding: 12px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .lesson-topbar .brand { font-family: 'Playfair Display', serif; font-size: 18px; color: #D8F3DC; }
  .topbar-actions { display: flex; gap: 10px; }
  .btn-topbar {
    padding: 6px 16px; border-radius: 20px; border: none; cursor: pointer;
    font-size: 13px; font-weight: 600; transition: all 0.2s;
  }
  .btn-print { background: var(--gold); color: #1A1A2E; }
  .btn-prep { background: #2D6A4F; color: white; border: 1px solid #52B788; }
  .btn-fruitful { background: #E76F51; color: white; }
  .btn-back { background: transparent; color: #D8F3DC; border: 1px solid #52B788; }

  /* LAYOUT */
  .lesson-container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

  /* LESSON TITLE */
  .lesson-title {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    color: var(--green-dark);
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .lesson-meta {
    display: flex; gap: 16px; flex-wrap: wrap;
    margin-bottom: 32px; padding-bottom: 24px;
    border-bottom: 3px solid var(--green-light);
  }
  .meta-badge {
    background: var(--green-pale); color: var(--green-dark);
    padding: 4px 14px; border-radius: 20px;
    font-size: 13px; font-weight: 600;
  }
  .meta-badge.fruit { background: var(--gold-light); color: var(--brown); }

  /* PREP LINK */
  .prep-link-banner {
    background: #EBF8FF; border: 1px solid #90CDF4;
    border-radius: 10px; padding: 16px 24px;
    margin-bottom: 28px;
    display: flex; align-items: center; gap: 16px;
  }
  .prep-link-icon { font-size: 28px; }
  .prep-link-text { flex: 1; }
  .prep-link-text strong { display: block; color: #2B6CB0; font-size: 15px; }
  .prep-link-text span { font-size: 13px; color: var(--text-light); }
  .prep-btn {
    background: #2B6CB0; color: white; padding: 8px 20px;
    border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;
    border: none; cursor: pointer;
  }

  /* SECTION WRAPPER */
  .section-wrapper {
    margin-bottom: 32px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    page-break-inside: avoid;
  }
  .section-header {
    padding: 14px 24px;
    display: flex; align-items: center; gap: 12px;
    color: white;
  }
  .section-icon { font-size: 22px; }
  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.5px;
  }
  .section-body {
    background: white;
    padding: 24px;
  }

  /* TEACHER SCRIPTS */
  .teacher-script {
    background: var(--green-pale);
    border-left: 4px solid var(--green-light);
    border-radius: 0 8px 8px 0;
    padding: 12px 16px;
    margin: 10px 0;
    display: flex; gap: 12px; align-items: flex-start;
  }
  .script-label {
    background: var(--green-dark); color: white;
    padding: 2px 10px; border-radius: 12px;
    font-size: 11px; font-weight: 700; white-space: nowrap;
    margin-top: 2px; flex-shrink: 0;
  }
  .children-script {
    background: #FFF8E7;
    border-left: 4px solid var(--gold);
    border-radius: 0 8px 8px 0;
    padding: 12px 16px; margin: 10px 0;
    display: flex; gap: 12px; align-items: flex-start;
  }
  .children-label { background: var(--gold); color: #1A1A2E; }
  .child-script {
    background: var(--purple-light);
    border-left: 4px solid var(--purple);
    border-radius: 0 8px 8px 0;
    padding: 10px 16px; margin: 8px 0;
    display: flex; gap: 12px; align-items: flex-start;
  }
  .child-label { background: var(--purple); color: white; }
  .script-text { flex: 1; line-height: 1.6; }

  /* STAGE DIRECTIONS */
  .stage-direction {
    color: #666; font-style: italic;
    padding: 4px 16px; margin: 6px 0;
    border-left: 2px solid #CBD5E0;
  }

  /* STEPS */
  .step-header {
    background: var(--green-dark); color: white;
    padding: 8px 16px; border-radius: 6px;
    font-weight: 700; font-size: 14px;
    margin: 16px 0 8px 0;
    letter-spacing: 0.5px;
  }

  /* LISTS */
  .lesson-list {
    list-style: none; padding: 0; margin: 8px 0;
  }
  .lesson-list li {
    padding: 5px 5px 5px 20px;
    position: relative;
    border-bottom: 1px solid #F7FAFC;
  }
  .lesson-list li::before {
    content: '✓'; position: absolute; left: 2px;
    color: var(--green-light); font-weight: bold;
  }
  .lesson-list li.numbered::before { content: none; }
  .lesson-list li.numbered {
    padding-left: 8px; counter-increment: step;
    list-style: decimal inside;
  }

  /* SUBSECTIONS */
  .subsection-title {
    font-family: 'Playfair Display', serif;
    font-size: 16px; color: var(--green-dark);
    margin: 20px 0 10px 0;
    padding-bottom: 4px;
    border-bottom: 2px solid var(--green-pale);
  }
  .sub-subsection {
    font-size: 14px; font-weight: 700;
    color: var(--brown); margin: 14px 0 6px 0;
    text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* SIDEBAR LAYOUT */
  .content-row { display: flex; gap: 24px; }
  .main-col { flex: 1; min-width: 0; }
  .sidebar-col { width: 280px; flex-shrink: 0; }
  .sidebar-card {
    background: var(--purple-light);
    border: 1px solid #B794F4;
    border-radius: 10px; padding: 16px;
    position: sticky; top: 80px;
  }
  .sidebar-header {
    font-family: 'Playfair Display', serif;
    font-size: 14px; font-weight: 700;
    color: var(--purple); margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 2px solid #B794F4;
  }
  .cof-scenario {
    background: white; border-radius: 8px;
    padding: 12px; margin-bottom: 10px;
    font-size: 13px; line-height: 1.5;
    border-left: 3px solid var(--purple);
  }

  /* HEART MOMENT */
  .heart-moment-box {
    background: linear-gradient(135deg, #FFF0F3, #FFF8F9);
    border: 2px solid #FBB6CE; border-radius: 10px;
    padding: 20px; margin: 16px 0;
    position: relative;
  }
  .heart-moment-box::before {
    content: '✝️'; position: absolute; top: -12px; left: 20px;
    background: white; padding: 0 8px; font-size: 18px;
  }

  /* FRUITFUL MOMENTS */
  .fruitful-card {
    background: linear-gradient(135deg, #FFF8F0, #FFF3E0);
    border: 2px solid #F4A261; border-radius: 10px;
    padding: 20px; margin: 16px 0;
  }
  .fruitful-card-header {
    font-family: 'Playfair Display', serif;
    font-size: 16px; color: #E76F51; font-weight: 700;
    margin-bottom: 12px;
  }

  /* CONCEPT IMAGES */
  .concept-image-container {
    text-align: center; margin: 20px 0;
    background: var(--green-pale); border-radius: 10px;
    padding: 16px;
  }
  .concept-image-container img { max-width: 100%; border-radius: 8px; }
  .concept-caption {
    font-size: 12px; color: var(--text-light);
    margin-top: 8px; font-style: italic;
  }

  /* BOOK COVER */
  .book-cover-widget {
    display: flex; gap: 16px; align-items: center;
    background: #F7FAFC; border-radius: 10px;
    padding: 16px; margin: 16px 0;
    border: 1px solid var(--border);
  }
  .book-cover-img { width: 80px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .book-cover-label { font-size: 14px; }

  /* DIVIDER */
  .section-divider {
    border: none; height: 3px;
    background: linear-gradient(to right, var(--green-pale), var(--green-light), var(--green-pale));
    margin: 32px 0; border-radius: 2px;
  }

  /* MATERIALS PAGE */
  .materials-page {
    background: white; border-radius: 12px;
    padding: 32px; margin-bottom: 32px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    border-top: 6px solid #2B6CB0;
    display: none;
  }
  .materials-page.active { display: block; }
  .materials-title {
    font-family: 'Playfair Display', serif;
    font-size: 22px; color: #2B6CB0; margin-bottom: 20px;
  }

  /* FRUITFUL MOMENTS PAGE */
  .fruitful-page {
    background: white; border-radius: 12px;
    padding: 32px; margin-bottom: 32px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    border-top: 6px solid #E76F51;
    display: none;
  }
  .fruitful-page.active { display: block; }

  /* DAY FLOW TIMELINE */
  .day-flow {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-bottom: 28px; padding: 16px;
    background: white; border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .flow-item {
    background: var(--green-pale); color: var(--green-dark);
    padding: 6px 14px; border-radius: 20px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    border: 2px solid transparent; transition: all 0.2s;
    text-decoration: none;
  }
  .flow-item:hover { border-color: var(--green-light); background: var(--green-light); color: white; }

  /* PARAGRAPH */
  p { margin: 6px 0; }

  /* PRINT */
  @media print {
    .lesson-topbar, .prep-link-banner, .day-flow { display: none; }
    .section-wrapper { box-shadow: none; margin-bottom: 16px; }
    .printable-fruitful { page-break-inside: avoid; }
    body { background: white; }
  }

  /* RESPONSIVE */
  @media (max-width: 768px) {
    .content-row { flex-direction: column; }
    .sidebar-col { width: 100%; }
    .sidebar-card { position: static; }
    .lesson-container { padding: 16px; }
  }
</style>
</head>
<body>

<div class="lesson-topbar">
  <div class="brand">🌳 Faithful Foundations</div>
  <div class="topbar-actions">
    <button class="btn-topbar btn-back" onclick="window.history.back()">← Back</button>
    <button class="btn-topbar btn-prep" onclick="togglePage('materials-page')">📋 Prep & Materials</button>
    <button class="btn-topbar btn-fruitful" onclick="togglePage('fruitful-page')">🍎 Fruitful Moments</button>
    <button class="btn-topbar btn-print" onclick="window.print()">🖨️ Print</button>
  </div>
</div>

<div class="lesson-container">

  <h1 class="lesson-title">Faithful Foundations | Exploring Trees<br><small style="font-size:18px;color:var(--text-light);">Day ${lesson.day_number} of 25 — ${lesson.focus || ''}</small></h1>

  <div class="lesson-meta">
    <span class="meta-badge">📅 Week ${lesson.week_number || ''}</span>
    <span class="meta-badge">${lesson.age_band ? lesson.age_band.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : ''}</span>
    <span class="meta-badge fruit">🍇 ${lesson.fruit_of_spirit || ''}</span>
    <span class="meta-badge">📖 ${lesson.vocabulary_word || ''}</span>
    <span class="meta-badge" style="background:${lesson.status === 'published' ? '#C6F6D5' : lesson.status === 'approved' ? '#FFF3CD' : '#FED7D7'}">
      ${lesson.status === 'published' ? '✓ Published' : lesson.status === 'approved' ? '✓ Approved' : '⚑ Draft'}
    </span>
  </div>

  <!-- DAY FLOW NAVIGATION -->
  <div class="day-flow">
    <strong style="color:var(--text-light);font-size:12px;width:100%;margin-bottom:4px;">JUMP TO SECTION</strong>
    <a href="#discovery-circle" class="flow-item">⭕ Discovery Circle</a>
    <a href="#choice-time" class="flow-item">🎨 Choice Time</a>
    <a href="#story-gathering" class="flow-item">📖 Story Gathering</a>
    <a href="#skill-builders" class="flow-item">🌱 Skill Builders</a>
    <a href="#outdoor-time" class="flow-item">☀️ Outdoor Time</a>
    <a href="#reflection-time" class="flow-item">💛 Reflection Time</a>
    <a href="#teachers-heart" class="flow-item">❤️ Teacher's Heart</a>
  </div>

  <!-- PREP & MATERIALS PAGE (hidden until toggled) -->
  <div class="materials-page" id="materials-page">
    <div class="materials-title">📋 Materials & Lesson Preparation — Day ${lesson.day_number}</div>
    <p style="color:var(--text-light);margin-bottom:20px;">Gather these materials before children arrive. Items marked ★ are essential for Heart Moments.</p>
    <div id="materials-content">Loading materials...</div>
    <button onclick="togglePage('materials-page')" style="margin-top:20px;padding:8px 20px;background:var(--green-dark);color:white;border:none;border-radius:8px;cursor:pointer;">← Back to Lesson</button>
  </div>

  <!-- FRUITFUL MOMENTS PAGE (hidden until toggled) -->
  <div class="fruitful-page" id="fruitful-page">
    <h2 style="font-family:'Playfair Display',serif;color:#E76F51;margin-bottom:8px;">🍎 Fruitful Moments — Day ${lesson.day_number}</h2>
    <p style="color:var(--text-light);margin-bottom:24px;font-size:13px;">Print this sheet and keep it handy throughout the day. Each Fruitful Moment is a brief, joyful ritual to transition or gather children.</p>
    <div id="fruitful-content">${fruitfulHTML || '<p style="color:var(--text-light);">Fruitful Moments will appear here once extracted from the lesson.</p>'}</div>
    <button onclick="window.print()" style="margin-top:20px;margin-right:10px;padding:8px 20px;background:#E76F51;color:white;border:none;border-radius:8px;cursor:pointer;">🖨️ Print Fruitful Moments</button>
    <button onclick="togglePage('fruitful-page')" style="margin-top:20px;padding:8px 20px;background:var(--green-dark);color:white;border:none;border-radius:8px;cursor:pointer;">← Back to Lesson</button>
  </div>

  <!-- PREP LINK BANNER -->
  <div class="prep-link-banner">
    <div class="prep-link-icon">📋</div>
    <div class="prep-link-text">
      <strong>Materials & Lesson Preparation</strong>
      <span>Review materials checklist and room setup before children arrive</span>
    </div>
    <button class="prep-btn" onclick="togglePage('materials-page')">Open Prep Checklist</button>
  </div>

  ${treePartsImg ? '<div class="concept-image-container"><img src="' + treePartsImg + '" alt="Tree parts diagram"><p class="concept-caption">Tree Parts Reference — trunk, branches, leaves, roots</p></div>' : ''}

  ${bookCoverHtml}

  <!-- MAIN LESSON CONTENT -->
  <div id="lesson-main-content">
    ${html}
  </div>

</div>

<script>
function togglePage(id) {
  const pages = ['materials-page', 'fruitful-page'];
  pages.forEach(p => {
    const el = document.getElementById(p);
    if (p === id) {
      el.classList.toggle('active');
      if (el.classList.contains('active')) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      el.classList.remove('active');
    }
  });
}

// Extract and populate materials list from lesson content
document.addEventListener('DOMContentLoaded', function() {
  const content = document.getElementById('lesson-main-content').innerText;
  const matMatch = content.match(/MATERIALS CHECKLIST[\s\S]*?(?=DAILY RESOURCES|DISCOVERY CIRCLE|\n##)/i);
  if (matMatch) {
    const items = matMatch[0].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'));
    document.getElementById('materials-content').innerHTML = '<ul class="lesson-list">' +
      items.map(i => '<li>' + i.replace(/^[-•]\s*/, '') + '</li>').join('') + '</ul>';
  } else {
    document.getElementById('materials-content').innerHTML = '<p>Open the full lesson and look for the Materials Checklist in the Header Block section.</p>';
  }
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
</script>

</body>
</html>`;
}

// ============================================================
// ROUTES
// ============================================================

// Render lesson as full HTML page
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_lessons WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).send('<h2>Lesson not found</h2>');
    const lesson = result.rows[0];
    const page = await buildLessonPage(lesson);
    res.setHeader('Content-Type', 'text/html');
    res.send(page);
  } catch (err) {
    res.status(500).send('<h2>Error rendering lesson: ' + err.message + '</h2>');
  }
});

module.exports = router;
