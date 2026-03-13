const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ============================================================
// BOOK COVER FROM OPEN LIBRARY
// ============================================================
async function fetchBookCover(title, author) {
  try {
    const q = encodeURIComponent((title || '') + ' ' + (author || ''));
    const res = await fetch('https://openlibrary.org/search.json?q=' + q + '&limit=1');
    const data = await res.json();
    if (data.docs && data.docs[0] && data.docs[0].cover_i) {
      return 'https://covers.openlibrary.org/b/id/' + data.docs[0].cover_i + '-M.jpg';
    }
  } catch (e) {}
  return null;
}

// ============================================================
// INLINE SVG TREE PARTS DIAGRAM (no external API needed)
// ============================================================
const TREE_PARTS_SVG = `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" style="max-width:360px;width:100%">
  <defs>
    <style>
      .label { font-family: 'Source Sans 3', Arial, sans-serif; font-size: 13px; font-weight: 700; }
      .arrow { stroke: #555; stroke-width: 1.5; fill: none; marker-end: url(#arr); }
    </style>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#555"/>
    </marker>
  </defs>
  <!-- Sky -->
  <rect width="400" height="220" fill="#E8F4FD" rx="8"/>
  <!-- Ground -->
  <rect y="220" width="400" height="100" fill="#8B6914" rx="0"/>
  <rect y="220" width="400" height="20" fill="#5D8A3C"/>
  <!-- Roots -->
  <path d="M190,240 Q160,260 140,290" stroke="#6B4226" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M200,240 Q200,265 200,295" stroke="#6B4226" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M210,240 Q240,260 260,290" stroke="#6B4226" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M185,250 Q155,275 135,300" stroke="#7D4F2A" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M215,250 Q245,275 265,300" stroke="#7D4F2A" stroke-width="5" fill="none" stroke-linecap="round"/>
  <!-- Trunk -->
  <rect x="178" y="150" width="44" height="90" rx="6" fill="#6B4226"/>
  <rect x="183" y="155" width="8" height="80" rx="3" fill="#7D4F2A" opacity="0.5"/>
  <!-- Branches -->
  <path d="M200,155 Q170,130 145,105" stroke="#5A3519" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M200,155 Q220,120 250,100" stroke="#5A3519" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M200,165 Q195,140 185,115" stroke="#5A3519" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M200,165 Q210,135 225,118" stroke="#5A3519" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M200,175 Q175,158 155,148" stroke="#5A3519" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M200,175 Q230,155 252,148" stroke="#5A3519" stroke-width="7" fill="none" stroke-linecap="round"/>
  <!-- Canopy / Leaves -->
  <ellipse cx="170" cy="90" rx="42" ry="35" fill="#2D6A4F" opacity="0.9"/>
  <ellipse cx="230" cy="85" rx="40" ry="33" fill="#2D6A4F" opacity="0.9"/>
  <ellipse cx="200" cy="75" rx="38" ry="30" fill="#40916C"/>
  <ellipse cx="155" cy="115" rx="30" ry="22" fill="#2D6A4F" opacity="0.85"/>
  <ellipse cx="248" cy="112" rx="28" ry="20" fill="#2D6A4F" opacity="0.85"/>
  <ellipse cx="200" cy="68" rx="25" ry="20" fill="#52B788"/>
  <!-- Individual leaves -->
  <ellipse cx="148" cy="78" rx="10" ry="7" fill="#52B788" transform="rotate(-30 148 78)"/>
  <ellipse cx="255" cy="75" rx="10" ry="7" fill="#52B788" transform="rotate(25 255 75)"/>
  <ellipse cx="178" cy="58" rx="9" ry="6" fill="#74C69D" transform="rotate(-15 178 58)"/>
  <ellipse cx="225" cy="60" rx="9" ry="6" fill="#74C69D" transform="rotate(20 225 60)"/>
  <!-- LABELS with leader lines -->
  <!-- Leaves label -->
  <line x1="260" y1="72" x2="290" y2="55" class="arrow"/>
  <text x="293" y="52" class="label" fill="#1B4332">Leaves</text>
  <!-- Branches label -->
  <line x1="252" y1="110" x2="290" y2="110" class="arrow"/>
  <text x="293" y="114" class="label" fill="#5A3519">Branches</text>
  <!-- Trunk label -->
  <line x1="178" y1="195" x2="105" y2="200" class="arrow"/>
  <text x="12" y="204" class="label" fill="#6B4226">Trunk</text>
  <!-- Roots label -->
  <line x1="150" y1="275" x2="90" y2="290" class="arrow"/>
  <text x="12" y="294" class="label" fill="#8B6914">Roots</text>
  <!-- Ground line label -->
  <text x="300" y="225" class="label" fill="#5D8A3C" font-size="11">ground</text>
</svg>`;

