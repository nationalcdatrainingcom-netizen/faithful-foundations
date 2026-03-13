const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ============================================================
// BOOK COVER — Open Library
// ============================================================
async function fetchBookCover(title, author) {
  try {
    const q = encodeURIComponent((title || '') + ' ' + (author || ''));
    const res = await fetch('https://openlibrary.org/search.json?q=' + q + '&limit=3');
    const data = await res.json();
    // Pick first result that has a cover
    if (data.docs) {
      for (const doc of data.docs) {
        if (doc.cover_i) return 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg';
      }
    }
  } catch (e) {}
  return null;
}

// ============================================================
// TREE DIAGRAM — SVG (no external photo dependency, always accurate)
// Shows roots underground, trunk, branches, leaves — clearly labeled
// ============================================================
const TREE_PHOTO_HTML = `
<div style="text-align:center;">
  <svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" style="max-width:500px;width:100%;border-radius:12px;">
    <!-- Sky -->
    <rect width="520" height="245" fill="#D6EEFF" rx="12"/>
    <!-- Sun -->
    <circle cx="460" cy="50" r="32" fill="#FFD93D" opacity="0.9"/>
    <line x1="460" y1="10" x2="460" y2="2" stroke="#FFD93D" stroke-width="3"/>
    <line x1="492" y1="50" x2="500" y2="50" stroke="#FFD93D" stroke-width="3"/>
    <line x1="483" y1="23" x2="489" y2="17" stroke="#FFD93D" stroke-width="3"/>
    <line x1="437" y1="23" x2="431" y2="17" stroke="#FFD93D" stroke-width="3"/>
    <!-- Ground stripe -->
    <rect y="245" width="520" height="20" fill="#5D8A3C" rx="0"/>
    <!-- Underground -->
    <rect y="265" width="520" height="135" fill="#8B6914" rx="0"/>
    <!-- Soil texture lines -->
    <line x1="0" y1="290" x2="520" y2="290" stroke="#7A5C10" stroke-width="1" opacity="0.5"/>
    <line x1="0" y1="320" x2="520" y2="320" stroke="#7A5C10" stroke-width="1" opacity="0.5"/>
    <line x1="0" y1="350" x2="520" y2="350" stroke="#7A5C10" stroke-width="1" opacity="0.5"/>
    <!-- Underground label -->
    <text x="30" y="285" fill="#C9A84C" font-family="Arial,sans-serif" font-size="11" font-weight="700" opacity="0.8">underground</text>
    <!-- ROOTS -->
    <path d="M248,268 Q210,285 185,310" stroke="#6B4226" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M258,268 Q255,295 252,325" stroke="#6B4226" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M268,268 Q305,285 330,310" stroke="#6B4226" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M243,278 Q205,300 178,332" stroke="#7D4F2A" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M273,278 Q312,300 338,332" stroke="#7D4F2A" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M252,285 Q235,310 230,345" stroke="#7D4F2A" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M265,285 Q280,310 285,345" stroke="#7D4F2A" stroke-width="5" fill="none" stroke-linecap="round"/>
    <!-- TRUNK -->
    <rect x="234" y="155" width="50" height="115" rx="8" fill="#6B4226"/>
    <rect x="240" y="160" width="10" height="105" rx="4" fill="#7D4F2A" opacity="0.45"/>
    <!-- BRANCHES -->
    <path d="M258,162 Q218,130 175,95" stroke="#5A3519" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M260,162 Q300,118 345,90" stroke="#5A3519" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M255,178 Q238,148 220,118" stroke="#5A3519" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M263,178 Q282,145 305,125" stroke="#5A3519" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M255,192 Q225,175 195,165" stroke="#5A3519" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M263,192 Q298,172 325,165" stroke="#5A3519" stroke-width="8" fill="none" stroke-linecap="round"/>
    <!-- CANOPY / LEAVES -->
    <ellipse cx="215" cy="78" rx="55" ry="42" fill="#2D6A4F" opacity="0.92"/>
    <ellipse cx="295" cy="72" rx="52" ry="40" fill="#2D6A4F" opacity="0.92"/>
    <ellipse cx="258" cy="60" rx="50" ry="38" fill="#40916C"/>
    <ellipse cx="185" cy="110" rx="38" ry="28" fill="#2D6A4F" opacity="0.88"/>
    <ellipse cx="330" cy="108" rx="36" ry="26" fill="#2D6A4F" opacity="0.88"/>
    <ellipse cx="258" cy="50" rx="32" ry="25" fill="#52B788"/>
    <ellipse cx="180" cy="62" rx="14" ry="10" fill="#52B788" transform="rotate(-25 180 62)"/>
    <ellipse cx="338" cy="60" rx="14" ry="10" fill="#52B788" transform="rotate(20 338 60)"/>
    <ellipse cx="228" cy="42" rx="12" ry="8" fill="#74C69D" transform="rotate(-15 228 42)"/>
    <ellipse cx="292" cy="44" rx="12" ry="8" fill="#74C69D" transform="rotate(15 292 44)"/>
    <!-- ── LABELS ── -->
    <!-- Leaves -->
    <line x1="345" y1="68" x2="385" y2="48" stroke="#1B4332" stroke-width="1.5"/>
    <rect x="385" y="32" width="78" height="26" rx="13" fill="rgba(27,67,50,0.92)"/>
    <text x="424" y="49" fill="#D8F3DC" font-family="Arial,sans-serif" font-size="13" font-weight="800" text-anchor="middle">🌿 Leaves</text>
    <!-- Branches -->
    <line x1="328" y1="115" x2="375" y2="108" stroke="#5A3519" stroke-width="1.5"/>
    <rect x="375" y="94" width="105" height="26" rx="13" fill="rgba(90,53,25,0.92)"/>
    <text x="427" y="111" fill="#F7E6D3" font-family="Arial,sans-serif" font-size="13" font-weight="800" text-anchor="middle">🌲 Branches</text>
    <!-- Trunk -->
    <line x1="233" y1="210" x2="165" y2="216" stroke="#6B4226" stroke-width="1.5"/>
    <rect x="70" y="202" width="94" height="26" rx="13" fill="rgba(107,66,38,0.92)"/>
    <text x="117" y="219" fill="#F7E6D3" font-family="Arial,sans-serif" font-size="13" font-weight="800" text-anchor="middle">🪵 Trunk</text>
    <!-- Ground line -->
    <line x1="258" y1="245" x2="258" y2="260" stroke="#5D8A3C" stroke-width="2" stroke-dasharray="4,3"/>
    <!-- Roots -->
    <line x1="200" y1="308" x2="140" y2="318" stroke="#C9A84C" stroke-width="1.5"/>
    <rect x="32" y="305" width="106" height="26" rx="13" fill="rgba(27,67,50,0.92)"/>
    <text x="85" y="322" fill="#D8F3DC" font-family="Arial,sans-serif" font-size="13" font-weight="800" text-anchor="middle">🌱 Roots</text>
    <text x="85" y="336" fill="#C9A84C" font-family="Arial,sans-serif" font-size="10" text-anchor="middle">(underground)</text>
  </svg>
  <p style="font-size:12px;color:#4A5568;margin-top:6px;font-style:italic;">Point to each part and name it together with the children</p>
</div>`;

