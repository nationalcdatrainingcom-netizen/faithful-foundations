const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ── BOOK COVER ──
async function fetchBookCover(title, author) {
  try {
    const q = encodeURIComponent((title || '') + ' ' + (author || ''));
    const res = await fetch('https://openlibrary.org/search.json?q=' + q + '&limit=3');
    const data = await res.json();
    if (data.docs) {
      for (const doc of data.docs) {
        if (doc.cover_i) return 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg';
      }
    }
  } catch (e) {}
  return null;
}

// ── TREE PHOTO (real photograph via Pexels CDN — no auth needed) ──
const TREE_PHOTO = `<div style="border-radius:12px;overflow:hidden;max-width:480px;margin:0 auto;position:relative;">
  <img src="https://images.pexels.com/photos/1179229/pexels-photo-1179229.jpeg?auto=compress&cs=tinysrgb&w=680&h=320&fit=crop"
       alt="A large oak tree with visible trunk, branches, and roots"
       style="width:100%;height:220px;object-fit:cover;display:block;"
       onerror="this.parentElement.innerHTML='<div style=\'background:#F0FFF4;height:220px;display:flex;align-items:center;justify-content:center;font-size:64px;\'>🌳</div>'">
  <div style="position:absolute;bottom:8px;left:8px;right:8px;display:flex;gap:6px;flex-wrap:wrap;">
    <span style="background:rgba(27,67,50,.88);color:#D8F3DC;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">🌿 Leaves</span>
    <span style="background:rgba(90,53,25,.88);color:#F7E6D3;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">🌲 Branches</span>
    <span style="background:rgba(107,66,38,.88);color:#F7E6D3;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">🪵 Trunk</span>
    <span style="background:rgba(27,67,50,.88);color:#D8F3DC;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">🌱 Roots</span>
  </div>
</div>`;

// ── SECTION PARSER ──
function parseLessonSections(markdown) {
  const sections = {};
  let current = null;
  let buffer = [];
  for (const line of (markdown || '').split('\n')) {
    if (line.startsWith('## ')) {
      if (current) sections[current] = buffer.join('\n');
      // Strip leading number like "1. " or "1. "
      current = line.slice(3).replace(/^\d+[\.\)]\s*/, '').trim().toUpperCase();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n');
  return sections;
}

// Flexible section lookup — handles name variations
function getSection(sections, ...candidates) {
  for (const key of candidates) {
    const up = key.toUpperCase();
    // Exact match
    if (sections[up]) return sections[up];
    // Partial match
    const found = Object.keys(sections).find(k => k.includes(up) || up.includes(k));
    if (found) return sections[found];
  }
  return '';
}

// ── MD → HTML (server-side) ──
function md2html(text) {
  if (!text) return '';
  return text
    .replace(/\*\*TEACHER:\*\*\s*/g, '<span class="sp-teacher">TEACHER</span> ')
    .replace(/\*\*CHILDREN:\*\*\s*/g, '<span class="sp-children">CHILDREN</span> ')
    .replace(/\*\*([A-Z][A-Z ]+):\*\*\s*/g, '<span class="sp-child">$1</span> ')
    .replace(/\*\*(STEP \d+[^*]*)\*\*/g, '<div class="step-hd">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="stage">$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="num">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, m => '<ul>' + m + '</ul>')
    .replace(/^### (.+)$/gm, '<h3 class="sub-hd">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 class="sub-sub-hd">$1</h4>')
    .replace(/^\|(.+)\|$/gm, (m, row) => {
      const cells = row.split('|').map(c => c.trim());
      if (cells.every(c => c.match(/^[-:]+$/))) return '';
      return '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
    })
    .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, m => '<table class="tbl"><tbody>' + m + '</tbody></table>')
    .replace(/^---$/gm, '<hr class="inner-hr">')
    .split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<')) return p;
      return '<p>' + p + '</p>';
    }).join('\n');
}

