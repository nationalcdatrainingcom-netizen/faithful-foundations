/**
 * /api/vocab-image/:word
 *
 * Serves a vocabulary word image by proxying from Wikipedia's free image CDN.
 * Wikipedia is highly reliable, free, no API key, real photographs.
 *
 * Flow:
 *   1. Look up a verified Wikipedia article title for each word
 *   2. Call Wikipedia API to get the article's lead image thumbnail URL
 *   3. Proxy the image bytes back to the browser as image/jpeg
 *   4. Cache in memory — each word fetched only once per server start
 *   5. If Wikipedia fails, fall back to a clean SVG illustration
 */

const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

// ── IN-MEMORY CACHE  cacheKey → Buffer ────────────────────────────────────
const imageCache = new Map();

// ── VERIFIED WIKIPEDIA ARTICLE TITLES for all 25 Trees words ──────────────
// Each maps to a Wikipedia article that has a relevant lead photograph.
const WIKI_ARTICLES = {
  tree:      'Oak',
  roots:     'Root',
  trunk:     'Trunk_(botany)',
  branches:  'Branch',
  leaves:    'Leaf',
  bark:      'Bark_(botany)',
  seeds:     'Acorn',
  fruit:     'Apple',
  sunlight:  'Sunlight',
  water:     'Water',
  forest:    'Forest',
  soil:      'Soil',
  canopy:    'Canopy_(biology)',
  shelter:   'Bird_nest',
  grow:      'Germination',
  seasons:   'Autumn_leaf_color',
  change:    'Autumn_leaf_color',
  observe:   'Nature_study',
  compare:   'Deciduous',
  wonder:    'Starry_Night_(van_Gogh)',
  community: 'Community',
  growth:    'Plant_development',
  unique:    'Tree',
  connected: 'Mycorrhiza',
};