// ============================================================
// LESSON CONTENT PARSER
// ============================================================
function parseLessonSections(markdown) {
  const sections = {};
  let current = null;
  let buffer = [];

  const lines = markdown.split('\n');
  for (const line of lines) {
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
    .replace(/(<li.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>')
    .replace(/^#{3} (.+)$/gm, '<h3 class="sub-hd">$1</h3>')
    .replace(/^#{4} (.+)$/gm, '<h4 class="sub-sub-hd">$1</h4>')
    .replace(/^---$/gm, '<hr class="inner-hr">')
    .split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<') || p.startsWith('•')) return p;
      return '<p>' + p + '</p>';
    }).join('\n');
}

// Extract Fruitful Moments
function extractFruitfulMoments(content) {
  const moments = [];
  const regex = /\*\*FRUITFUL MOMENT[^*]*\*\*[:\s—]*([\s\S]*?)(?=\n\*\*[A-Z]|\n##|\n---END|$)/gi;
  let match;
  const lines = content.split('\n');
  let inFM = false, fmTitle = '', fmLines = [], fmCount = 0;
  for (const line of lines) {
    const fmMatch = line.match(/\*\*FRUITFUL MOMENT[^*]*\*\*/i) || line.match(/^FRUITFUL MOMENT[:\s—]/i);
    if (fmMatch) {
      if (inFM && fmLines.length) moments.push({ title: fmTitle, content: fmLines.join('\n') });
      fmTitle = line.replace(/\*\*/g, '').trim();
      fmLines = [];
      inFM = true;
      fmCount++;
    } else if (inFM) {
      if (line.match(/^## |^---END/)) {
        moments.push({ title: fmTitle, content: fmLines.join('\n') });
        inFM = false; fmLines = [];
      } else {
        fmLines.push(line);
      }
    }
  }
  if (inFM && fmLines.length) moments.push({ title: fmTitle, content: fmLines.join('\n') });
  return moments;
}

// Extract Story Gathering parts
function extractStoryParts(storyText) {
  const parts = { before: '', during: '', after: '' };
  const lines = storyText.split('\n');
  let cur = null;
  for (const line of lines) {
    if (line.match(/BEFORE READING/i)) cur = 'before';
    else if (line.match(/DURING READING/i)) cur = 'during';
    else if (line.match(/AFTER READING/i)) cur = 'after';
    else if (cur) parts[cur] += line + '\n';
  }
  return parts;
}

// Extract Family Connection
function extractFamilyConnection(reflectionText) {
  const match = reflectionText && reflectionText.match(/FAMILY CONNECTION[\s\S]*?(?=\n##|\n\*\*[A-Z]{3,}|\n---END|$)/i);
  return match ? match[0] : '';
}

// Extract Documentation Examples (formerly Circle of Friends scenarios)
function extractDocExamples(content) {
  const examples = [];
  const lines = content.split('\n');
  let inEx = false, exTitle = '', exLines = [];
  for (const line of lines) {
    if (line.match(/CIRCLE OF FRIENDS SCENARIO|DOCUMENTATION EXAMPLE/i)) {
      if (inEx && exLines.length) examples.push({ title: exTitle, content: exLines.join('\n') });
      exTitle = line.replace(/\*\*/g, '').trim();
      exLines = []; inEx = true;
    } else if (inEx) {
      if (line.match(/^##/) || line.match(/FRUIT OF THE SPIRIT WATCH/i) || line.match(/^---END/)) {
        if (exLines.length) examples.push({ title: exTitle, content: exLines.join('\n') });
        inEx = false; exLines = [];
      } else {
        exLines.push(line);
      }
    }
  }
  if (inEx && exLines.length) examples.push({ title: exTitle, content: exLines.join('\n') });
  return examples;
}

// Build the full HTML page
async function buildLessonPage(lesson) {
  const content = lesson.content || '';
  const sections = parseLessonSections(content);
  const fruitfulMoments = extractFruitfulMoments(content);
  const docExamples = extractDocExamples(content);

  const storySection = sections['STORY GATHERING'] || sections['4. STORY GATHERING'] || '';
  const storyParts = extractStoryParts(storySection);
  const familyConnection = extractFamilyConnection(sections['REFLECTION TIME'] || sections['9. REFLECTION TIME'] || '');

  let bookCoverUrl = null;
  if (lesson.required_book) {
    try {
      const book = typeof lesson.required_book === 'string' ? JSON.parse(lesson.required_book) : lesson.required_book;
      bookCoverUrl = await fetchBookCover(book.title, book.author);
    } catch(e) {}
  }

  const dayNum = lesson.day_number || 1;
  const isOptional = dayNum >= 21;

  // JSON-encode data for inline JS
  const fmJSON = JSON.stringify(fruitfulMoments);
  const docJSON = JSON.stringify(docExamples);
  const storyJSON = JSON.stringify(storyParts);
  const fcText = familyConnection.replace(/`/g, "'").replace(/\\/g, '\\\\');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FF · Day ${dayNum} · ${lesson.focus || ''}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--gd:#1B4332;--gm:#2D6A4F;--gl:#52B788;--gp:#D8F3DC;--gold:#D4A017;--goldb:#FFF3CD;--br:#774936;--cream:#FDFAF5;--tx:#1A1A2E;--txl:#4A5568;--bdr:#E2E8F0;--pur:#553C9A;--purp:#E9D8FD;--red:#C53030;--ora:#E76F51;--orap:#FFF3EE;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Source Sans 3',sans-serif;background:var(--cream);color:var(--tx);font-size:15px;line-height:1.7;}

/* TOPBAR */
.topbar{background:var(--gd);color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;box-shadow:0 2px 8px rgba(0,0,0,.25);}
.topbar-brand{font-family:'Playfair Display',serif;font-size:17px;color:#D8F3DC;}
.topbar-btns{display:flex;gap:8px;flex-wrap:wrap;}
.tbtn{padding:5px 14px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;transition:.2s;}
.tbtn-back{background:transparent;color:#D8F3DC;border:1px solid #52B788;}
.tbtn-prep{background:#2D6A4F;color:#fff;border:1px solid #52B788;}
.tbtn-fm{background:#E76F51;color:#fff;}
.tbtn-print{background:var(--gold);color:#1A1A2E;}

/* LAYOUT */
.wrap{max-width:1000px;margin:0 auto;padding:28px 20px;}

/* TITLE */
.lesson-title{font-family:'Playfair Display',serif;font-size:26px;color:var(--gd);line-height:1.3;margin-bottom:6px;}
.lesson-sub{font-size:15px;color:var(--txl);margin-bottom:16px;}
.meta-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid var(--gl);}
.badge{padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;}
.badge-g{background:var(--gp);color:var(--gd);}
.badge-f{background:var(--goldb);color:var(--br);}
.badge-pub{background:#C6F6D5;color:#276749;}
.badge-app{background:#FFF3CD;color:#744210;}
.badge-dft{background:#FED7D7;color:#9B2C2C;}
.badge-opt{background:#E9D8FD;color:#553C9A;}

/* JUMP NAV */
.jump-nav{background:#fff;border-radius:10px;padding:12px 16px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.jump-nav-label{font-size:11px;color:var(--txl);text-transform:uppercase;font-weight:700;width:100%;margin-bottom:2px;}
.jlink{background:var(--gp);color:var(--gd);padding:5px 12px;border-radius:16px;font-size:12px;font-weight:700;cursor:pointer;border:none;text-decoration:none;display:inline-block;transition:.2s;}
.jlink:hover{background:var(--gl);color:#fff;}

/* PREP BANNER */
.prep-banner{background:#EBF8FF;border:1px solid #90CDF4;border-radius:10px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:14px;}
.prep-banner-icon{font-size:26px;}
.prep-banner-text strong{display:block;color:#2B6CB0;font-size:14px;}
.prep-banner-text span{font-size:12px;color:var(--txl);}
.prep-banner-btn{background:#2B6CB0;color:#fff;padding:7px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;}

/* SECTION CARDS */
.sec{margin-bottom:28px;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);}
.sec-hd{padding:13px 22px;display:flex;align-items:center;gap:10px;color:#fff;}
.sec-icon{font-size:20px;}
.sec-title{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;}
.sec-body{background:#fff;padding:22px;}

/* TEACHER SCRIPTS */
.t-script{background:var(--gp);border-left:4px solid var(--gl);border-radius:0 8px 8px 0;padding:10px 14px;margin:8px 0;display:flex;gap:10px;}
.speaker{padding:2px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;flex-shrink:0;margin-top:3px;}
.teacher-sp{background:var(--gd);color:#fff;}
.children-sp{background:var(--gold);color:#1A1A2E;}
.child-sp{background:var(--pur);color:#fff;}
.stage{color:#666;font-style:italic;display:block;padding:3px 14px;border-left:2px solid #CBD5E0;margin:4px 0;}
.step-hd{background:var(--gd);color:#fff;padding:7px 14px;border-radius:6px;font-weight:700;font-size:13px;margin:14px 0 6px 0;letter-spacing:.4px;}
ul{padding-left:20px;margin:6px 0;}
li{padding:3px 0;}
p{margin:5px 0;}
.sub-hd{font-family:'Playfair Display',serif;font-size:15px;color:var(--gd);margin:18px 0 8px 0;padding-bottom:3px;border-bottom:2px solid var(--gp);}
.sub-sub-hd{font-size:13px;font-weight:800;color:var(--br);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 5px 0;}
.inner-hr{border:none;height:2px;background:linear-gradient(to right,var(--gp),var(--gl),var(--gp));margin:20px 0;border-radius:2px;}

/* CLICKABLE BLOCKS */
.clickable-block{background:var(--orap);border:2px solid var(--ora);border-radius:10px;padding:14px 18px;margin:10px 0;cursor:pointer;transition:.2s;display:flex;align-items:center;justify-content:space-between;}
.clickable-block:hover{background:#FFE8DE;border-color:#C4512B;}
.clickable-block-title{font-family:'Playfair Display',serif;font-size:15px;color:var(--ora);font-weight:700;}
.clickable-block-hint{font-size:12px;color:var(--txl);}
.cb-arrow{color:var(--ora);font-size:18px;}

/* STORY CLICKABLE */
.story-part-btn{background:var(--gp);border:2px solid var(--gl);border-radius:10px;padding:12px 18px;margin:8px 0;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:.2s;}
.story-part-btn:hover{background:#B7E4C7;border-color:var(--gd);}
.story-part-label{font-weight:800;font-size:14px;color:var(--gd);}
.story-part-hint{font-size:12px;color:var(--txl);}

/* DOC EXAMPLE LINK */
.doc-link{display:inline-flex;align-items:center;gap:6px;background:var(--purp);border:1px solid #B794F4;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:700;color:var(--pur);margin:8px 0;transition:.2s;}
.doc-link:hover{background:#D6BCFA;}

/* FAMILY CONNECTION */
.fc-box{background:#FFFBEB;border:2px solid var(--gold);border-radius:10px;padding:18px;margin:12px 0;}
.fc-title{font-family:'Playfair Display',serif;font-size:15px;color:var(--br);margin-bottom:10px;font-weight:700;}
.fc-copy-btn{background:var(--gold);color:#1A1A2E;border:none;border-radius:8px;padding:7px 18px;cursor:pointer;font-size:13px;font-weight:700;margin-top:10px;transition:.2s;}
.fc-copy-btn:hover{background:#B8860B;color:#fff;}

/* BOOK WIDGET */
.book-widget{display:flex;gap:14px;align-items:center;background:#F7FAFC;border-radius:10px;padding:14px;margin:12px 0;border:1px solid var(--bdr);}
.book-cover{width:70px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);}
.book-info strong{display:block;font-size:14px;}
.book-info em{font-size:13px;color:var(--txl);}

/* TREE DIAGRAM */
.diagram-box{text-align:center;background:var(--gp);border-radius:10px;padding:16px;margin:16px 0;}
.diagram-caption{font-size:12px;color:var(--txl);margin-top:6px;font-style:italic;}

/* HIDDEN PAGE PANELS */
.page-panel{display:none;background:#fff;border-radius:12px;padding:28px;margin-bottom:28px;box-shadow:0 2px 12px rgba(0,0,0,.08);}
.page-panel.active{display:block;}
.page-panel-title{font-family:'Playfair Display',serif;font-size:20px;margin-bottom:16px;}
.panel-close{margin-top:20px;padding:8px 20px;background:var(--gd);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;}
.print-btn{background:var(--gold);color:#1A1A2E;border:none;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:13px;font-weight:700;margin-right:8px;margin-top:10px;}

/* FRUITFUL CARD (printable) */
.fm-card{background:linear-gradient(135deg,#FFF8F0,#FFF3E0);border:2px solid #F4A261;border-radius:10px;padding:18px;margin:12px 0;page-break-inside:avoid;}
.fm-card-hd{font-family:'Playfair Display',serif;color:#E76F51;font-size:15px;font-weight:700;margin-bottom:8px;}

/* MODAL OVERLAY */
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal-box{background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:85vh;overflow-y:auto;padding:28px;box-shadow:0 8px 40px rgba(0,0,0,.25);position:relative;}
.modal-title{font-family:'Playfair Display',serif;font-size:20px;color:var(--gd);margin-bottom:16px;}
.modal-close-btn{position:absolute;top:16px;right:16px;background:var(--gp);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;font-weight:700;color:var(--gd);}
.modal-finish{background:var(--gl);color:#fff;border:none;border-radius:8px;padding:10px 24px;cursor:pointer;font-size:14px;font-weight:700;margin-top:20px;width:100%;}

/* PRINT */
@media print{.topbar,.jump-nav,.prep-banner,.page-panel:not(.active){display:none!important;}.sec{box-shadow:none;margin-bottom:12px;}.modal-overlay{display:none!important;}body{background:#fff;}}

/* RESPONSIVE */
@media(max-width:640px){.topbar-btns{gap:4px;}.tbtn{padding:4px 10px;font-size:11px;}.wrap{padding:16px 12px;}}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-brand">🌳 Faithful Foundations</div>
  <div class="topbar-btns">
    <button class="tbtn tbtn-back" onclick="window.history.back()">← Back</button>
    <button class="tbtn tbtn-prep" onclick="togglePanel('panel-prep')">📋 Prep</button>
    <button class="tbtn tbtn-fm" onclick="togglePanel('panel-fm')">🍎 Fruitful Moments</button>
    <button class="tbtn tbtn-print" onclick="window.print()">🖨️ Print</button>
  </div>
</div>

<div class="wrap">

  <div class="lesson-title">Faithful Foundations — Exploring Trees</div>
  <div class="lesson-sub">Day ${dayNum} of 25${isOptional ? ' <em style="color:var(--pur);font-size:13px;">(Optional/Bonus)</em>' : ''} — ${lesson.focus || ''}</div>
  <div class="meta-row">
    <span class="badge badge-g">Week ${lesson.week_number || ''}</span>
    <span class="badge badge-g">${(lesson.age_band || '').replace('_',' ').replace(/\b\w/g,l=>l.toUpperCase())}</span>
    <span class="badge badge-f">🍇 ${lesson.fruit_of_spirit || ''}</span>
    <span class="badge badge-g">📖 ${lesson.vocabulary_word || ''}</span>
    <span class="badge ${lesson.status === 'published' ? 'badge-pub' : lesson.status === 'approved' ? 'badge-app' : 'badge-dft'}">${lesson.status === 'published' ? '✓ Published' : lesson.status === 'approved' ? '✓ Approved' : '⚑ Draft'}</span>
    ${isOptional ? '<span class="badge badge-opt">★ Optional Day</span>' : ''}
  </div>

  <!-- JUMP NAV -->
  <div class="jump-nav" id="jump-nav">
    <div class="jump-nav-label">Jump to Section</div>
    <button class="jlink" onclick="jumpTo('sec-header')">📋 Header</button>
    <button class="jlink" onclick="jumpTo('sec-discovery')">⭕ Discovery Circle</button>
    <button class="jlink" onclick="jumpTo('sec-choice')">🎨 Choice Time</button>
    <button class="jlink" onclick="jumpTo('sec-story')">📖 Story Gathering</button>
    <button class="jlink" onclick="jumpTo('sec-skill1')">🌱 Skill Builders</button>
    <button class="jlink" onclick="jumpTo('sec-outdoor')">☀️ Outdoor</button>
    <button class="jlink" onclick="jumpTo('sec-reflection')">💛 Reflection</button>
    <button class="jlink" onclick="jumpTo('sec-heart')">❤️ Teacher's Heart</button>
  </div>

  <!-- PREP PANEL -->
  <div class="page-panel" id="panel-prep">
    <div class="page-panel-title" style="color:#2B6CB0;">📋 Materials & Lesson Preparation — Day ${dayNum}</div>
    <p style="color:var(--txl);font-size:13px;margin-bottom:16px;">Gather all items before children arrive. This checklist comes directly from your Header Block materials list.</p>
    <div id="prep-content">${md2html(sections['HEADER BLOCK'] || sections['1. HEADER BLOCK'] || '')}</div>
    <button class="print-btn" onclick="window.print()">🖨️ Print Prep Checklist</button>
    <button class="panel-close" onclick="togglePanel('panel-prep')">← Close</button>
  </div>

  <!-- FRUITFUL MOMENTS PANEL -->
  <div class="page-panel" id="panel-fm">
    <div class="page-panel-title" style="color:#E76F51;">🍎 Fruitful Moments — Day ${dayNum}</div>
    <p style="color:var(--txl);font-size:13px;margin-bottom:16px;">Print and post in your Discovery Circle area. Use throughout the day for transitions and gathering.</p>
    <div id="fm-list"></div>
    <button class="print-btn" onclick="window.print()">🖨️ Print Fruitful Moments</button>
    <button class="panel-close" onclick="togglePanel('panel-fm')">← Close</button>
  </div>

  <!-- PREP BANNER -->
  <div class="prep-banner">
    <div class="prep-banner-icon">📋</div>
    <div class="prep-banner-text">
      <strong>Materials & Lesson Preparation</strong>
      <span>Review materials checklist and room setup before children arrive</span>
    </div>
    <button class="prep-banner-btn" onclick="togglePanel('panel-prep')">Open Prep Checklist</button>
  </div>

  <!-- TREE PARTS DIAGRAM -->
  <div class="diagram-box" id="sec-header">
    ${TREE_PARTS_SVG}
    <div class="diagram-caption">Tree Parts Reference — trunk, branches, leaves, roots (underground)</div>
  </div>

  ${bookCoverUrl ? `<div class="book-widget"><img src="${bookCoverUrl}" class="book-cover" alt="book cover"><div class="book-info"><strong>${lesson.required_book ? (typeof lesson.required_book === 'string' ? JSON.parse(lesson.required_book).title : lesson.required_book.title) : ''}</strong><em>for Story Gathering today</em></div></div>` : ''}

  <!-- 1. HEADER BLOCK -->
  <div class="sec" id="sec-header-card">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;"><span class="sec-icon">🌳</span><span class="sec-title">Header Block</span></div>
    <div class="sec-body">${md2html(sections['HEADER BLOCK'] || sections['1. HEADER BLOCK'] || '')}</div>
  </div>

  <!-- 2. DISCOVERY CIRCLE -->
  <div class="sec" id="sec-discovery">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #74C69D;"><span class="sec-icon">⭕</span><span class="sec-title">Discovery Circle</span></div>
    <div class="sec-body">
      <div id="dc-fruitful-list"></div>
      ${md2html(sections['DISCOVERY CIRCLE'] || sections['2. DISCOVERY CIRCLE'] || '')}
    </div>
  </div>

  <!-- 3. CHOICE TIME -->
  <div class="sec" id="sec-choice">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #95D5B2;"><span class="sec-icon">🎨</span><span class="sec-title">Choice Time</span></div>
    <div class="sec-body">
      <div style="background:var(--purp);border:1px solid #B794F4;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:var(--pur);">
        💡 <strong>Curiosity Builders</strong> for all Choice Time centers are available in your <strong>Weekly Resources</strong> (Week ${lesson.week_number || ''}) — print and post in each area.
      </div>
      <button class="doc-link" onclick="openDocModal()">📋 Documentation Examples — click to view</button>
      ${md2html((sections['CHOICE TIME'] || sections['3. CHOICE TIME'] || '').replace(/CIRCLE OF FRIENDS SCENARIO[\s\S]*?(?=\n##|\n\*\*[A-Z]{3,}|\n---END|$)/gi, ''))}
    </div>
  </div>

  <!-- 4. STORY GATHERING -->
  <div class="sec" id="sec-story">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;"><span class="sec-icon">📖</span><span class="sec-title">Story Gathering</span></div>
    <div class="sec-body">
      <button class="story-part-btn" onclick="openStoryModal('before')">
        <div><div class="story-part-label">📖 Before Reading</div><div class="story-part-hint">Click to see full before-reading script</div></div>
        <span style="color:var(--gd);font-size:18px;">▶</span>
      </button>
      <button class="story-part-btn" onclick="openStoryModal('during')">
        <div><div class="story-part-label">📖 During Reading — Pause Points</div><div class="story-part-hint">Click to see discussion prompts and pause scripts</div></div>
        <span style="color:var(--gd);font-size:18px;">▶</span>
      </button>
      <button class="story-part-btn" onclick="openStoryModal('after')">
        <div><div class="story-part-label">📖 After Reading</div><div class="story-part-hint">Click to see closing discussion and vocabulary carry-forward</div></div>
        <span style="color:var(--gd);font-size:18px;">▶</span>
      </button>
    </div>
  </div>

  <!-- 5. SKILL BUILDERS PRIMARY -->
  <div class="sec" id="sec-skill1">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #B7E4C7;"><span class="sec-icon">🌱</span><span class="sec-title">Skill Builders Primary</span></div>
    <div class="sec-body">
      ${md2html((sections['SKILL BUILDERS PRIMARY'] || sections['5. SKILL BUILDERS PRIMARY'] || '').replace(/TEACHING SEQUENCE[\s\S]*?(?=\n##|\n\*\*MULTILINGUAL|\n---END|$)/gi,'').replace(/OBSERVATION QUESTIONS[\s\S]*?(?=\n##|\n---END|$)/gi,''))}
    </div>
  </div>

  <!-- 6. SKILL BUILDERS ADDITIONAL -->
  <div class="sec">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #B7E4C7;"><span class="sec-icon">✨</span><span class="sec-title">Skill Builders Additional</span></div>
    <div class="sec-body">
      ${md2html((sections['SKILL BUILDERS ADDITIONAL'] || sections['6. SKILL BUILDERS ADDITIONAL'] || '').replace(/TEACHING SEQUENCE[\s\S]*?(?=\n##|\n---END|$)/gi,''))}
    </div>
  </div>

  <!-- 7. FRUITFUL MOMENT TRANSITION -->
  <div class="sec">
    <div class="sec-hd" style="background:#E76F51;border-left:6px solid #F4A261;"><span class="sec-icon">🍎</span><span class="sec-title">Fruitful Moment Transition</span></div>
    <div class="sec-body" id="sec-fm-transition">
      <div id="fm-transition-content"></div>
    </div>
  </div>

  <!-- 8. OUTDOOR TIME -->
  <div class="sec" id="sec-outdoor">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #95D5B2;"><span class="sec-icon">☀️</span><span class="sec-title">Outdoor Time</span></div>
    <div class="sec-body">${md2html(sections['OUTDOOR TIME'] || sections['8. OUTDOOR TIME'] || '')}</div>
  </div>

  <!-- 9. REFLECTION TIME -->
  <div class="sec" id="sec-reflection">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;"><span class="sec-icon">💛</span><span class="sec-title">Reflection Time</span></div>
    <div class="sec-body">
      ${md2html((sections['REFLECTION TIME'] || sections['9. REFLECTION TIME'] || '').replace(/FAMILY CONNECTION[\s\S]*$/i,''))}
      <div class="fc-box" id="family-connection">
        <div class="fc-title">💌 Family Connection</div>
        <div id="fc-text">${md2html(familyConnection)}</div>
        <button class="fc-copy-btn" onclick="copyFamilyConnection()">📋 Copy for Daily Report</button>
        <span id="fc-copied" style="display:none;color:var(--gm);font-size:12px;margin-left:10px;font-weight:700;">✓ Copied!</span>
      </div>
    </div>
  </div>

  <!-- 10. TEACHER'S HEART -->
  <div class="sec" id="sec-heart">
    <div class="sec-hd" style="background:#774936;border-left:6px solid #C4956A;"><span class="sec-icon">❤️</span><span class="sec-title">Teacher's Heart</span></div>
    <div class="sec-body">${md2html(sections["TEACHER'S HEART"] || sections["TEACHERS HEART"] || sections['10. TEACHERS HEART'] || '')}</div>
  </div>

</div>

<!-- MODAL OVERLAY -->
<div class="modal-overlay" id="modal-overlay" style="display:none;" onclick="closeModal(event)">
  <div class="modal-box" onclick="event.stopPropagation()">
    <button class="modal-close-btn" onclick="closeModal()">✕</button>
    <div class="modal-title" id="modal-title">Title</div>
    <div id="modal-body"></div>
    <button class="modal-finish" onclick="closeModal()">✓ Finish — Return to Lesson</button>
  </div>
</div>

<script>
// Data from server
const FRUITFUL_MOMENTS = ${fmJSON};
const DOC_EXAMPLES = ${docJSON};
const STORY_PARTS = ${storyJSON};
const FC_TEXT = \`${fcText}\`;

// Populate FM list in panel
function renderFMPanel() {
  const el = document.getElementById('fm-list');
  if (!FRUITFUL_MOMENTS.length) { el.innerHTML = '<p style="color:var(--txl)">Fruitful Moments will appear here once extracted from the lesson content.</p>'; return; }
  el.innerHTML = FRUITFUL_MOMENTS.map((fm, i) =>
    '<div class="fm-card"><div class="fm-card-hd">🍎 ' + (fm.title || 'Fruitful Moment ' + (i+1)) + '</div>' + md2htmlClient(fm.content) + '</div>'
  ).join('');
}

// Render clickable FM blocks in Discovery Circle
function renderFMClickable() {
  const el = document.getElementById('dc-fruitful-list');
  if (!FRUITFUL_MOMENTS.length) return;
  el.innerHTML = FRUITFUL_MOMENTS.slice(0,2).map((fm, i) =>
    '<div class="clickable-block" onclick="openFMModal(' + i + ')">' +
    '<div><div class="clickable-block-title">🍎 ' + (fm.title || 'Fruitful Moment ' + (i+1)) + '</div>' +
    '<div class="clickable-block-hint">Tap to open full activity</div></div>' +
    '<span class="cb-arrow">▶</span></div>'
  ).join('');
}

// Render FM transition section
function renderFMTransition() {
  const el = document.getElementById('fm-transition-content');
  const fm = FRUITFUL_MOMENTS.find(f => (f.title || '').toUpperCase().includes('TRANSITION')) || FRUITFUL_MOMENTS[FRUITFUL_MOMENTS.length - 1];
  if (!fm) return;
  el.innerHTML = '<div class="clickable-block" onclick="openFMModal(' + (FRUITFUL_MOMENTS.indexOf(fm)) + ')">' +
    '<div><div class="clickable-block-title">🍎 ' + (fm.title || 'Transition Fruitful Moment') + '</div>' +
    '<div class="clickable-block-hint">Tap to open full activity</div></div>' +
    '<span class="cb-arrow">▶</span></div>';
}

// OPEN MODALS
function openFMModal(idx) {
  const fm = FRUITFUL_MOMENTS[idx];
  if (!fm) return;
  document.getElementById('modal-title').innerHTML = '🍎 ' + (fm.title || 'Fruitful Moment');
  document.getElementById('modal-body').innerHTML = md2htmlClient(fm.content);
  document.getElementById('modal-overlay').style.display = 'flex';
}

function openDocModal() {
  document.getElementById('modal-title').innerHTML = '📋 Documentation Examples';
  if (!DOC_EXAMPLES.length) {
    document.getElementById('modal-body').innerHTML = '<p style="color:var(--txl)">Documentation examples will appear here from your generated lesson content.</p>';
  } else {
    document.getElementById('modal-body').innerHTML = DOC_EXAMPLES.map(d =>
      '<div style="background:var(--purp);border-radius:8px;padding:14px;margin-bottom:12px;border-left:4px solid var(--pur);">' +
      '<strong style="color:var(--pur);display:block;margin-bottom:8px;">' + d.title + '</strong>' +
      md2htmlClient(d.content) + '</div>'
    ).join('');
  }
  document.getElementById('modal-overlay').style.display = 'flex';
}

function openStoryModal(part) {
  const labels = { before: '📖 Before Reading', during: '📖 During Reading — Pause Points', after: '📖 After Reading' };
  document.getElementById('modal-title').innerHTML = labels[part] || 'Story Gathering';
  const txt = STORY_PARTS[part] || 'Content not extracted — view in lesson text.';
  document.getElementById('modal-body').innerHTML = md2htmlClient(txt);
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').style.display = 'none';
  }
}

// PANELS
function togglePanel(id) {
  const panels = ['panel-prep', 'panel-fm'];
  panels.forEach(p => {
    const el = document.getElementById(p);
    if (p === id) {
      const wasActive = el.classList.contains('active');
      el.classList.toggle('active');
      if (!wasActive) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      el.classList.remove('active');
    }
  });
}

// JUMP TO
function jumpTo(id) {
  const el = document.getElementById(id);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

// COPY FAMILY CONNECTION
function copyFamilyConnection() {
  const text = document.getElementById('fc-text').innerText || FC_TEXT;
  navigator.clipboard.writeText(text).then(() => {
    const msg = document.getElementById('fc-copied');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2500);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const msg = document.getElementById('fc-copied');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2500);
  });
}

// CLIENT-SIDE MD TO HTML (lightweight)
function md2htmlClient(text) {
  if (!text) return '';
  return text
    .replace(/\*\*TEACHER:\*\*\s*/g, '<span class="speaker teacher-sp">TEACHER</span> ')
    .replace(/\*\*CHILDREN:\*\*\s*/g, '<span class="speaker children-sp">CHILDREN</span> ')
    .replace(/\*\*([A-Z][A-Z]+):\*\*\s*/g, '<span class="speaker child-sp">$1</span> ')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="stage">$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^#{2,4} (.+)$/gm, '<div class="sub-hd">$1</div>')
    .split('\n\n').map(p => { p = p.trim(); if (!p || p.startsWith('<')) return p; return '<p>' + p + '</p>'; }).join('');
}

// INIT
document.addEventListener('DOMContentLoaded', function() {
  renderFMPanel();
  renderFMClickable();
  renderFMTransition();
});
</script>
</body>
</html>`;
}

// Route
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_lessons WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).send('<h2 style="padding:40px;font-family:sans-serif;">Lesson not found</h2>');
    const page = await buildLessonPage(result.rows[0]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page);
  } catch (err) {
    res.status(500).send('<h2 style="padding:40px;font-family:sans-serif;">Error: ' + err.message + '</h2>');
  }
});

module.exports = router;