// ── EXTRACT FRUITFUL MOMENTS ──
function extractFruitfulMoments(content) {
  const moments = [];
  const lines = (content || '').split('\n');
  let inFM = false, fmTitle = '', fmLines = [];
  for (const line of lines) {
    const isFM = line.match(/\*\*FRUITFUL MOMENT[^*]*\*\*/i) ||
                 line.match(/^#{1,4}\s*FRUITFUL MOMENT/i) ||
                 line.match(/^FRUITFUL MOMENT\s*[:—]/i);
    if (isFM) {
      if (inFM && fmLines.length) moments.push({ title: fmTitle, content: fmLines.join('\n').trim() });
      fmTitle = line.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
      fmLines = []; inFM = true;
    } else if (inFM) {
      if (line.match(/^## /)) {
        moments.push({ title: fmTitle, content: fmLines.join('\n').trim() });
        inFM = false; fmLines = [];
      } else {
        fmLines.push(line);
      }
    }
  }
  if (inFM && fmLines.length) moments.push({ title: fmTitle, content: fmLines.join('\n').trim() });
  return moments;
}

// ── EXTRACT STORY PARTS ──
function extractStoryParts(storyText) {
  const parts = { before: '', during: '', after: '', full: storyText || '' };
  if (!storyText) return parts;
  const lines = storyText.split('\n');
  let cur = null;
  for (const line of lines) {
    const low = line.toLowerCase().replace(/[*#_\s]/g, '');
    if (low.match(/beforereading/)) { cur = 'before'; continue; }
    else if (low.match(/duringreading/)) { cur = 'during'; continue; }
    else if (low.match(/afterreading/)) { cur = 'after'; continue; }
    if (cur !== null) parts[cur] += line + '\n';
  }
  return parts;
}

// ── EXTRACT DOC EXAMPLES ──
function extractDocExamples(content) {
  const examples = [];
  const lines = (content || '').split('\n');
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

// ── BUILD FAMILY CONNECTION ──
function buildFamilyConnection(lesson, sections) {
  const reflText = getSection(sections, 'REFLECTION TIME', '9. REFLECTION TIME');
  const fcMatch = reflText.match(/FAMILY CONNECTION([\s\S]{40,}?)(?=\n##|\n\*\*[A-Z]{4}|$)/i);
  if (fcMatch && fcMatch[1] && fcMatch[1].trim().length > 40) return fcMatch[1].trim();

  const focus = lesson.focus || 'trees';
  const vocab = lesson.vocabulary_word || '';
  const fruit = lesson.fruit_of_spirit || 'kindness';
  const dayNum = lesson.day_number || 1;
  return `Today in **Faithful Foundations** we explored **"${focus}"** — Day ${dayNum} of our Exploring Trees study.\n\n` +
    `**What we did today:**\n` +
    `- Gathered in Discovery Circle to wonder and investigate together\n` +
    `- Learned our vocabulary word: **${vocab}**\n` +
    `- Read a book and talked about what we discovered\n` +
    `- Explored through hands-on Choice Time activities\n` +
    `- Practiced **${fruit}** with our Circle of Friends\n\n` +
    `**Ask your child:** "What did you discover about trees today? What surprised you the most?"`;
}

// ── SPANISH PRONUNCIATION LOOKUP ──
function spanishPron(word) {
  const map = {
    'arbol':'AHR-bol','árbol':'AHR-bol','raiz':'rah-EES','raíz':'rah-EES',
    'raices':'rah-EE-sehs','raíces':'rah-EE-sehs','hoja':'OH-hah','hojas':'OH-hahs',
    'rama':'RAH-mah','ramas':'RAH-mahs','tronco':'TROHN-koh','semilla':'seh-MEE-yah',
    'semillas':'seh-MEE-yahs','fruta':'FROO-tah','bosque':'BOHS-keh',
    'tierra':'TYEH-rah','agua':'AH-gwah','sol':'sohl','verde':'BEHR-deh',
    'corteza':'kor-TEH-sah','dosel':'doh-SEHL','refugio':'reh-FOO-hyoh',
    'crecer':'kreh-SEHR','estaciones':'ehs-tah-SYOH-nehs','cambio':'KAHM-byoh',
    'observar':'ohb-sehr-BAHR','comparar':'kohm-pah-RAHR','asombro':'ah-SOHM-broh',
    'comunidad':'koh-moo-nee-DAHD','crecimiento':'kreh-see-MYEHN-toh',
    'unico':'OO-nee-koh','único':'OO-nee-koh','conectado':'koh-nehk-TAH-doh',
  };
  const lower = (word || '').toLowerCase().trim();
  return map[lower] || null;
}

// ── FM TRANSITION BUTTON HTML — shows ONE activity ──
function fmBtn(fruitfulMoments, idx, label) {
  const fm = fruitfulMoments[idx];
  if (fm) {
    // Extract the first complete activity from the FM content (up to first double-newline or 250 chars)
    const preview = (fm.title || label || 'Fruitful Moment');
    return `<button class="fm-transition-btn" onclick="FF.openFMModal(${idx})">
      <span style="font-size:20px;">🍎</span>
      <div style="flex:1;">
        <div class="fm-tb-title">${preview}</div>
        <div class="fm-tb-hint">Tap to open transition activity</div>
      </div>
      <span class="fm-tb-arrow">▶</span>
    </button>`;
  }
  // Generic fallback — ONE pre-selected activity per transition context
  const singles = {
    'Transition to Choice Time':    'Planning Time — each child tells the teacher their area and plan before moving one by one',
    'Transition to Story Gathering':'Leaf Shape — float like a falling leaf to the Story Gathering spot',
    'Transition to Skill Builders': 'Tree Freeze — freeze in a tree-part shape, then walk to small group',
    'Transition to Outdoor Time':   'Counting Breath — breathe in 4 counts (roots), out 4 counts (leaves), then line up',
    'Transition to Reflection Time':'Wonder Sentence — each child completes "I wonder..." before sitting',
    'Transition to Bible Storytime':'Peace Walk — quiet hands-folded walk to gathering area',
    'Transition to Goodbye Circle': 'Gratitude Round — share one thankful thought before joining the circle',
  };
  const activity = singles[label] || '<strong>Whisper Walk:</strong> Hands on shoulders of the person in front, whisper-walk quietly to the next activity.';
  return `<button class="fm-transition-btn" onclick="FF.openGenericTransition('${(label || 'Transition').replace(/'/g, '\\u0027')}')">
    <span style="font-size:20px;">🍎</span>
    <div style="flex:1;">
      <div class="fm-tb-title">${label || 'Fruitful Moment Transition'}</div>
      <div class="fm-tb-hint">Tap to open transition activity</div>
    </div>
    <span class="fm-tb-arrow">▶</span>
  </button>`;
}

// ── BUILD LESSON PAGE ──
async function buildLessonPage(lesson) {
  const content = lesson.content || '';
  const sections = parseLessonSections(content);
  const allKeys = Object.keys(sections);

  const fruitfulMoments = extractFruitfulMoments(content);
  const docExamples = extractDocExamples(content);
  const storySection = getSection(sections, 'STORY GATHERING', '4. STORY GATHERING', 'STORY');
  const storyParts = extractStoryParts(storySection);
  const familyConnectionText = buildFamilyConnection(lesson, sections);

  let bookCoverUrl = null, bookTitle = '', bookAuthor = '';
  if (lesson.required_book) {
    try {
      const book = typeof lesson.required_book === 'string' ? JSON.parse(lesson.required_book) : lesson.required_book;
      bookTitle = book.title || ''; bookAuthor = book.author || '';
      bookCoverUrl = await fetchBookCover(bookTitle, bookAuthor);
    } catch(e) {}
  }

  const dayNum = lesson.day_number || 1;
  const isOptional = dayNum >= 21;
  const vocab = lesson.vocabulary_word || '';
  // Spanish word: use db field first; fall back to extracting from lesson content
  let spanishVocabWord = lesson.spanish_vocabulary || '';
  if (!spanishVocabWord && vocab) {
    // Try to find "Spanish: X" or "En Español: X" or "Árbol" pattern in header block
    const hdr = getSection(content.split ? {hdr: content} : {}, 'HEADER BLOCK', '1. HEADER BLOCK') || content;
    const esMatch = hdr.match(/[Ee]n [Ee]spa[ñn]ol[:\s]+([A-Za-zÁáÉéÍíÓóÚúÜüÑñ]+)/i) ||
                    hdr.match(/Spanish[:\s]+([A-Za-zÁáÉéÍíÓóÚúÜüÑñ]+)/i) ||
                    content.match(/Vocabulary[^:]*:\s*[^\n]*\(([A-Za-zÁáÉéÍíÓóÚúÜüÑñ]+)\)/i);
    if (esMatch) spanishVocabWord = esMatch[1];
  }
  // Last resort: look up from our known map
  if (!spanishVocabWord && vocab) {
    const knownEs = {
      'tree':'Árbol','roots':'Raíces','trunk':'Tronco','branches':'Ramas','leaves':'Hojas',
      'bark':'Corteza','seeds':'Semillas','fruit':'Fruta','sunlight':'Sol','water':'Agua',
      'forest':'Bosque','soil':'Tierra','canopy':'Dosel','shelter':'Refugio','grow':'Crecer',
      'seasons':'Estaciones','change':'Cambio','observe':'Observar','compare':'Comparar','wonder':'Asombro',
      'community':'Comunidad','growth':'Crecimiento','unique':'Único','connected':'Conectado'
    };
    spanishVocabWord = knownEs[vocab.toLowerCase()] || '';
  }
  const pronHint = spanishPron(spanishVocabWord);

  // Section content
  const headerContent = getSection(sections, 'HEADER BLOCK', '1. HEADER BLOCK', 'HEADER');
  const discoveryContent = getSection(sections, 'DISCOVERY CIRCLE', '2. DISCOVERY CIRCLE', 'DISCOVERY');
  const choiceRaw = getSection(sections, 'CHOICE TIME', '3. CHOICE TIME', 'CHOICE');
  const choiceContent = choiceRaw.replace(/CIRCLE OF FRIENDS SCENARIO[\s\S]*?(?=\n###|\n##|FRUIT OF THE SPIRIT|\n---END|$)/gi, '');
  const skillPrimary = getSection(sections, 'SKILL BUILDERS PRIMARY', '5. SKILL BUILDERS PRIMARY', 'SKILL BUILDERS');
  const skillAdditional = getSection(sections, 'SKILL BUILDERS ADDITIONAL', '6. SKILL BUILDERS ADDITIONAL');
  const outdoorContent = getSection(sections, 'OUTDOOR TIME', '8. OUTDOOR TIME', 'OUTDOOR');
  const reflectionContent = getSection(sections, 'REFLECTION TIME', '9. REFLECTION TIME', 'REFLECTION')
    .replace(/FAMILY CONNECTION[\s\S]*$/i, '');
  const teachersHeart = getSection(sections, "TEACHER'S HEART", 'TEACHERS HEART', '10. TEACHERS HEART', "TEACHER'S HEART", 'HEART');

  // Debug info (removed in prod but helpful for now)
  const debugKeys = allKeys.join(' | ');

  // Safe JSON for inline script
  const safeJSON = (obj) => JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>').replace(/\\/g, '\\\\').replace(/`/g, '\\`');

  const fmJSON = JSON.stringify(fruitfulMoments).replace(/<\/script>/gi, '<\\/script>');
  const docJSON = JSON.stringify(docExamples).replace(/<\/script>/gi, '<\\/script>');
  const storyJSON = JSON.stringify(storyParts).replace(/<\/script>/gi, '<\\/script>');
  const fcJSON = JSON.stringify(familyConnectionText).replace(/<\/script>/gi, '<\\/script>');

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

/* TOPBAR */
.topbar{background:var(--gd);color:#fff;padding:10px 20px;display:flex;align-items:center;
  justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.3);}
.topbar-brand{font-family:'Playfair Display',serif;font-size:16px;color:#D8F3DC;flex-shrink:0;}
.topbar-btns{display:flex;gap:7px;flex-wrap:wrap;}
.tbtn{padding:5px 13px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;
  transition:.15s;font-family:inherit;-webkit-tap-highlight-color:transparent;}
.tbtn-back{background:transparent;color:#D8F3DC;border:1px solid #52B788;}
.tbtn-back:hover{background:#2D6A4F;}
.tbtn-prep{background:#2D6A4F;color:#fff;border:1px solid #52B788;}
.tbtn-prep:hover{background:#40916C;}
.tbtn-fm{background:#E76F51;color:#fff;}
.tbtn-fm:hover{background:#C4512B;}
.tbtn-print{background:var(--gold);color:#1A1A2E;}
.tbtn-print:hover{background:#B8860B;color:#fff;}

/* LAYOUT */
.wrap{max-width:860px;margin:0 auto;padding:28px 20px;}

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
.badge-opt{background:var(--purp);color:var(--pur);}

/* JUMP NAV */
.jump-nav{background:#fff;border-radius:10px;padding:12px 16px;margin-bottom:24px;
  box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex;flex-wrap:wrap;gap:8px;}
.jump-label{font-size:11px;color:var(--txl);text-transform:uppercase;font-weight:700;width:100%;margin-bottom:2px;}
.jlink{background:var(--gp);color:var(--gd);padding:5px 12px;border-radius:16px;font-size:12px;
  font-weight:700;cursor:pointer;border:none;transition:.15s;font-family:inherit;}
.jlink:hover{background:var(--gl);color:#fff;}

/* PREP BANNER */
.prep-banner{background:#EBF8FF;border:1px solid #90CDF4;border-radius:10px;padding:14px 18px;
  margin-bottom:24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.prep-text strong{display:block;color:#2B6CB0;font-size:14px;}
.prep-text span{font-size:12px;color:var(--txl);}
.prep-open-btn{background:#2B6CB0;color:#fff;padding:7px 16px;border-radius:8px;border:none;
  cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;}

/* VOCAB CARD */
.vocab-card{background:linear-gradient(135deg,var(--gp),#fff);border:2px solid var(--gl);
  border-radius:12px;padding:20px 22px;margin-bottom:24px;
  display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.vocab-lbl{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--txl);font-weight:700;margin-bottom:4px;}
.vocab-en{font-family:'Playfair Display',serif;font-size:24px;color:var(--gd);font-weight:700;}
.vocab-def{font-size:13px;color:var(--tx);margin-top:5px;line-height:1.6;}
.vocab-es{font-size:20px;font-weight:700;color:var(--gm);}
.vocab-pron{font-size:13px;color:var(--txl);font-style:italic;margin-top:3px;}

/* SECTION CARDS */
.sec{margin-bottom:28px;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);}
.sec-hd{padding:13px 22px;display:flex;align-items:center;gap:10px;color:#fff;}
.sec-icon{font-size:20px;}
.sec-title{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;}
.sec-body{background:#fff;padding:22px;}
.empty-notice{color:var(--txl);font-size:13px;font-style:italic;padding:10px;
  background:#F7FAFC;border-radius:8px;border:1px dashed var(--bdr);}

/* SCRIPTS */
.sp-teacher{background:var(--gd);color:#fff;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;}
.sp-children{background:var(--gold);color:#1A1A2E;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;}
.sp-child{background:var(--pur);color:#fff;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;}
.stage{color:#666;font-style:italic;display:block;padding:3px 14px;border-left:2px solid #CBD5E0;margin:4px 0;}
.step-hd{background:var(--gd);color:#fff;padding:7px 14px;border-radius:6px;font-weight:700;font-size:13px;margin:12px 0 6px;}
ul{padding-left:20px;margin:6px 0;}li{padding:3px 0;}p{margin:5px 0;}
.sub-hd{font-family:'Playfair Display',serif;font-size:15px;color:var(--gd);margin:18px 0 8px;padding-bottom:3px;border-bottom:2px solid var(--gp);}
.sub-sub-hd{font-size:13px;font-weight:800;color:var(--br);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 5px;}
.inner-hr{border:none;height:2px;background:linear-gradient(to right,var(--gp),var(--gl),var(--gp));margin:18px 0;border-radius:2px;}
.tbl{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px;}
.tbl td{border:1px solid var(--bdr);padding:7px 10px;vertical-align:top;}
.tbl tr:first-child td{background:var(--gp);font-weight:700;color:var(--gd);}

/* FM TRANSITION BUTTONS */
.fm-transition-btn{background:linear-gradient(135deg,#FFF8F0,#FFE8D6);border:2px solid #F4A261;
  border-radius:10px;padding:12px 16px;margin:16px 0;cursor:pointer;transition:.15s;
  display:flex;align-items:center;gap:12px;width:100%;text-align:left;font-family:inherit;}
.fm-transition-btn:hover,.fm-transition-btn:focus{background:#FFE0C0;border-color:var(--ora);outline:none;}
.fm-tb-title{font-weight:800;font-size:14px;color:#C4512B;}
.fm-tb-hint{font-size:12px;color:var(--txl);}
.fm-tb-arrow{color:var(--ora);font-size:18px;margin-left:auto;flex-shrink:0;}

/* STORY BUTTONS */
.story-btn{background:var(--gp);border:2px solid var(--gl);border-radius:10px;
  padding:12px 18px;margin:8px 0;cursor:pointer;display:flex;align-items:center;
  justify-content:space-between;transition:.15s;width:100%;text-align:left;font-family:inherit;}
.story-btn:hover,.story-btn:focus{background:#B7E4C7;border-color:var(--gd);outline:none;}
.story-btn-label{font-weight:800;font-size:14px;color:var(--gd);}
.story-btn-hint{font-size:12px;color:var(--txl);}

/* DOC BUTTON */
.doc-btn{display:inline-flex;align-items:center;gap:6px;background:var(--purp);
  border:2px solid #B794F4;border-radius:8px;padding:8px 16px;cursor:pointer;
  font-size:13px;font-weight:700;color:var(--pur);margin:8px 0;transition:.15s;font-family:inherit;}
.doc-btn:hover,.doc-btn:focus{background:#D6BCFA;outline:none;}

/* FAMILY CONNECTION */
.fc-box{background:#FFFBEB;border:2px solid var(--gold);border-radius:10px;padding:20px;margin:14px 0;}
.fc-title{font-family:'Playfair Display',serif;font-size:16px;color:var(--br);margin-bottom:12px;font-weight:700;}
.fc-body{font-size:14px;line-height:1.8;color:var(--tx);}
.fc-question{background:var(--goldb);border-left:4px solid var(--gold);border-radius:0 8px 8px 0;
  padding:10px 16px;margin:12px 0;font-size:14px;font-weight:600;color:var(--br);}
.fc-copy-btn{background:var(--gold);color:#1A1A2E;border:none;border-radius:8px;padding:8px 20px;
  cursor:pointer;font-size:13px;font-weight:700;margin-top:12px;transition:.15s;font-family:inherit;}
.fc-copy-btn:hover{background:#B8860B;color:#fff;}
.fc-copied{display:none;color:var(--gm);font-size:13px;margin-left:12px;font-weight:800;
  background:var(--gp);padding:4px 12px;border-radius:12px;vertical-align:middle;}

/* BOOK WIDGET */
.book-widget{display:flex;gap:14px;align-items:center;background:#F7FAFC;border-radius:10px;
  padding:14px;margin:12px 0;border:1px solid var(--bdr);}
.book-cover{width:65px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);}

/* PAGE PANELS (Prep / FM) */
.page-panel{display:none;position:fixed;inset:0;background:#fff;z-index:1000;overflow-y:auto;padding:0;}
.page-panel.open{display:block;}
.panel-hd{position:sticky;top:0;background:#fff;z-index:5;padding:14px 24px;
  border-bottom:2px solid var(--bdr);display:flex;align-items:center;gap:10px;box-shadow:0 2px 6px rgba(0,0,0,.08);}
.panel-hd-title{font-family:'Playfair Display',serif;font-size:19px;flex:1;}
.panel-close{background:var(--gd);color:#fff;border:none;border-radius:8px;padding:7px 16px;
  cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;}
.panel-print{background:var(--gold);color:#1A1A2E;border:none;border-radius:8px;padding:7px 16px;
  cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;}
.panel-body{padding:24px 32px;}
/* FM cards in panel — single column, padded */
.fm-card{background:linear-gradient(135deg,#FFF8F0,#FFF3E0);border:2px solid #F4A261;
  border-radius:10px;padding:20px;margin-bottom:20px;}
.fm-card-hd{font-family:'Playfair Display',serif;color:#E76F51;font-size:16px;font-weight:700;margin-bottom:8px;}

/* MODAL */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;
  display:none;align-items:center;justify-content:center;padding:20px;}
.modal-bg.open{display:flex;}
.modal-box{background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:88vh;
  overflow-y:auto;padding:28px;box-shadow:0 8px 40px rgba(0,0,0,.3);position:relative;}
.modal-title{font-family:'Playfair Display',serif;font-size:20px;color:var(--gd);
  margin-bottom:16px;padding-right:40px;}
.modal-x{position:absolute;top:14px;right:14px;background:var(--gp);border:none;
  border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;font-weight:700;color:var(--gd);font-family:inherit;}
.modal-done{background:var(--gl);color:#fff;border:none;border-radius:8px;padding:10px 24px;
  cursor:pointer;font-size:14px;font-weight:700;margin-top:18px;width:100%;font-family:inherit;}

/* PRINT */
@media print{
  .topbar,.jump-nav,.prep-banner,.page-panel,.modal-bg,
  .tbtn,.jlink,.fm-transition-btn,.prep-open-btn{display:none!important;}
  .sec{box-shadow:none;margin-bottom:14px;}
  body{background:#fff;}
}
@media(max-width:640px){
  .topbar-btns{gap:4px;}.tbtn{padding:4px 9px;font-size:11px;}
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
    <button class="tbtn tbtn-back" onclick="FF.returnToLibrary()">← Curriculum Library</button>
    <button class="tbtn tbtn-prep" onclick="FF.openPanel('panel-prep')">📋 Prep</button>
    <button class="tbtn tbtn-print" onclick="window.print()">🖨️ Print</button>
  </div>
</div>

<!-- PREP PANEL -->
<div class="page-panel" id="panel-prep">
  <div class="panel-hd">
    <div class="panel-hd-title" style="color:#2B6CB0;">📋 Daily Prep — Day ${dayNum}</div>
    <button class="panel-print" onclick="FF.printPanel('prep-body')">🖨️ Print</button>
    <button class="panel-close" onclick="FF.closePanel('panel-prep')">✕ Close</button>
  </div>
  <div class="panel-body" id="prep-body">
    <p style="color:var(--txl);font-size:13px;margin-bottom:4px;">Specific materials and setup items for <strong>today only</strong>. Gather before children arrive.</p>
    <p style="color:var(--txl);font-size:12px;margin-bottom:20px;font-style:italic;">For weekly center setup, see <strong>Weekly Prep</strong> in the Weekly Resources panel.</p>
    ${md2html(headerContent) || '<p class="empty-notice">Daily materials and prep will appear here after lesson generation.</p>'}
  </div>
</div>

<!-- FM PANEL -->
<div class="page-panel" id="panel-fm">
  <div class="panel-hd">
    <div class="panel-hd-title" style="color:#E76F51;">🍎 Fruitful Moments — Day ${dayNum}</div>
    <button class="panel-print" onclick="FF.printPanel('fm-body')">🖨️ Print</button>
    <button class="panel-close" onclick="FF.closePanel('panel-fm')">✕ Close</button>
  </div>
  <div class="panel-body" id="fm-body">
    <p style="color:var(--txl);font-size:13px;margin-bottom:16px;">Post in Discovery Circle. Use throughout the day for transitions and gathering.</p>
    <div id="fm-cards-list"></div>
  </div>
</div>

<!-- MODAL -->
<div class="modal-bg" id="modal-bg" onclick="FF.closeModal(event)">
  <div class="modal-box" onclick="event.stopPropagation()">
    <button class="modal-x" onclick="FF.closeModal()">✕</button>
    <div class="modal-title" id="modal-title"></div>
    <div id="modal-body"></div>
    <button class="modal-done" onclick="FF.closeModal()">✓ Finish — Return to Lesson</button>
  </div>
</div>

<!-- MAIN -->
<div class="wrap">
  <div class="lesson-title">Faithful Foundations — Exploring Trees</div>
  <div class="lesson-sub">Day ${dayNum} of 25${isOptional ? ' <em style="color:var(--pur);font-size:13px;">(Optional/Bonus)</em>' : ''} — ${lesson.focus || ''}</div>
  <div class="meta-row">
    <span class="badge badge-g">Week ${lesson.week_number || ''}</span>
    <span class="badge badge-g">${(lesson.age_band || '').replace('_',' ').replace(/\b\w/g,l=>l.toUpperCase())}</span>
    <span class="badge badge-f">🍇 ${lesson.fruit_of_spirit || ''}</span>
    ${vocab ? '<span class="badge badge-g">📖 ' + vocab + '</span>' : ''}
    <span class="badge ${lesson.status==='published'?'badge-pub':lesson.status==='approved'?'badge-app':'badge-dft'}">${lesson.status==='published'?'✓ Published':lesson.status==='approved'?'✓ Approved':'⚑ Draft'}</span>
    ${isOptional ? '<span class="badge badge-opt">★ Optional Day</span>' : ''}
  </div>

  <!-- JUMP NAV -->
  <nav class="jump-nav">
    <div class="jump-label">Jump to Section</div>
    <button class="jlink" onclick="FF.jump('s-discovery')">⭕ Discovery Circle</button>
    <button class="jlink" onclick="FF.jump('s-choice')">🎨 Choice Time</button>
    <button class="jlink" onclick="FF.jump('s-story')">📖 Story Gathering</button>
    <button class="jlink" onclick="FF.jump('s-skill1')">🌱 Skill Builders</button>
    <button class="jlink" onclick="FF.jump('s-outdoor')">☀️ Outdoor</button>
    <button class="jlink" onclick="FF.jump('s-reflection')">💛 Reflection</button>
    <button class="jlink" onclick="FF.jump('s-heart')">❤️ Teacher's Heart</button>
  </nav>

  <!-- PREP BANNER -->
  <div class="prep-banner">
    <div style="font-size:24px;">📋</div>
    <div class="prep-text"><strong>Materials &amp; Lesson Preparation</strong><span>Review checklist before children arrive</span></div>
    <button class="prep-open-btn" onclick="FF.openPanel('panel-prep')">Open Prep Checklist</button>
  </div>

  <!-- VOCAB CARD -->
  ${vocab ? `<div class="vocab-card">
    <div>
      <div class="vocab-lbl">Vocabulary Word</div>
      <div class="vocab-en">${vocab}</div>
      <div class="vocab-def">See definition in Header Block below</div>
    </div>
    <div>
      <div class="vocab-lbl">En Español</div>
      <div class="vocab-es">${spanishVocabWord || '—'}</div>
      ${pronHint ? `<div class="vocab-pron">Say it: <strong>${pronHint}</strong></div>` : ''}
    </div>
  </div>` : ''}

  <!-- TREE PHOTO -->
  <div style="text-align:center;background:var(--gp);border-radius:12px;padding:16px;margin-bottom:24px;" id="s-header">
    ${TREE_PHOTO}
    <p style="font-size:12px;color:var(--txl);margin-top:8px;font-style:italic;">Point to each part and name it together with children</p>
  </div>

  <!-- 2. DISCOVERY CIRCLE -->
  <div class="sec" id="s-discovery">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #74C69D;">
      <span class="sec-icon">⭕</span><span class="sec-title">Discovery Circle</span>
    </div>
    <div class="sec-body">${md2html(discoveryContent) || '<p class="empty-notice">Discovery Circle will appear here after lesson generation.</p>'}</div>
  </div>

  ${fmBtn(fruitfulMoments, 1, 'Transition to Choice Time')}

  <!-- 3. CHOICE TIME -->
  <div class="sec" id="s-choice">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #95D5B2;">
      <span class="sec-icon">🎨</span><span class="sec-title">Choice Time</span>
    </div>
    <div class="sec-body">
      <div style="background:var(--purp);border:1px solid #B794F4;border-radius:8px;padding:10px 16px;margin-bottom:14px;font-size:13px;color:var(--pur);">
        💡 <strong>Curiosity Builders</strong> for all centers are in Weekly Resources (Week ${lesson.week_number||''}) — print and post in each area.
      </div>
      <button class="doc-btn" onclick="FF.openDocModal()">📋 Documentation Examples — click to view</button>
      ${md2html(choiceContent) || '<p class="empty-notice">Choice Time will appear here after lesson generation.</p>'}
    </div>
  </div>

  ${fmBtn(fruitfulMoments, 2, 'Transition to Story Gathering')}

  <!-- 4. STORY GATHERING -->
  <div class="sec" id="s-story">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;">
      <span class="sec-icon">📖</span><span class="sec-title">Story Gathering</span>
    </div>
    <div class="sec-body">
      ${bookCoverUrl ? `<div class="book-widget"><img src="${bookCoverUrl}" class="book-cover" alt="book cover"><div><strong style="font-size:14px;display:block;">${bookTitle}</strong><em style="font-size:13px;color:var(--txl);">by ${bookAuthor}</em></div></div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <button class="story-btn" onclick="FF.openStoryModal('before')">
          <div><div class="story-btn-label">📖 Before Reading</div><div class="story-btn-hint">Click to open full script</div></div>
          <span style="color:var(--gd);font-size:20px;flex-shrink:0;">▶</span>
        </button>
        <button class="story-btn" onclick="FF.openStoryModal('during')">
          <div><div class="story-btn-label">📖 During Reading — Pause Points</div><div class="story-btn-hint">Click to open discussion prompts</div></div>
          <span style="color:var(--gd);font-size:20px;flex-shrink:0;">▶</span>
        </button>
        <button class="story-btn" onclick="FF.openStoryModal('after')">
          <div><div class="story-btn-label">📖 After Reading</div><div class="story-btn-hint">Click to open closing discussion</div></div>
          <span style="color:var(--gd);font-size:20px;flex-shrink:0;">▶</span>
        </button>
      </div>
    </div>
  </div>

  ${fmBtn(fruitfulMoments, 3, 'Transition to Skill Builders')}

  <!-- 5. SKILL BUILDERS PRIMARY -->
  <div class="sec" id="s-skill1">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #B7E4C7;">
      <span class="sec-icon">🌱</span><span class="sec-title">Skill Builders Primary</span>
    </div>
    <div class="sec-body">${md2html(skillPrimary) || '<p class="empty-notice">Skill Builders Primary will appear here after lesson generation.</p>'}</div>
  </div>

  <!-- 6. SKILL BUILDERS ADDITIONAL -->
  <div class="sec">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #B7E4C7;">
      <span class="sec-icon">✨</span><span class="sec-title">Skill Builders Additional</span>
    </div>
    <div class="sec-body">${md2html(skillAdditional) || '<p class="empty-notice">Skill Builders Additional will appear here after lesson generation.</p>'}</div>
  </div>

  ${fmBtn(fruitfulMoments, 4, 'Transition to Outdoor Time')}

  <!-- 8. OUTDOOR TIME -->
  <div class="sec" id="s-outdoor">
    <div class="sec-hd" style="background:#2D6A4F;border-left:6px solid #95D5B2;">
      <span class="sec-icon">☀️</span><span class="sec-title">Outdoor Time</span>
    </div>
    <div class="sec-body">
      <div style="background:#F0FFF4;border:1px solid #95D5B2;border-radius:8px;padding:10px 16px;margin-bottom:14px;font-size:13px;color:#1B4332;">
        🏃 <strong>Free Play & Large Motor:</strong> Children have the full outdoor space and large motor equipment available throughout Outdoor Time — running, climbing, swinging, and open play are the primary focus.
      </div>
      <div style="background:#FFFBEB;border:1px solid #D4A017;border-radius:8px;padding:10px 16px;margin-bottom:14px;font-size:13px;color:#744210;">
        🌳 <strong>Featured Exploration Activity (one option among many):</strong> The activity below is offered as one choice during Outdoor Time — not a required whole-group activity.
      </div>
      ${md2html(outdoorContent) || '<p class="empty-notice">Outdoor Time will appear here after lesson generation.</p>'}
    </div>
  </div>

  ${fmBtn(fruitfulMoments, 5, 'Transition to Reflection Time')}

  <!-- 9. REFLECTION TIME -->
  <div class="sec" id="s-reflection">
    <div class="sec-hd" style="background:#1B4332;border-left:6px solid #52B788;">
      <span class="sec-icon">💛</span><span class="sec-title">Reflection Time</span>
    </div>
    <div class="sec-body">
      ${md2html(reflectionContent) || ''}
      <div class="fc-box">
        <div class="fc-title">💌 Family Connection</div>
        <div class="fc-body" id="fc-body"></div>
        <div class="fc-question" id="fc-question"></div>
        <div style="margin-top:12px;">
          <button class="fc-copy-btn" id="fc-copy-btn" onclick="FF.copyFC()">📋 Copy for Daily Report</button>
          <span class="fc-copied" id="fc-copied">✓ Copied to clipboard!</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 10. TEACHER'S HEART -->
  <div class="sec" id="s-heart">
    <div class="sec-hd" style="background:#774936;border-left:6px solid #C4956A;">
      <span class="sec-icon">❤️</span><span class="sec-title">Teacher's Heart</span>
    </div>
    <div class="sec-body">${md2html(teachersHeart) || '<p class="empty-notice">Teacher\'s Heart will appear here after lesson generation.</p>'}</div>
  </div>

  <!-- DEBUG (shows section keys found — remove after testing) -->
  <details style="margin-top:20px;font-size:12px;color:var(--txl);">
    <summary style="cursor:pointer;padding:8px;background:#f5f5f5;border-radius:6px;">🔍 Debug: Section keys parsed (remove after testing)</summary>
    <div style="padding:8px;background:#f9f9f9;border-radius:0 0 6px 6px;font-family:monospace;font-size:11px;word-break:break-all;">${debugKeys || 'No sections found — check content format'}</div>
  </details>

</div><!-- end .wrap -->

<script>
// ═══════════════════════════════════════════════
// ALL INTERACTIVE LOGIC — namespaced under FF
// ═══════════════════════════════════════════════
var FF = (function() {

  // Data from server
  var MOMENTS = ${fmJSON};
  var DOCS    = ${docJSON};
  var STORY   = ${storyJSON};
  var FC      = ${fcJSON};

  // ── Panels ──
  function openPanel(id) {
    closeAllPanels();
    var el = document.getElementById(id);
    if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; el.scrollTop = 0; }
  }
  function closePanel(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
  }
  function closeAllPanels() {
    document.querySelectorAll('.page-panel').forEach(function(p){ p.classList.remove('open'); });
    document.body.style.overflow = '';
  }

  // ── Print panel in new window ──
  function printPanel(bodyId) {
    var el = document.getElementById(bodyId);
    if (!el) return;
    var win = window.open('', '_blank', 'width=860,height=700');
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Print</title>');
    win.document.write('<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">');
    win.document.write('<style>body{font-family:"Source Sans 3",sans-serif;padding:32px;font-size:14px;line-height:1.7;}');
    win.document.write('.fm-card{background:#FFF8F0;border:2px solid #F4A261;border-radius:10px;padding:20px;margin-bottom:24px;page-break-inside:avoid;}');
    win.document.write('.fm-card-hd{font-family:"Playfair Display",serif;color:#E76F51;font-size:17px;font-weight:700;margin-bottom:8px;}');
    win.document.write('ul{padding-left:20px;}li{margin-bottom:4px;}p{margin:4px 0;}strong{font-weight:700;}');
    win.document.write('</style></head><body>');
    win.document.write(el.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    setTimeout(function(){ win.focus(); win.print(); }, 700);
  }

  // ── Return to Curriculum Library ──
  // Lessons open in the same tab, so history.back() always works.
  function returnToLibrary() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  }

  // ── Jump to section ──
  function jump(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var tb = document.querySelector('.topbar');
    var offset = tb ? tb.offsetHeight + 14 : 66;
    var y = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // ── Modal ──
  function openModal(title, bodyHTML) {
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(e) {
    if (!e || e.target === document.getElementById('modal-bg')) {
      document.getElementById('modal-bg').classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // ── FM Modal ──
  function openFMModal(idx) {
    var fm = MOMENTS[idx];
    if (!fm) { openGenericTransition('Fruitful Moment Transition'); return; }
    openModal('🍎 ' + (fm.title || 'Fruitful Moment'), renderMD(fm.content));
  }
  function openGenericTransition(label) {
    var singles = {
      'Transition to Choice Time':
        '<strong>Planning Time:</strong> Before anyone moves, the teacher asks each child individually: <em>"What learning area are you going to work in? What will you do there?"</em> After a child shares their plan, they move one by one to their chosen area. This intentional planning supports self-direction and purposeful play.',
      'Transition to Story Gathering':
        '<strong>Leaf Shape:</strong> Children make a leaf shape with their hands, hold it up, then "float" like a falling leaf to the Story Gathering spot.',
      'Transition to Skill Builders':
        '<strong>Tree Freeze:</strong> Move and dance until the teacher calls out a tree part — everyone freezes in that shape, then walks to their small group.',
      'Transition to Outdoor Time':
        '<strong>Counting Breath:</strong> Breathe in 4 counts (roots pulling water up), out 4 counts (leaves releasing air). Three times, then line up.',
      'Transition to Reflection Time':
        '<strong>Wonder Sentence:</strong> Before sitting, each child completes "I wonder..." — hold that thought for Reflection Time.',
      'Transition to Bible Storytime':
        '<strong>Peace Walk:</strong> Children walk quietly with hands folded, breathing slowly, to the gathering area for Bible Storytime.',
      'Transition to Goodbye Circle':
        '<strong>Gratitude Round:</strong> As children finish clean-up, each shares one thing they are thankful for from today before joining the Goodbye Circle.',
    };
    var activity = singles[label] || '<strong>Whisper Walk:</strong> Hands on the shoulders of the person in front, whisper-walk quietly to the next activity.';
    openModal('\uD83C\uDF4E ' + (label || 'Fruitful Moment Transition'),
      '<div style="background:#FFF8F0;border-left:4px solid #F4A261;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.7;color:#3D2B1F;">' +
      activity + '</div>');
  }

  // ── Doc Modal ──
  function openDocModal() {
    if (!DOCS.length) {
      openModal('📋 Documentation Examples',
        '<p style="color:#666;">Documentation examples will appear here from generated lesson content (Circle of Friends Scenarios).</p>'); return;
    }
    openModal('📋 Documentation Examples',
      DOCS.map(function(d){
        return '<div style="background:#E9D8FD;border-radius:8px;padding:14px;margin-bottom:12px;border-left:4px solid #553C9A;">' +
          '<strong style="color:#553C9A;display:block;margin-bottom:8px;">' + d.title + '</strong>' +
          renderMD(d.content) + '</div>';
      }).join(''));
  }

  // ── Story Modal ──
  function openStoryModal(part) {
    var labels = { before:'📖 Before Reading', during:'📖 During Reading — Pause Points', after:'📖 After Reading' };
    var txt = STORY[part];
    var body;
    if (txt && txt.trim().length > 30) {
      body = renderMD(txt);
    } else if (STORY.full && STORY.full.trim().length > 30) {
      body = '<div style="background:#FFF3E0;border-left:4px solid #F4A261;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#774936;">' +
        '📌 Showing full Story Gathering content — look for the <strong>' + (labels[part]||part) + '</strong> section within.</div>' +
        renderMD(STORY.full);
    } else {
      body = '<p style="color:#666;font-style:italic;">Story Gathering content will appear here after lesson generation. It includes Before Reading, During Reading, and After Reading scripts.</p>';
    }
    openModal(labels[part] || 'Story Gathering', body);
  }

  // ── Family Connection ──
  function renderFC() {
    var bodyEl = document.getElementById('fc-body');
    var qEl    = document.getElementById('fc-question');
    if (!bodyEl) return;
    var text = FC || '';
    var qMatch = text.match(/Ask your child[^:]*:?\\s*["""]?([^"""\\n]{10,})/i) ||
                 text.match(/💬[^:]*:\\s*["""]([^"""]+)/i);
    var question = qMatch ? qMatch[1].replace(/["""]/g,'').trim() : 'What did you discover about trees today?';
    var lines = text.split('\\n');
    var html = lines.map(function(l){
      l = l.trim();
      if (!l || l.match(/^Ask your child/i) || l.match(/^💬/)) return '';
      if (l.startsWith('- ') || l.startsWith('* ')) return '<li style="margin-left:20px;">' + l.slice(2).replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>') + '</li>';
      return '<p>' + l.replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>') + '</p>';
    }).filter(Boolean).join('');
    bodyEl.innerHTML = html;
    if (qEl) qEl.innerHTML = '💬 <strong>Ask your child:</strong> "' + question + '"';
  }

  function copyFC() {
    var bodyEl = document.getElementById('fc-body');
    var qEl    = document.getElementById('fc-question');
    var btn    = document.getElementById('fc-copy-btn');
    var msg    = document.getElementById('fc-copied');
    var text   = (bodyEl ? bodyEl.innerText : '') + '\\n\\n' + (qEl ? qEl.innerText : '');
    var confirm = function() {
      if (btn) btn.style.display = 'none';
      if (msg) msg.style.display = 'inline';
      setTimeout(function(){ if (btn) btn.style.display=''; if (msg) msg.style.display='none'; }, 3000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(confirm).catch(function(){ fallbackCopy(text, confirm); });
    } else { fallbackCopy(text, confirm); }
  }
  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch(e) {}
    document.body.removeChild(ta);
  }

  // ── FM Panel cards ──
  function renderFMPanel() {
    var el = document.getElementById('fm-cards-list');
    if (!el) return;
    if (!MOMENTS.length) {
      el.innerHTML = '<p style="color:#666;">Fruitful Moments will appear here from generated lesson content.</p>'; return;
    }
    el.innerHTML = MOMENTS.map(function(fm, i){
      return '<div class="fm-card"><div class="fm-card-hd">🍎 ' + (fm.title||'Fruitful Moment '+(i+1)) + '</div>' + renderMD(fm.content) + '</div>';
    }).join('');
  }

  // ── Lightweight MD renderer (client-side) ──
  function renderMD(text) {
    if (!text) return '';
    return text
      .replace(/\\*\\*TEACHER:\\*\\*\\s*/g, '<span style="background:#1B4332;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;">TEACHER</span> ')
      .replace(/\\*\\*CHILDREN:\\*\\*\\s*/g, '<span style="background:#D4A017;color:#1A1A2E;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;">CHILDREN</span> ')
      .replace(/\\*\\*([A-Z]{2,}):\\*\\*\\s*/g, '<span style="background:#553C9A;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;">$1</span> ')
      .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.*?)\\*/g, '<em style="color:#555;font-style:italic;">$1</em>')
      .replace(/^#{1,4} (.+)$/gm, '<h4 style="color:#1B4332;font-family:serif;margin:12px 0 6px;">$1</h4>')
      .replace(/^- (.+)$/gm, '<li style="margin-bottom:4px;">$1</li>')
      .replace(/^\\d+\\. (.+)$/gm, '<li style="margin-bottom:6px;">$1</li>')
      .split('\\n\\n').map(function(p){
        p = p.trim(); if (!p) return '';
        if (p.startsWith('<')) return p;
        return '<p style="margin:5px 0;">' + p + '</p>';
      }).join('');
  }

  // ── INIT ──
  document.addEventListener('DOMContentLoaded', function() {
    renderFMPanel();
    renderFC();
  });

  // Public API
  return {
    openPanel: openPanel, closePanel: closePanel,
    printPanel: printPanel, jump: jump,
    openModal: openModal, closeModal: closeModal,
    openFMModal: openFMModal, openGenericTransition: openGenericTransition,
    openDocModal: openDocModal, openStoryModal: openStoryModal,
    copyFC: copyFC
  };
})();
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