// ── FETCH IMAGE URL FROM WIKIPEDIA API ────────────────────────────────────
async function getWikipediaImageUrl(articleTitle, thumbWidth) {
  const apiUrl =
    'https://en.wikipedia.org/w/api.php' +
    '?action=query' +
    '&titles=' + encodeURIComponent(articleTitle) +
    '&prop=pageimages' +
    '&pithumbsize=' + thumbWidth +
    '&pilicense=any' +
    '&format=json' +
    '&origin=*';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = (data.query || {}).pages || {};
    const page  = Object.values(pages)[0] || {};
    const thumb = (page.thumbnail || {}).source || null;
    return thumb;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ── PROXY AN IMAGE URL ─────────────────────────────────────────────────────
async function proxyImageUrl(imageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FaithfulFoundations/1.0 (educational; contact@thechildrenscenter.com)' }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const buf = await res.buffer();
    if (!buf || buf.length < 500) return null;
    return { buffer: buf, contentType: ct.split(';')[0].trim() };
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ── FALLBACK: GENERATE A CLEAN SVG ILLUSTRATION ───────────────────────────
// Used when Wikipedia image fetch fails. Returns a clean, accurate SVG.
function makeFallbackSVG(word) {
  const illustrations = {
    tree:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="240" width="680" height="60" fill="#4a7c3f"/><rect x="320" y="140" width="40" height="100" fill="#6B4226"/><ellipse cx="340" cy="110" rx="90" ry="75" fill="#2D6A4F"/><ellipse cx="280" cy="130" rx="60" ry="50" fill="#1B4332"/><ellipse cx="400" cy="125" rx="60" ry="50" fill="#1B4332"/><ellipse cx="340" cy="85" rx="65" ry="55" fill="#40916C"/></svg>`,
    roots:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#8B6914"/><rect width="680" height="20" fill="#4a7c3f"/><rect x="320" y="0" width="40" height="60" fill="#6B4226"/><path d="M340,60 Q280,100 220,160" stroke="#5A3519" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M340,60 Q380,120 430,180" stroke="#5A3519" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M340,60 Q310,130 290,210" stroke="#6B4226" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M340,60 Q370,140 390,220" stroke="#6B4226" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M220,160 Q170,190 130,230" stroke="#7D4F2A" stroke-width="7" fill="none"/><path d="M430,180 Q480,210 520,240" stroke="#7D4F2A" stroke-width="7" fill="none"/><text x="340" y="280" fill="#D4A800" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle">underground roots</text></svg>`,
    trunk:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#2D4A1E"/><rect x="250" y="0" width="180" height="300" fill="#6B4226"/><rect x="260" y="0" width="20" height="300" fill="#7D4F2A" opacity="0.5"/><rect x="290" y="0" width="8" height="300" fill="#5A3519" opacity="0.4"/><path d="M250,50 Q230,80 240,120" stroke="#4A2E14" stroke-width="3" fill="none"/><path d="M430,80 Q450,110 440,150" stroke="#4A2E14" stroke-width="3" fill="none"/><path d="M250,150 Q235,170 245,200" stroke="#4A2E14" stroke-width="2" fill="none"/></svg>`,
    leaves:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><ellipse cx="200" cy="120" rx="70" ry="50" fill="#2D6A4F"/><ellipse cx="340" cy="80" rx="85" ry="60" fill="#40916C"/><ellipse cx="480" cy="110" rx="70" ry="50" fill="#1B4332"/><ellipse cx="280" cy="150" rx="60" ry="45" fill="#52B788"/><ellipse cx="420" cy="160" rx="65" ry="45" fill="#2D6A4F"/><line x1="340" y1="80" x2="340" y2="120" stroke="#1B4332" stroke-width="2"/><line x1="200" y1="120" x2="200" y2="155" stroke="#1B4332" stroke-width="2"/></svg>`,
    bark:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#8B6914"/><rect x="0" y="0" width="680" height="300" fill="#6B4226"/><line x1="80" y1="0" x2="60" y2="300" stroke="#5A3519" stroke-width="4" opacity="0.7"/><line x1="180" y1="0" x2="200" y2="300" stroke="#4A2E14" stroke-width="3" opacity="0.6"/><line x1="280" y1="0" x2="260" y2="300" stroke="#5A3519" stroke-width="5" opacity="0.7"/><line x1="400" y1="0" x2="420" y2="300" stroke="#4A2E14" stroke-width="3" opacity="0.6"/><line x1="520" y1="0" x2="500" y2="300" stroke="#5A3519" stroke-width="4" opacity="0.7"/><line x1="620" y1="0" x2="640" y2="300" stroke="#4A2E14" stroke-width="3" opacity="0.5"/><rect x="100" y="60" width="80" height="12" rx="4" fill="#4A2E14" opacity="0.5"/><rect x="300" y="140" width="120" height="10" rx="4" fill="#4A2E14" opacity="0.5"/><rect x="450" y="80" width="90" height="8" rx="4" fill="#4A2E14" opacity="0.4"/></svg>`,
    seeds:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><ellipse cx="280" cy="160" rx="60" ry="70" fill="#8B6914"/><ellipse cx="280" cy="120" rx="40" ry="30" fill="#6B4226"/><line x1="280" y1="90" x2="280" y2="50" stroke="#4a7c3f" stroke-width="4"/><ellipse cx="280" cy="35" rx="30" ry="20" fill="#2D6A4F" transform="rotate(-20 280 35)"/><ellipse cx="320" cy="45" rx="25" ry="18" fill="#40916C" transform="rotate(10 320 45)"/></svg>`,
    fruit:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><ellipse cx="280" cy="180" rx="60" ry="65" fill="#C0392B"/><ellipse cx="280" cy="175" rx="55" ry="60" fill="#E74C3C"/><line x1="280" y1="115" x2="280" y2="90" stroke="#6B4226" stroke-width="5"/><ellipse cx="310" cy="82" rx="30" ry="15" fill="#2D6A4F" transform="rotate(-30 310 82)"/><ellipse cx="420" cy="160" rx="55" ry="60" fill="#C0392B"/><ellipse cx="420" cy="155" rx="50" ry="55" fill="#E74C3C"/><line x1="420" y1="100" x2="420" y2="75" stroke="#6B4226" stroke-width="4"/><ellipse cx="448" cy="68" rx="25" ry="12" fill="#2D6A4F" transform="rotate(-25 448 68)"/></svg>`,
    forest:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#1a3a1a"/><rect y="240" width="680" height="60" fill="#2a5a2a"/><rect x="100" y="80" width="30" height="160" fill="#4A2E14"/><ellipse cx="115" cy="60" rx="55" ry="70" fill="#1B4332"/><rect x="260" y="60" width="30" height="180" fill="#5A3519"/><ellipse cx="275" cy="40" rx="65" ry="55" fill="#2D6A4F"/><rect x="420" y="70" width="28" height="170" fill="#4A2E14"/><ellipse cx="434" cy="50" rx="58" ry="65" fill="#1B4332"/><rect x="560" y="90" width="25" height="150" fill="#5A3519"/><ellipse cx="572" cy="72" rx="50" ry="58" fill="#40916C"/><rect x="180" y="130" width="20" height="110" fill="#4A2E14"/><ellipse cx="190" cy="115" rx="40" ry="45" fill="#2D6A4F"/><path d="M0,200 Q170,120 340,160 Q510,200 680,140" fill="rgba(255,255,255,0.06)"/></svg>`,
    soil:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#5C3A1E"/><rect width="680" height="80" fill="#4a7c3f"/><rect y="80" width="680" height="220" fill="#6B4226"/><ellipse cx="150" cy="150" rx="18" ry="10" fill="#5A3519"/><ellipse cx="350" cy="200" rx="22" ry="12" fill="#4A2E14"/><ellipse cx="500" cy="170" rx="15" ry="8" fill="#5A3519"/><ellipse cx="80" cy="220" rx="12" ry="7" fill="#4A2E14"/><ellipse cx="580" cy="240" rx="16" ry="9" fill="#5A3519"/><path d="M340,80 Q320,120 310,180" stroke="#4a7c3f" stroke-width="3" fill="none" opacity="0.6"/><path d="M340,80 Q360,130 370,200" stroke="#3a5a2a" stroke-width="2" fill="none" opacity="0.5"/></svg>`,
    canopy:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><circle cx="340" cy="0" r="120" fill="#52B788" opacity="0.9"/><ellipse cx="200" cy="20" rx="130" ry="90" fill="#2D6A4F"/><ellipse cx="480" cy="15" rx="130" ry="85" fill="#1B4332"/><ellipse cx="100" cy="60" rx="100" ry="70" fill="#40916C"/><ellipse cx="580" cy="55" rx="100" ry="70" fill="#2D6A4F"/><ellipse cx="340" cy="40" rx="80" ry="60" fill="#52B788"/><circle cx="340" cy="150" r="30" fill="#87CEEB" opacity="0.8"/></svg>`,
    shelter:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect x="220" y="0" width="240" height="300" fill="#6B4226"/><ellipse cx="340" cy="140" rx="50" ry="40" fill="#3D1F0A"/><ellipse cx="340" cy="142" rx="44" ry="35" fill="#2A1505"/><circle cx="320" cy="128" r="6" fill="#FFD700"/><path d="M295,118 C305,105 330,100 348,112" stroke="#8B6914" stroke-width="3" fill="none"/><path d="M305,122 C318,108 338,104 355,116" stroke="#8B6914" stroke-width="2" fill="none" opacity="0.6"/></svg>`,
    grow:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="220" width="680" height="80" fill="#6B4226"/><line x1="340" y1="220" x2="340" y2="120" stroke="#40916C" stroke-width="6" stroke-linecap="round"/><ellipse cx="310" cy="140" rx="35" ry="20" fill="#52B788" transform="rotate(-30 310 140)"/><ellipse cx="372" cy="135" rx="35" ry="20" fill="#40916C" transform="rotate(30 372 135)"/><ellipse cx="340" cy="108" rx="25" ry="15" fill="#52B788" transform="rotate(-10 340 108)"/></svg>`,
    seasons:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="240" width="680" height="60" fill="#4a7c3f"/><rect x="310" y="140" width="60" height="100" fill="#6B4226"/><ellipse cx="340" cy="100" rx="110" ry="90" fill="#E74C3C" opacity="0.9"/><ellipse cx="270" cy="120" rx="75" ry="60" fill="#E67E22"/><ellipse cx="410" cy="115" rx="75" ry="60" fill="#F39C12"/><ellipse cx="340" cy="75" rx="80" ry="65" fill="#C0392B"/><ellipse cx="340" cy="62" rx="55" ry="45" fill="#E74C3C" opacity="0.7"/></svg>`,
    change:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><line x1="160" y1="80" x2="160" y2="300" stroke="#6B4226" stroke-width="8"/><ellipse cx="120" cy="60" rx="45" ry="35" fill="#2D6A4F"/><ellipse cx="160" cy="45" rx="50" ry="38" fill="#40916C"/><ellipse cx="200" cy="58" rx="45" ry="35" fill="#E74C3C"/><line x1="500" y1="60" x2="500" y2="300" stroke="#6B4226" stroke-width="8"/><ellipse cx="460" cy="40" rx="50" ry="38" fill="#E74C3C"/><ellipse cx="500" cy="28" rx="55" ry="40" fill="#E67E22"/><ellipse cx="542" cy="40" rx="48" ry="36" fill="#F39C12"/><ellipse cx="500" cy="18" rx="40" ry="30" fill="#C0392B"/></svg>`,
    observe:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="240" width="680" height="60" fill="#4a7c3f"/><circle cx="280" cy="200" r="28" fill="#FFD700"/><line x1="280" y1="172" x2="200" y2="100" stroke="#8B6914" stroke-width="8" stroke-linecap="round"/><circle cx="195" cy="95" r="40" fill="none" stroke="#8B6914" stroke-width="8"/><circle cx="195" cy="95" r="32" fill="rgba(135,206,235,0.6)"/><ellipse cx="180" cy="195" rx="15" ry="50" fill="#FFD700" opacity="0.8"/><ellipse cx="210" cy="240" rx="20" ry="8" fill="#FFD700" opacity="0.6"/><ellipse cx="195" cy="95" rx="12" ry="15" fill="#2D6A4F" opacity="0.7"/></svg>`,
    compare:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="240" width="680" height="60" fill="#4a7c3f"/><rect x="140" y="120" width="60" height="120" fill="#8B6914"/><ellipse cx="170" cy="80" rx="80" ry="90" fill="#E74C3C"/><ellipse cx="160" cy="60" rx="60" ry="70" fill="#C0392B"/><rect x="460" y="100" width="80" height="140" fill="#5A3519"/><ellipse cx="500" cy="60" rx="100" ry="80" fill="#1B4332"/><ellipse cx="490" cy="42" rx="80" ry="65" fill="#2D6A4F"/><line x1="340" y1="50" x2="340" y2="250" stroke="#666" stroke-width="3" stroke-dasharray="10,8"/></svg>`,
    wonder:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#0a0a2e"/><circle cx="100" cy="50" r="3" fill="white" opacity="0.9"/><circle cx="200" cy="30" r="2" fill="white" opacity="0.7"/><circle cx="350" cy="20" r="4" fill="white"/><circle cx="450" cy="45" r="2" fill="white" opacity="0.8"/><circle cx="580" cy="25" r="3" fill="white" opacity="0.9"/><circle cx="650" cy="60" r="2" fill="white" opacity="0.6"/><circle cx="50" cy="90" r="2" fill="white" opacity="0.7"/><circle cx="280" cy="60" r="2" fill="white" opacity="0.8"/><circle cx="520" cy="70" r="3" fill="white" opacity="0.7"/><path d="M0,240 Q170,180 340,220 Q510,260 680,200 L680,300 L0,300 Z" fill="#1a3a1a"/><ellipse cx="340" cy="235" rx="40" ry="60" fill="#3a3a2a" opacity="0.8"/><text x="340" y="145" fill="rgba(255,255,200,0.6)" font-family="Georgia" font-size="28" text-anchor="middle" font-style="italic">✨ wonder ✨</text></svg>`,
    community:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="240" width="680" height="60" fill="#4a7c3f"/><circle cx="180" cy="200" r="28" fill="#FFD700"/><circle cx="180" cy="165" r="22" fill="#FF8C00"/><circle cx="280" cy="195" r="28" fill="#87CEEF"/><circle cx="280" cy="160" r="22" fill="#4A90E2"/><circle cx="380" cy="200" r="28" fill="#FFB6C1"/><circle cx="380" cy="165" r="22" fill="#FF69B4"/><circle cx="480" cy="195" r="28" fill="#90EE90"/><circle cx="480" cy="160" r="22" fill="#2E8B57"/><rect x="180" y="0" width="30" height="160" fill="#6B4226"/><ellipse cx="195" cy="30" rx="70" ry="80" fill="#2D6A4F"/></svg>`,
    growth:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="220" width="680" height="80" fill="#6B4226"/><line x1="200" y1="220" x2="200" y2="170" stroke="#40916C" stroke-width="4"/><ellipse cx="185" cy="158" rx="20" ry="13" fill="#52B788" transform="rotate(-25 185 158)"/><ellipse cx="218" cy="155" rx="20" ry="13" fill="#40916C" transform="rotate(25 218 155)"/><line x1="380" y1="220" x2="380" y2="120" stroke="#40916C" stroke-width="6"/><ellipse cx="358" cy="133" rx="30" ry="18" fill="#52B788" transform="rotate(-30 358 133)"/><ellipse cx="404" cy="128" rx="30" ry="18" fill="#2D6A4F" transform="rotate(30 404 128)"/><ellipse cx="380" cy="108" rx="22" ry="14" fill="#52B788"/><line x1="540" y1="220" x2="540" y2="60" stroke="#2D6A4F" stroke-width="8"/><ellipse cx="510" cy="90" rx="45" ry="28" fill="#1B4332" transform="rotate(-25 510 90)"/><ellipse cx="572" cy="82" rx="45" ry="28" fill="#2D6A4F" transform="rotate(25 572 82)"/><ellipse cx="540" cy="55" rx="35" ry="22" fill="#40916C"/></svg>`,
    unique:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#87CEEB"/><rect y="240" width="680" height="60" fill="#4a7c3f"/><rect x="315" y="110" width="50" height="130" fill="#6B4226"/><path d="M340,110 Q260,80 220,30" stroke="#5A3519" stroke-width="18" fill="none" stroke-linecap="round"/><path d="M340,110 Q420,60 480,20" stroke="#5A3519" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M340,130 Q290,100 260,70" stroke="#5A3519" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M340,130 Q400,95 440,60" stroke="#5A3519" stroke-width="12" fill="none" stroke-linecap="round"/><ellipse cx="220" cy="25" rx="55" ry="40" fill="#2D6A4F"/><ellipse cx="480" cy="15" rx="60" ry="38" fill="#1B4332"/><ellipse cx="260" cy="65" rx="40" ry="30" fill="#40916C"/><ellipse cx="440" cy="55" rx="40" ry="30" fill="#2D6A4F"/></svg>`,
    connected:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#6B4226"/><rect width="680" height="60" fill="#2a5a2a"/><rect x="100" y="0" width="25" height="80" fill="#4A2E14"/><rect x="320" y="0" width="25" height="70" fill="#5A3519"/><rect x="540" y="0" width="25" height="75" fill="#4A2E14"/><path d="M112,80 Q200,120 220,180" stroke="#5A3519" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M332,70 Q340,130 340,200" stroke="#6B4226" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M552,75 Q480,120 460,185" stroke="#5A3519" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M220,180 Q280,200 340,200" stroke="#7D4F2A" stroke-width="7" fill="none"/><path d="M460,185 Q400,200 340,200" stroke="#7D4F2A" stroke-width="7" fill="none"/><path d="M112,80 Q160,90 200,110" stroke="#7D4F2A" stroke-width="5" fill="none"/><path d="M552,75 Q510,90 470,110" stroke="#7D4F2A" stroke-width="5" fill="none"/><text x="340" y="260" fill="#D4A800" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">roots connecting underground</text></svg>`,
  };

  const svgStr = illustrations[word] ||
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 300"><rect width="680" height="300" fill="#F0FFF4"/><text x="340" y="160" fill="#1B4332" font-family="Arial" font-size="48" font-weight="bold" text-anchor="middle">${word}</text></svg>`;

  return Buffer.from(svgStr);
}

// ── ROUTE: GET /api/vocab-image/:word ─────────────────────────────────────
router.get('/:word', async (req, res) => {
  const word = (req.params.word || '').toLowerCase().trim();
  const w    = parseInt(req.query.w) || 680;
  const h    = parseInt(req.query.h) || 300;
  const key  = word + '_' + w + 'x' + h;

  // 1. Serve cached image
  if (imageCache.has(key)) {
    const c = imageCache.get(key);
    res.set('Content-Type', c.ct);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(c.buf);
  }

  // 2. Try Wikipedia
  const article = WIKI_ARTICLES[word];
  if (article) {
    const thumbUrl = await getWikipediaImageUrl(article, w);
    if (thumbUrl) {
      const img = await proxyImageUrl(thumbUrl);
      if (img) {
        imageCache.set(key, { buf: img.buffer, ct: img.contentType });
        res.set('Content-Type', img.contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(img.buffer);
      }
    }
  }

  // 3. Fall back to SVG illustration
  console.log('Using SVG fallback for vocab word:', word);
  const svg = makeFallbackSVG(word);
  imageCache.set(key, { buf: svg, ct: 'image/svg+xml' });
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

module.exports = router;
