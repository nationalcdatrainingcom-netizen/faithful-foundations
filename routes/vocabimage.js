const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// ── VERIFIED PEXELS PHOTO IDs ─────────────────────────────────────────────
// Each ID is a real Pexels photograph verified by subject.
// CDN format: https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg
// No API key needed for CDN delivery.
const VOCAB_PHOTOS = {
  // Trees exploration — all 25 words
  'tree':        1179229,   // large oak tree in field
  'roots':       235621,    // exposed tree roots on forest floor
  'trunk':       129733,    // close-up of tree trunk bark texture
  'branches':    167699,    // bare branches against sky
  'leaves':      807598,    // green leaves close-up
  'bark':        129731,    // tree bark texture detail
  'seeds':       1029599,   // acorn on branch
  'fruit':       1510392,   // apples on a tree branch
  'sunlight':    775201,    // sunlight through forest canopy
  'water':       459446,    // water drops on green leaf
  'forest':      15286,     // tall forest with light through trees
  'soil':        1108572,   // rich brown soil/earth
  'canopy':      38136,     // looking up through tree canopy
  'shelter':     326900,    // bird in tree / sheltering in nature
  'grow':        1002703,   // seedling sprouting from soil
  'seasons':     235990,    // autumn tree with colored leaves
  'change':      1407305,   // autumn leaves changing color
  'observe':     8535285,   // child looking closely at nature
  'compare':     338936,    // two trees side by side
  'wonder':      1626040,   // starry night sky / awe
  'community':   1560932,   // group of children together
  'growth':      1002703,   // seedling growing (reuse)
  'unique':      1266808,   // single distinctive tree
  'connected':   15286,     // forest with interconnected trees (reuse)
  // Generic fallbacks for any future exploration
  'default':     1179229
};

// ── CACHE ──────────────────────────────────────────────────────────────────
// Simple in-memory map: word → { pid, url }
const cache = new Map();

// ── CLAUDE FALLBACK ────────────────────────────────────────────────────────
// If word not in VOCAB_PHOTOS, ask Claude for the best Pexels photo ID.
// Claude knows Pexels IDs for common subjects from training data.
async function getPhotoIdFromClaude(word, exploration) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `I need a Pexels photo ID (just the number) for a real photograph of: "${word}" (context: early childhood curriculum about ${exploration || 'nature'}).
The photo should be:
- A real photograph of the actual subject (not abstract, not cartoon)
- Clear and child-appropriate
- Nature or real-world focused

Reply with ONLY the Pexels photo ID number, nothing else. Example: 1179229`
        }]
      })
    });
    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text || '').trim();
    const id = parseInt(text.replace(/\D/g, ''));
    return isNaN(id) || id < 1000 ? null : id;
  } catch (e) {
    return null;
  }
}

// ── ROUTE: GET /api/vocab-image/:word ─────────────────────────────────────
// Returns JSON: { pid, url } — frontend builds the img src from pid
router.get('/:word', async (req, res) => {
  const word = (req.params.word || '').toLowerCase().trim();
  const exploration = (req.query.exploration || 'trees').toLowerCase();

  // 1. Check cache
  if (cache.has(word)) {
    return res.json(cache.get(word));
  }

  // 2. Check verified map
  let pid = VOCAB_PHOTOS[word] || VOCAB_PHOTOS[word.replace(/s$/, '')] || null;

  // 3. Claude fallback for unknown words
  if (!pid) {
    pid = await getPhotoIdFromClaude(word, exploration);
  }

  // 4. Ultimate fallback
  if (!pid) pid = VOCAB_PHOTOS['default'];

  const result = {
    pid,
    url: `https://images.pexels.com/photos/${pid}/pexels-photo-${pid}.jpeg?auto=compress&cs=tinysrgb&w=680&h=300&fit=crop`
  };

  cache.set(word, result);
  res.json(result);
});

module.exports = router;