// ============================================================
// MARKDOWN → HTML (server-side)
// ============================================================
function md2html(text) {
  if (!text) return '';
  return text
    .replace(/\*\*TEACHER:\*\*\s*/g, '<span class="speaker teacher-sp">TEACHER</span> ')
    .replace(/\*\*CHILDREN:\*\*\s*/g, '<span class="speaker children-sp">CHILDREN</span> ')
    .replace(/\*\*([A-Z][A-Z]+):\*\*\s*/g, '<span class="speaker child-sp">$1</span> ')
    .replace(/\*\*(STEP \d+[^*]*)\*\*/g, '<div class="step-hd">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="stage">$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="num">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>')
    .replace(/^### (.+)$/gm, '<h3 class="sub-hd">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 class="sub-sub-hd">$1</h4>')
    .replace(/^---$/gm, '<hr class="inner-hr">')
    .split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<')) return p;
      return '<p>' + p + '</p>';
    }).join('\n');
}

// ============================================================
// CONTENT PARSERS
// ============================================================
function parseLessonSections(markdown) {
  const sections = {};
  let current = null;
  let buffer = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      if (current) sections[current] = buffer.join('\n');
      current = line.slice(3).replace(/^\d+\.\s*/, '').trim().toUpperCase();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n');
  return sections;
}

function extractFruitfulMoments(content) {
  const moments = [];
  const lines = content.split('\n');
  let inFM = false, fmTitle = '', fmLines = [];
  for (const line of lines) {
    const isFM = line.match(/\*\*FRUITFUL MOMENT[^*]*\*\*/i) || line.match(/^#{1,4}\s*FRUITFUL MOMENT/i);
    if (isFM) {
      if (inFM && fmLines.length) moments.push({ title: fmTitle, content: fmLines.join('\n') });
      fmTitle = line.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
      fmLines = []; inFM = true;
    } else if (inFM) {
      if (line.match(/^## /)) { moments.push({ title: fmTitle, content: fmLines.join('\n') }); inFM = false; fmLines = []; }
      else fmLines.push(line);
    }
  }
  if (inFM && fmLines.length) moments.push({ title: fmTitle, content: fmLines.join('\n') });
  return moments;
}

function extractStoryParts(storyText) {
  const parts = { before: '', during: '', after: '', full: storyText || '' };
  if (!storyText) return parts;
  const lines = storyText.split('\n');
  let cur = null;
  for (const line of lines) {
    const low = line.toLowerCase().replace(/[*#_]/g, '');
    if (low.match(/before\s+reading/)) { cur = 'before'; continue; }
    else if (low.match(/during\s+reading/)) { cur = 'during'; continue; }
    else if (low.match(/after\s+reading/)) { cur = 'after'; continue; }
    if (cur) parts[cur] += line + '\n';
  }
  return parts;
}

function extractDocExamples(content) {
  const examples = [];
  const lines = content.split('\n');
  let inEx = false, exTitle = '', exLines = [];
  for (const line of lines) {
    if (line.match(/CIRCLE OF FRIENDS SCENARIO|DOCUMENTATION EXAMPLE/i)) {
      if (inEx && exLines.length) examples.push({ title: exTitle, content: exLines.join('\n') });
      exTitle = line.replace(/\*\*/g, '').trim(); exLines = []; inEx = true;
    } else if (inEx) {
      if (line.match(/^## /) || line.match(/FRUIT OF THE SPIRIT WATCH/i)) {
        examples.push({ title: exTitle, content: exLines.join('\n') }); inEx = false; exLines = [];
      } else exLines.push(line);
    }
  }
  if (inEx && exLines.length) examples.push({ title: exTitle, content: exLines.join('\n') });
  return examples;
}

// Build a meaningful family connection summary from lesson content
function buildFamilyConnection(lesson, sections) {
  const focus = lesson.focus || 'trees';
  const vocab = lesson.vocabulary_word || '';
  const fruit = lesson.fruit_of_spirit || 'kindness';
  const dayNum = lesson.day_number || 1;

  // Try to extract from generated content first
  const reflText = sections['REFLECTION TIME'] || sections['9. REFLECTION TIME'] || '';
  const fcMatch = reflText.match(/FAMILY CONNECTION([\s\S]*?)(?=\n##|\n\*\*[A-Z]{4,}|$)/i);
  if (fcMatch && fcMatch[1] && fcMatch[1].trim().length > 40) {
    return fcMatch[1].trim();
  }

  // Build a rich summary if not found in content
  return `Today in Faithful Foundations we explored **"${focus}"** as part of our Exploring Trees study (Day ${dayNum}).\n\n` +
    `**What we did today:**\n` +
    `- Gathered in our Discovery Circle to wonder and investigate together\n` +
    `- Learned a new vocabulary word: **${vocab}**\n` +
    `- Read a book and talked about what we discovered\n` +
    `- Explored through hands-on Choice Time activities\n` +
    `- Practiced being kind to our Circle of Friends outdoors\n\n` +
    `**Our Fruit of the Spirit this week is: ${fruit}**\n\n` +
    `**Ask your child today:**\n` +
    `"What did you discover about trees today? What surprised you the most?"`;
}

// Spanish pronunciation helper
function spanishPronunciation(word) {
  const map = {
    'arbol': 'AHR-bol', 'árbol': 'AHR-bol',
    'raiz': 'rah-EES', 'raíz': 'rah-EES',
    'hoja': 'OH-hah', 'hojas': 'OH-hahs',
    'rama': 'RAH-mah', 'ramas': 'RAH-mahs',
    'tronco': 'TROHN-koh',
    'semilla': 'seh-MEE-yah',
    'fruta': 'FROO-tah',
    'bosque': 'BOHS-keh',
    'tierra': 'TYEH-rah',
    'agua': 'AH-gwah',
    'sol': 'sohl',
    'verde': 'BEHR-deh',
    'grande': 'GRAHN-deh',
    'pequeno': 'peh-KEH-nyoh', 'pequeño': 'peh-KEH-nyoh',
  };
  const lower = (word || '').toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  return map[lower] || null;
}

// ============================================================
// BUILD FULL LESSON PAGE
// ============================================================
async function buildLessonPage(lesson) {
  const content = lesson.content || '';
  const sections = parseLessonSections(content);
  const fruitfulMoments = extractFruitfulMoments(content);
  const docExamples = extractDocExamples(content);
  const storySection = sections['STORY GATHERING'] || sections['4. STORY GATHERING'] || '';
  const storyParts = extractStoryParts(storySection);
  const familyConnectionText = buildFamilyConnection(lesson, sections);

  let bookCoverUrl = null;
  let bookTitle = '', bookAuthor = '';
  if (lesson.required_book) {
    try {
      const book = typeof lesson.required_book === 'string' ? JSON.parse(lesson.required_book) : lesson.required_book;
      bookTitle = book.title || '';
      bookAuthor = book.author || '';
      bookCoverUrl = await fetchBookCover(bookTitle, bookAuthor);
    } catch(e) {}
  }

  const dayNum = lesson.day_number || 1;
  const isOptional = dayNum >= 21;
  const vocab = lesson.vocabulary_word || '';
  const spanishVocab = lesson.spanish_vocabulary || '';
  const spanishPron = spanishPronunciation(spanishVocab);

  // Skill builders — remove ONLY teaching sequence and observation questions; KEEP steps + multilingual + inclusion
  const skillPrimary = (sections['SKILL BUILDERS PRIMARY'] || sections['5. SKILL BUILDERS PRIMARY'] || '')
    .replace(/\*\*TEACHING SEQUENCE[^*]*\*\*[\s\S]*?(?=\*\*MULTILINGUAL|\*\*INCLUDING ALL|\*\*STEP|\n##|$)/gi, '')
    .replace(/\*\*OBSERVATION QUESTIONS[^*]*\*\*[\s\S]*?(?=\n##|$)/gi, '');
  const skillAdditional = (sections['SKILL BUILDERS ADDITIONAL'] || sections['6. SKILL BUILDERS ADDITIONAL'] || '')
    .replace(/\*\*TEACHING SEQUENCE[^*]*\*\*[\s\S]*?(?=\*\*MULTILINGUAL|\*\*INCLUDING ALL|\*\*STEP|\n##|$)/gi, '')
    .replace(/\*\*OBSERVATION QUESTIONS[^*]*\*\*[\s\S]*?(?=\n##|$)/gi, '');

  // Choice time — strip doc examples from inline, they go in modal
  const choiceContent = (sections['CHOICE TIME'] || sections['3. CHOICE TIME'] || '')
    .replace(/CIRCLE OF FRIENDS SCENARIO[\s\S]*?(?=\n###|\n##|FRUIT OF THE SPIRIT|\n---END|$)/gi, '');

  // Reflection — strip family connection (shown in custom box)
  const reflectionContent = (sections['REFLECTION TIME'] || sections['9. REFLECTION TIME'] || '')
    .replace(/FAMILY CONNECTION[\s\S]*$/i, '');

  // Safe JSON embedding
  const fmJSON = JSON.stringify(fruitfulMoments).replace(/<\/script>/gi, '<\\/script>');
  const docJSON = JSON.stringify(docExamples).replace(/<\/script>/gi, '<\\/script>');
  const storyJSON = JSON.stringify(storyParts).replace(/<\/script>/gi, '<\\/script>');
  const fcJSON = JSON.stringify(familyConnectionText).replace(/<\/script>/gi, '<\\/script>');

  // Fruitful moment mini-buttons rendered after each section
  const fmButton = (idx, label) => {
    const fm = fruitfulMoments[idx];
    if (!fm && idx >= fruitfulMoments.length) {
      // Fallback generic transition button
      return `<div class="fm-transition-btn" onclick="openGenericTransition()">
        <span>🍎</span>
        <div><div class="fm-tb-title">${label || 'Fruitful Moment Transition'}</div>
        <div class="fm-tb-hint">Click for transition ideas</div></div>
        <span class="fm-tb-arrow">▶</span>
      </div>`;
    }
    const f = fm || fruitfulMoments[fruitfulMoments.length - 1];
    const i = fm ? idx : fruitfulMoments.length - 1;
    return `<div class="fm-transition-btn" onclick="openFMModal(${i})">
      <span>🍎</span>
      <div><div class="fm-tb-title">${f.title || label || 'Fruitful Moment'}</div>
      <div class="fm-tb-hint">Click to open full transition activity</div></div>
      <span class="fm-tb-arrow">▶</span>
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FF · Day ${dayNum} · ${lesson.focus || ''}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --gd:#1B4332;--gm:#2D6A4F;--gl:#52B788;--gp:#D8F3DC;
  --gold:#D4A017;--goldb:#FFF3CD;--br:#774936;--cream:#FDFAF5;
  --tx:#1A1A2E;--txl:#4A5568;--bdr:#E2E8F0;
  --pur:#553C9A;--purp:#E9D8FD;--ora:#E76F51;--orap:#FFF3EE;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Source Sans 3',sans-serif;background:var(--cream);color:var(--tx);font-size:15px;line-height:1.7;}

/* ── TOPBAR ── */
.topbar{background:var(--gd);color:#fff;padding:10px 24px;display:flex;align-items:center;
  justify-content:space-between;position:sticky;top:0;z-index:300;box-shadow:0 2px 8px rgba(0,0,0,.25);}
.topbar-brand{font-family:'Playfair Display',serif;font-size:17px;color:#D8F3DC;}
.topbar-btns{display:flex;gap:8px;flex-wrap:wrap;}
.tbtn{padding:5px 14px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;transition:.2s;}
.tbtn-back{background:transparent;color:#D8F3DC;border:1px solid #52B788;}
.tbtn-prep{background:#2D6A4F;color:#fff;border:1px solid #52B788;}
.tbtn-fm{background:#E76F51;color:#fff;}
.tbtn-print{background:var(--gold);color:#1A1A2E;}

/* ── LAYOUT ── */
.wrap{max-width:860px;margin:0 auto;padding:28px 20px;}

/* ── TITLE / META ── */
.lesson-title{font-family:'Playfair Display',serif;font-size:26px;color:var(--gd);line-height:1.3;margin-bottom:6px;}
.lesson-sub{font-size:15px;color:var(--txl);margin-bottom:16px;}
.meta-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid var(--gl);}
.badge{padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;}
.badge-g{background:var(--gp);color:var(--gd);}
.badge-f{background:var(--goldb);color:var(--br);}
.badge-pub{background:#C6F6D5;color:#276749;}
.badge-app{background:#FFF3CD;color:#744210;}
.badge-dft{background:#FED7D7;color:#9B2C2C;}
.badge-opt{background:var(--purp);color:var(--pur);}

/* ── JUMP NAV ── */
.jump-nav{background:#fff;border-radius:10px;padding:12px 16px;margin-bottom:24px;
  box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex;flex-wrap:wrap;gap:8px;}
.jump-nav-label{font-size:11px;color:var(--txl);text-transform:uppercase;font-weight:700;width:100%;margin-bottom:2px;}
.jlink{background:var(--gp);color:var(--gd);padding:5px 12px;border-radius:16px;font-size:12px;
  font-weight:700;cursor:pointer;border:none;transition:.2s;}
.jlink:hover{background:var(--gl);color:#fff;}

/* ── PREP BANNER ── */
.prep-banner{background:#EBF8FF;border:1px solid #90CDF4;border-radius:10px;padding:14px 20px;
  margin-bottom:24px;display:flex;align-items:center;gap:14px;}
.prep-banner-text strong{display:block;color:#2B6CB0;font-size:14px;}
.prep-banner-text span{font-size:12px;color:var(--txl);}
.prep-banner-btn{background:#2B6CB0;color:#fff;padding:7px 18px;border-radius:8px;border:none;
  cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;}

/* ── VOCAB CARD ── */
.vocab-card{background:linear-gradient(135deg,var(--gp),#fff);border:2px solid var(--gl);
  border-radius:12px;padding:20px 24px;margin-bottom:24px;display:grid;
  grid-template-columns:1fr 1fr;gap:16px;}
.vocab-english{font-family:'Playfair Display',serif;font-size:22px;color:var(--gd);font-weight:700;}
.vocab-def{font-size:14px;color:var(--tx);margin-top:4px;line-height:1.6;}
.vocab-spanish{font-size:18px;font-weight:700;color:var(--gm);}
.vocab-pron{font-size:13px;color:var(--txl);font-style:italic;margin-top:2px;}
.vocab-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--txl);font-weight:700;margin-bottom:4px;}

/* ── SECTION CARDS ── */
.sec{margin-bottom:28px;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);}
.sec-hd{padding:13px 22px;display:flex;align-items:center;gap:10px;color:#fff;}
.sec-icon{font-size:20px;}
.sec-title{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;}
.sec-body{background:#fff;padding:22px;}

/* ── TEACHER SCRIPTS ── */
.speaker{padding:2px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;flex-shrink:0;}
.teacher-sp{background:var(--gd);color:#fff;}
.children-sp{background:var(--gold);color:#1A1A2E;}
.child-sp{background:var(--pur);color:#fff;}
.stage{color:#666;font-style:italic;display:block;padding:3px 14px;border-left:2px solid #CBD5E0;margin:4px 0;}
.step-hd{background:var(--gd);color:#fff;padding:7px 14px;border-radius:6px;font-weight:700;
  font-size:13px;margin:14px 0 6px 0;}
ul{padding-left:20px;margin:6px 0;}li{padding:3px 0;}p{margin:5px 0;}
.sub-hd{font-family:'Playfair Display',serif;font-size:15px;color:var(--gd);
  margin:18px 0 8px 0;padding-bottom:3px;border-bottom:2px solid var(--gp);}
.sub-sub-hd{font-size:13px;font-weight:800;color:var(--br);text-transform:uppercase;
  letter-spacing:.5px;margin:12px 0 5px 0;}
.inner-hr{border:none;height:2px;background:linear-gradient(to right,var(--gp),var(--gl),var(--gp));
  margin:20px 0;border-radius:2px;}

/* ── CLICKABLE BLOCKS (FM, Doc) ── */
.clickable-block{background:var(--orap);border:2px solid var(--ora);border-radius:10px;
  padding:14px 18px;margin:10px 0;cursor:pointer;transition:.2s;
  display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;}
.clickable-block:hover{background:#FFE8DE;border-color:#C4512B;}
.clickable-block-title{font-family:'Playfair Display',serif;font-size:15px;color:var(--ora);font-weight:700;}
.clickable-block-hint{font-size:12px;color:var(--txl);}
.cb-arrow{color:var(--ora);font-size:18px;}

/* ── FM TRANSITION BUTTONS (between sections) ── */
.fm-transition-btn{background:linear-gradient(135deg,#FFF8F0,#FFE8D6);border:2px solid #F4A261;
  border-radius:10px;padding:12px 18px;margin:16px 0;cursor:pointer;transition:.2s;
  display:flex;align-items:center;gap:12px;width:100%;text-align:left;}
.fm-transition-btn:hover{background:#FFE0C0;border-color:var(--ora);}
.fm-tb-title{font-weight:800;font-size:14px;color:#C4512B;}
.fm-tb-hint{font-size:12px;color:var(--txl);}
.fm-tb-arrow{color:var(--ora);font-size:18px;margin-left:auto;}

/* ── STORY BUTTONS ── */
.story-part-btn{background:var(--gp);border:2px solid var(--gl);border-radius:10px;
  padding:12px 18px;margin:8px 0;cursor:pointer;display:flex;align-items:center;
  justify-content:space-between;transition:.2s;width:100%;text-align:left;}
.story-part-btn:hover{background:#B7E4C7;border-color:var(--gd);}
.story-part-label{font-weight:800;font-size:14px;color:var(--gd);}
.story-part-hint{font-size:12px;color:var(--txl);}

/* ── DOC LINK ── */
.doc-link{display:inline-flex;align-items:center;gap:6px;background:var(--purp);
  border:1px solid #B794F4;border-radius:8px;padding:7px 16px;cursor:pointer;
  font-size:13px;font-weight:700;color:var(--pur);margin:8px 0;transition:.2s;border:none;}
.doc-link:hover{background:#D6BCFA;}

/* ── FAMILY CONNECTION ── */
.fc-box{background:#FFFBEB;border:2px solid var(--gold);border-radius:10px;padding:20px;margin:12px 0;}
.fc-title{font-family:'Playfair Display',serif;font-size:16px;color:var(--br);margin-bottom:12px;font-weight:700;}
.fc-summary{font-size:14px;line-height:1.8;color:var(--tx);}
.fc-summary strong{color:var(--gd);}
.fc-question{background:var(--goldb);border-left:4px solid var(--gold);border-radius:0 8px 8px 0;
  padding:10px 16px;margin:14px 0;font-size:14px;font-weight:600;color:var(--br);}
.fc-copy-btn{background:var(--gold);color:#1A1A2E;border:none;border-radius:8px;padding:8px 20px;
  cursor:pointer;font-size:13px;font-weight:700;margin-top:14px;transition:.2s;}
.fc-copy-btn:hover{background:#B8860B;color:#fff;}
.fc-copied-msg{display:none;color:var(--gm);font-size:13px;margin-left:12px;font-weight:800;
  background:var(--gp);padding:4px 12px;border-radius:12px;}

/* ── BOOK WIDGET ── */
.book-widget{display:flex;gap:14px;align-items:center;background:#F7FAFC;border-radius:10px;
  padding:14px;margin:12px 0;border:1px solid var(--bdr);}
.book-cover{width:70px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);}

/* ── FIXED PANELS (Prep, FM) ── */
.page-panel{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;
  z-index:500;overflow-y:auto;padding:32px 36px;}
.page-panel.active{display:block;}
.panel-topbar{position:sticky;top:0;background:#fff;z-index:10;padding:12px 0 16px 0;
  border-bottom:2px solid var(--bdr);margin-bottom:20px;display:flex;gap:10px;align-items:center;}
.panel-title{font-family:'Playfair Display',serif;font-size:20px;flex:1;}
.panel-close-btn{background:var(--gd);color:#fff;border:none;border-radius:8px;
  padding:8px 18px;cursor:pointer;font-size:13px;font-weight:700;}
.panel-print-btn{background:var(--gold);color:#1A1A2E;border:none;border-radius:8px;
  padding:8px 18px;cursor:pointer;font-size:13px;font-weight:700;}

/* FM cards in panel — 1-per-column */
.fm-card{background:linear-gradient(135deg,#FFF8F0,#FFF3E0);border:2px solid #F4A261;
  border-radius:10px;padding:20px;margin-bottom:20px;}
.fm-card-hd{font-family:'Playfair Display',serif;color:#E76F51;font-size:16px;font-weight:700;margin-bottom:8px;}
.fm-card-type{background:#E76F51;color:#fff;border-radius:6px;padding:3px 10px;
  font-size:11px;font-weight:800;display:inline-block;margin-bottom:8px;}

/* ── MODAL ── */
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);
  z-index:1000;display:none;align-items:center;justify-content:center;padding:20px;}
.modal-overlay.open{display:flex;}
.modal-box{background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:88vh;
  overflow-y:auto;padding:28px;box-shadow:0 8px 40px rgba(0,0,0,.25);position:relative;}
.modal-title{font-family:'Playfair Display',serif;font-size:20px;color:var(--gd);margin-bottom:16px;
  padding-right:40px;}
.modal-close-btn{position:absolute;top:16px;right:16px;background:var(--gp);border:none;
  border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;font-weight:700;color:var(--gd);}
.modal-finish{background:var(--gl);color:#fff;border:none;border-radius:8px;padding:10px 24px;
  cursor:pointer;font-size:14px;font-weight:700;margin-top:20px;width:100%;}

/* ── PRINT ── */
@media print{
  .topbar,.jump-nav,.prep-banner,.modal-overlay,
  .page-panel,.tbtn,.jlink{display:none!important;}
  .sec{box-shadow:none;margin-bottom:16px;}
  body{background:#fff;}
}
@media(max-width:640px){
  .topbar-btns{gap:4px;}.tbtn{padding:4px 10px;font-size:11px;}
  .wrap{padding:16px 12px;}
  .vocab-card{grid-template-columns:1fr;}
}
</style>
</head>
<body>

<!-- TOPBAR -->
<div class="topbar">
  <div class="topbar-brand">🌳 Faithful Foundations</div>
  <div class="topbar-btns">
    <button class="tbtn tbtn-back" onclick="window.history.back()">← Back</button>
    <button class="tbtn tbtn-prep" onclick="openPanel('panel-prep')">📋 Prep</button>
    <button class="tbtn tbtn-fm" onclick="openPanel('panel-fm')">🍎 Fruitful Moments</button>
    <button class="tbtn tbtn-print" onclick="window.print()">🖨️ Print</button>
  </div>
</div>

<!-- ── FIXED PREP PANEL ── -->
<div class="page-panel" id="panel-prep">
  <div class="panel-topbar">
    <div class="panel-title" style="color:#2B6CB0;">📋 Materials &amp; Lesson Prep — Day ${dayNum}</div>
    <button class="panel-print-btn" onclick="printPanel('panel-prep')">🖨️ Print</button>
    <button class="panel-close-btn" onclick="closePanel('panel-prep')">✕ Close</button>
  </div>
  <p style="color:var(--txl);font-size:13px;margin-bottom:16px;">Gather all items before children arrive.</p>
  <div id="prep-content">${md2html(sections['HEADER BLOCK'] || sections['1. HEADER BLOCK'] || '<p>Materials checklist will appear here from your Header Block.</p>')}</div>
</div>

<!-- ── FIXED FM PANEL ── -->
<div class="page-panel" id="panel-fm">
  <div class="panel-topbar">
    <div class="panel-title" style="color:#E76F51;">🍎 Fruitful Moments — Day ${dayNum}</div>
    <button class="panel-print-btn" onclick="printPanel('panel-fm')">🖨️ Print</button>
    <button class="panel-close-btn" onclick="closePanel('panel-fm')">✕ Close</button>
  </div>
  <p style="color:var(--txl);font-size:13px;margin-bottom:16px;">Post in your Discovery Circle. Use for transitions and gathering throughout the day.</p>
  <div id="fm-panel-list"></div>
</div>

<!-- ── MAIN CONTENT ── -->
<div class="wrap">

  <div class="lesson-title">Faithful Foundations — Exploring Trees</div>
  <div class="lesson-sub">Day ${dayNum} of 25${isOptional ? ' <em style="color:var(--pur);font-size:13px;">(Optional/Bonus)</em>' : ''} — ${lesson.focus || ''}</div>
  <div class="meta-row">
    <span class="badge badge-g">Week ${lesson.week_number || ''}</span>
    <span class="badge badge-g">${(lesson.age_band || '').replace('_',' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
    <span class="badge badge-f">🍇 ${lesson.fruit_of_spirit || ''}</span>
    <span class="badge badge-g">📖 ${vocab}</span>
    <span class="badge ${lesson.status === 'published' ? 'badge-pub' : lesson.status === 'approved' ? 'badge-app' : 'badge-dft'}">${lesson.status === 'published' ? '✓ Published' : lesson.status === 'approved' ? '✓ Approved' : '⚑ Draft'}</span>
    ${isOptional ? '<span class="badge badge-opt">★ Optional Day</span>' : ''}
  </div>

  <!-- JUMP NAV -->
  <nav class="jump-nav" id="jump-nav" aria-label="Jump to section">
    <div class="jump-nav-label">Jump to Section</div>
    <button class="jlink" onclick="jumpTo('sec-header-block')">📋 Header</button>
    <button class="jlink" onclick="jumpTo('sec-discovery')">⭕ Discovery Circle</button>
    <button class="jlink" onclick="jumpTo('sec-choice')">🎨 Choice Time</button>
    <button class="jlink" onclick="jumpTo('sec-story')">📖 Story Gathering</button>
    <button class="jlink" onclick="jumpTo('sec-skill1')">🌱 Skill Builders</button>
    <button class="jlink" onclick="jumpTo('sec-outdoor')">☀️ Outdoor</button>
    <button class="jlink" onclick="jumpTo('sec-reflection')">💛 Reflection</button>
    <button class="jlink" onclick="jumpTo('sec-heart')">❤️ Teacher's Heart</button>
  </nav>

  <!-- PREP BANNER -->
  <div class="prep-banner">
    <div style="font-size:26px;">📋</div>
    <div class="prep-banner-text">
      <strong>Materials &amp; Lesson Preparation</strong>
      <span>Review checklist and room setup before children arrive</span>
    </div>
    <button class="prep-banner-btn" onclick="openPanel('panel-prep')">Open Prep Checklist</button>
  </div>

  <!-- VOCABULARY CARD -->
  ${vocab ? `<div class="vocab-card">
    <div>
      <div class="vocab-label">Vocabulary Word</div>
      <div class="vocab-english">${vocab}</div>
      <div class="vocab-def" id="vocab-def-text">Definition will appear in the Header Block below.</div>
    </div>
    <div>
      <div class="vocab-label">En Español</div>
      <div class="vocab-spanish">${spanishVocab || '—'}</div>
      ${spanishPron ? `<div class="vocab-pron">Pronounced: ${spanishPron}</div>` : '<div class="vocab-pron" id="vocab-pron-auto"></div>'}
    </div>
  </div>` : ''}

  <!-- TREE PHOTO -->
  <div style="text-align:center;background:var(--gp);border-radius:12px;padding:16px;margin-bottom:24px;" id="sec-header">
    ${TREE_PHOTO_HTML}
  </div>

  <!-- 1. HEADER BLOCK -->
  <div class="sec" id="sec-header-block">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;">
      <span class="sec-icon">🌳</span><span class="sec-title">Header Block</span>
    </div>
    <div class="sec-body">${md2html(sections['HEADER BLOCK'] || sections['1. HEADER BLOCK'] || '')}</div>
  </div>

  ${fmButton(0, 'Opening Fruitful Moment')}

  <!-- 2. DISCOVERY CIRCLE -->
  <div class="sec" id="sec-discovery">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #74C69D;">
      <span class="sec-icon">⭕</span><span class="sec-title">Discovery Circle</span>
    </div>
    <div class="sec-body">${md2html(sections['DISCOVERY CIRCLE'] || sections['2. DISCOVERY CIRCLE'] || '')}</div>
  </div>

  ${fmButton(1, 'Transition to Choice Time')}

  <!-- 3. CHOICE TIME -->
  <div class="sec" id="sec-choice">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #95D5B2;">
      <span class="sec-icon">🎨</span><span class="sec-title">Choice Time</span>
    </div>
    <div class="sec-body">
      <div style="background:var(--purp);border:1px solid #B794F4;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:var(--pur);">
        💡 <strong>Curiosity Builders</strong> for all centers are in your Weekly Resources (Week ${lesson.week_number || ''}) — print and post in each area.
      </div>
      <button class="doc-link" onclick="openDocModal()">📋 Documentation Examples — click to view</button>
      ${md2html(choiceContent)}
    </div>
  </div>

  ${fmButton(2, 'Transition to Story Gathering')}

  <!-- 4. STORY GATHERING -->
  <div class="sec" id="sec-story">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;">
      <span class="sec-icon">📖</span><span class="sec-title">Story Gathering</span>
    </div>
    <div class="sec-body">
      ${bookCoverUrl ? `<div class="book-widget"><img src="${bookCoverUrl}" class="book-cover" alt="book cover"><div style="padding:4px 0;"><strong style="font-size:14px;display:block;">${bookTitle}</strong><em style="font-size:13px;color:var(--txl);">by ${bookAuthor}</em></div></div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <button class="story-part-btn" onclick="openStoryModal('before')">
          <div><div class="story-part-label">📖 Before Reading</div><div class="story-part-hint">Click to open full script</div></div>
          <span style="color:var(--gd);font-size:20px;flex-shrink:0;">▶</span>
        </button>
        <button class="story-part-btn" onclick="openStoryModal('during')">
          <div><div class="story-part-label">📖 During Reading — Pause Points</div><div class="story-part-hint">Click to open discussion prompts</div></div>
          <span style="color:var(--gd);font-size:20px;flex-shrink:0;">▶</span>
        </button>
        <button class="story-part-btn" onclick="openStoryModal('after')">
          <div><div class="story-part-label">📖 After Reading</div><div class="story-part-hint">Click to open closing discussion</div></div>
          <span style="color:var(--gd);font-size:20px;flex-shrink:0;">▶</span>
        </button>
      </div>
    </div>
  </div>

  ${fmButton(3, 'Transition to Skill Builders')}

  <!-- 5. SKILL BUILDERS PRIMARY -->
  <div class="sec" id="sec-skill1">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #B7E4C7;">
      <span class="sec-icon">🌱</span><span class="sec-title">Skill Builders Primary</span>
    </div>
    <div class="sec-body">${md2html(skillPrimary)}</div>
  </div>

  <!-- 6. SKILL BUILDERS ADDITIONAL -->
  <div class="sec">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #B7E4C7;">
      <span class="sec-icon">✨</span><span class="sec-title">Skill Builders Additional</span>
    </div>
    <div class="sec-body">${md2html(skillAdditional)}</div>
  </div>

  ${fmButton(4, 'Transition to Outdoor Time')}

  <!-- 8. OUTDOOR TIME -->
  <div class="sec" id="sec-outdoor">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #95D5B2;">
      <span class="sec-icon">☀️</span><span class="sec-title">Outdoor Time</span>
    </div>
    <div class="sec-body">${md2html(sections['OUTDOOR TIME'] || sections['8. OUTDOOR TIME'] || '')}</div>
  </div>

  ${fmButton(5, 'Transition to Reflection Time')}

  <!-- 9. REFLECTION TIME -->
  <div class="sec" id="sec-reflection">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;">
      <span class="sec-icon">💛</span><span class="sec-title">Reflection Time</span>
    </div>
    <div class="sec-body">
      ${md2html(reflectionContent)}
      <!-- FAMILY CONNECTION -->
      <div class="fc-box" id="family-connection-box">
        <div class="fc-title">💌 Family Connection</div>
        <div class="fc-summary" id="fc-display"></div>
        <div class="fc-question" id="fc-question"></div>
        <div style="margin-top:14px;">
          <button class="fc-copy-btn" onclick="copyFamilyConnection()" id="fc-copy-btn">📋 Copy for Daily Report</button>
          <span class="fc-copied-msg" id="fc-copied">✓ Copied to clipboard!</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 10. TEACHER'S HEART -->
  <div class="sec" id="sec-heart">
    <div class="sec-hd" style="background:#774936;border-left:6px solid #C4956A;">
      <span class="sec-icon">❤️</span><span class="sec-title">Teacher's Heart</span>
    </div>
    <div class="sec-body">${md2html(sections["TEACHER'S HEART"] || sections["TEACHERS HEART"] || sections['10. TEACHERS HEART'] || '')}</div>
  </div>

</div><!-- end .wrap -->

<!-- MODAL -->
<div class="modal-overlay" id="modal-overlay" onclick="closeModal(event)">
  <div class="modal-box" onclick="event.stopPropagation()">
    <button class="modal-close-btn" onclick="closeModal()">✕</button>
    <div class="modal-title" id="modal-title"></div>
    <div id="modal-body"></div>
    <button class="modal-finish" onclick="closeModal()">✓ Finish — Return to Lesson</button>
  </div>
</div>

<script>
// ── Server data ──
const FRUITFUL_MOMENTS = ${fmJSON};
const DOC_EXAMPLES = ${docJSON};
const STORY_PARTS = ${storyJSON};
const FC_DATA = ${fcJSON};

// ── PANELS ──
function openPanel(id) {
  document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); el.scrollTop = 0; document.body.style.overflow = 'hidden'; }
}
function closePanel(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('active'); document.body.style.overflow = ''; }
}
function printPanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Print</title>');
  win.document.write('<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">');
  win.document.write('<style>body{font-family:"Source Sans 3",sans-serif;padding:32px;font-size:14px;line-height:1.7;}');
  win.document.write('.fm-card{background:#FFF8F0;border:2px solid #F4A261;border-radius:10px;padding:20px;margin-bottom:24px;page-break-inside:avoid;}');
  win.document.write('.fm-card-hd{font-family:"Playfair Display",serif;color:#E76F51;font-size:17px;font-weight:700;margin-bottom:8px;}');
  win.document.write('.panel-topbar,.panel-close-btn,.panel-print-btn{display:none!important;}');
  win.document.write('ul{padding-left:20px;}li{margin-bottom:4px;}p{margin:4px 0;}');
  win.document.write('</style></head><body>');
  // Clone just the inner content (not the sticky topbar)
  const contentEl = el.querySelector('#fm-panel-list') || el.querySelector('#prep-content') || el;
  win.document.write(contentEl.innerHTML);
  win.document.write('</body></html>');
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ── JUMP TO (offset for topbar) ──
function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const tb = document.querySelector('.topbar');
  const offset = tb ? tb.offsetHeight + 16 : 68;
  const y = el.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

// ── MODAL ──
function openModal(title, bodyHTML) {
  document.getElementById('modal-title').innerHTML = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ── FM MODAL ──
function openFMModal(idx) {
  const fm = FRUITFUL_MOMENTS[idx];
  if (!fm) { openGenericTransition(); return; }
  openModal('🍎 ' + (fm.title || 'Fruitful Moment'), md2htmlClient(fm.content));
}

// ── GENERIC TRANSITION (when no FM available) ──
function openGenericTransition() {
  const ideas = [
    '<strong>Clap the Beat:</strong> Clap a rhythm, children echo. Repeat 3 times, changing speed.',
    '<strong>Body Freeze:</strong> Dance/move until teacher says a tree part — freeze in that shape.',
    '<strong>Whisper Walk:</strong> Children stand, place hands on shoulders of person in front, whisper-walk to next area.',
    '<strong>Counting Breath:</strong> Breathe in for 4 counts (roots pulling up water), out for 4 (leaves releasing air). Repeat 3 times.',
    '<strong>Wonder Sentence:</strong> Each child says "I wonder..." before moving to next activity.'
  ];
  openModal('🍎 Transition Ideas', '<p style="margin-bottom:12px;color:#666;font-size:13px;">Use any of these quick transitions to move children between activities:</p><ul style="padding-left:20px;">' + ideas.map(i => '<li style="margin-bottom:10px;">' + i + '</li>').join('') + '</ul>');
}

// ── DOC MODAL ──
function openDocModal() {
  if (!DOC_EXAMPLES.length) {
    openModal('📋 Documentation Examples', '<p style="color:#666;">Documentation examples from this lesson will appear here. Look for "Circle of Friends Scenario" sections in the generated content.</p>');
    return;
  }
  const body = DOC_EXAMPLES.map(d =>
    '<div style="background:#E9D8FD;border-radius:8px;padding:14px;margin-bottom:12px;border-left:4px solid #553C9A;">' +
    '<strong style="color:#553C9A;display:block;margin-bottom:8px;">' + d.title + '</strong>' +
    md2htmlClient(d.content) + '</div>'
  ).join('');
  openModal('📋 Documentation Examples', body);
}

// ── STORY MODALS ──
function openStoryModal(part) {
  const labels = { before: '📖 Before Reading', during: '📖 During Reading — Pause Points', after: '📖 After Reading' };
  const txt = STORY_PARTS[part];
  let body;
  if (txt && txt.trim().length > 20) {
    body = md2htmlClient(txt);
  } else if (STORY_PARTS.full && STORY_PARTS.full.trim().length > 20) {
    // Show full story section with a note about which part was requested
    body = '<div style="background:#FFF3E0;border-left:4px solid #F4A261;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#774936;">' +
      '📌 The <strong>' + labels[part] + '</strong> section is shown within the full Story Gathering content below.</div>' +
      md2htmlClient(STORY_PARTS.full);
  } else {
    body = '<p style="color:#666;font-style:italic;">Story Gathering content will appear here once a lesson is generated. The generated content includes Before Reading, During Reading, and After Reading scripts.</p>';
  }
  openModal(labels[part] || 'Story Gathering', body);
}

// ── FAMILY CONNECTION ──
function renderFamilyConnection() {
  const el = document.getElementById('fc-display');
  const qel = document.getElementById('fc-question');
  if (!el) return;

  // Parse the FC_DATA into display HTML
  const text = FC_DATA || '';

  // Extract conversation question if present
  const qMatch = text.match(/Ask your child[^:]*[:]\s*[""]?([^""\n]+)/i) ||
                 text.match(/conversation starter[^:]*[:]\s*([^\n]+)/i) ||
                 text.match(/today[^\n]*\?\s*[""]([^""]+)/i);
  const question = qMatch ? qMatch[1].trim() : 'What did you discover about trees today?';

  // Build display
  const lines = text.split('\n').filter(l => l.trim() && !l.match(/Ask your child/i) && !l.match(/conversation starter/i));
  el.innerHTML = lines.map(l => {
    l = l.trim();
    if (l.startsWith('**') && l.endsWith('**')) return '<p><strong>' + l.replace(/\*\*/g, '') + '</strong></p>';
    if (l.startsWith('- ') || l.startsWith('* ')) return '<li style="margin-left:20px;">' + l.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</li>';
    return '<p>' + l.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</p>';
  }).join('');

  if (qel) qel.innerHTML = '💬 <strong>Ask your child:</strong> "' + question + '"';
}

function copyFamilyConnection() {
  const display = document.getElementById('fc-display');
  const question = document.getElementById('fc-question');
  const text = (display ? display.innerText : '') + '\n\n' + (question ? question.innerText : '');
  const btn = document.getElementById('fc-copy-btn');
  const msg = document.getElementById('fc-copied');

  const doConfirm = () => {
    if (btn) btn.style.display = 'none';
    if (msg) { msg.style.display = 'inline'; }
    setTimeout(() => {
      if (btn) btn.style.display = '';
      if (msg) msg.style.display = 'none';
    }, 3000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(doConfirm).catch(() => fallbackCopy(text, doConfirm));
  } else {
    fallbackCopy(text, doConfirm);
  }
}
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch(e) {}
  document.body.removeChild(ta);
}

// ── FM PANEL ──
function renderFMPanel() {
  const el = document.getElementById('fm-panel-list');
  if (!el) return;
  if (!FRUITFUL_MOMENTS.length) {
    el.innerHTML = '<p style="color:#666;">Fruitful Moments will appear here from your generated lesson content.</p>';
    return;
  }
  el.innerHTML = FRUITFUL_MOMENTS.map((fm, i) =>
    '<div class="fm-card">' +
    '<div class="fm-card-hd">🍎 ' + (fm.title || 'Fruitful Moment ' + (i + 1)) + '</div>' +
    md2htmlClient(fm.content) +
    '</div>'
  ).join('');
}

// ── CLIENT-SIDE MD → HTML ──
function md2htmlClient(text) {
  if (!text) return '';
  return text
    .replace(/\*\*TEACHER:\*\*\s*/g, '<span style="background:#1B4332;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;">TEACHER</span> ')
    .replace(/\*\*CHILDREN:\*\*\s*/g, '<span style="background:#D4A017;color:#1A1A2E;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;">CHILDREN</span> ')
    .replace(/\*\*([A-Z]{2,}):\*\*\s*/g, '<span style="background:#553C9A;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;">$1</span> ')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="color:#555;font-style:italic;">$1</em>')
    .replace(/^#{1,4} (.+)$/gm, '<h4 style="color:#1B4332;font-family:serif;margin:12px 0 6px 0;">$1</h4>')
    .replace(/^- (.+)$/gm, '<li style="margin-bottom:4px;">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:6px;">$1</li>')
    .split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<')) return p;
      return '<p style="margin:6px 0;">' + p + '</p>';
    }).join('');
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', function() {
  renderFMPanel();
  renderFamilyConnection();
});
</script>
</body>
</html>`;
}

// ── ROUTE ──
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_lessons WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).send('<h2 style="padding:40px;font-family:sans-serif;">Lesson not found</h2>');
    const page = await buildLessonPage(result.rows[0]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page);
  } catch (err) {
    res.status(500).send('<h2 style="padding:40px;font-family:sans-serif;color:red;">Error: ' + err.message + '</h2>');
  }
});

module.exports = router;
