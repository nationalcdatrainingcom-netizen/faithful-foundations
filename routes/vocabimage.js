/**
 * /api/vocab-image/:word
 *
 * Returns an AI-generated photorealistic image, proxied through the server.
 * The browser fetches /api/vocab-image/tree and gets back a real JPEG —
 * no cross-origin issues, no browser blocking.
 *
 * Flow:
 *   1. Look up hand-crafted prompt for the word (or ask Claude for unknown words)
 *   2. Fetch the image from Pollinations.ai on the server side
 *   3. Stream the JPEG bytes back to the browser as image/jpeg
 *   4. Cache the rendered image buffer in memory so each word is only generated once
 */

const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

// ── IN-MEMORY IMAGE CACHE  word → Buffer ──────────────────────────────────
const imageCache = new Map();

// ── HAND-CRAFTED PROMPTS — all 25 Trees exploration words ─────────────────
const KNOWN_PROMPTS = {
  tree:      'A majestic full oak tree standing alone in an open green field, bright natural daylight, lush green canopy, thick brown trunk visible, photorealistic nature photograph',
  roots:     'Large exposed gnarled tree roots spreading across the surface of a forest floor, earthy brown tones, natural soft light filtering through trees, close-up photorealistic nature photo',
  trunk:     'Close-up of a wide rough-textured brown tree trunk with distinct bark patterns and furrows, natural woodland light, photorealistic macro nature photograph',
  branches:  'Bare tree branches spreading wide against a clear bright blue sky, intricate branching pattern visible, clean natural light, photorealistic nature photo',
  leaves:    'Cluster of bright green leaves on a branch in natural sunlight, vivid color, detailed leaf veins visible, photorealistic close-up nature photograph',
  bark:      'Extreme close-up of deeply textured tree bark, brown and grey tones, rough ridged surface, photorealistic macro nature photograph',
  seeds:     'Single acorn on an oak branch with its cap attached, surrounded by green leaves, natural forest light, photorealistic close-up botanical photograph',
  fruit:     'Ripe red apples hanging from a fruit tree branch with green leaves, bright natural daylight, photorealistic orchard photograph',
  sunlight:  'Golden sunlight streaming through tall trees in a forest creating dramatic light rays, warm golden hour tones, photorealistic nature photograph',
  water:     'Crystal clear water droplets resting on a fresh green leaf, macro close-up, natural light with soft bokeh background, photorealistic nature photograph',
  forest:    'Tall straight tree trunks in a dense green forest with sunlight filtering through the canopy to the forest floor, photorealistic landscape photograph',
  soil:      'Rich dark brown moist garden soil with visible texture and small pebbles, natural daylight, photorealistic close-up photograph of earth',
  canopy:    'Looking straight up through a dense green forest canopy, layered leaves and branches framing blue sky, photorealistic nature photograph',
  shelter:   'Small bird perched at the entrance of a natural hollow in a tree trunk, cozy sheltered nesting spot in woodland, photorealistic wildlife nature photograph',
  grow:      'Tiny bright green seedling sprouting from dark rich soil, two small rounded leaves unfurling, natural daylight, photorealistic close-up nature photograph',
  seasons:   'Single deciduous tree showing vivid autumn colors in red orange and yellow, standing alone in a field, blue sky background, photorealistic landscape photograph',
  change:    'Tree branch with leaves transitioning from green to orange and red autumn colors, mixed tones of seasonal change, natural light, photorealistic nature photograph',
  observe:   'Young child kneeling outdoors closely examining a leaf with a magnifying glass, natural outdoor light, photorealistic candid childhood photograph',
  compare:   'Two different tree trunks side by side showing contrasting bark textures, one smooth one deeply ridged, natural forest light, photorealistic nature photograph',
  wonder:    'Child standing in a forest looking upward with arms wide open, face full of amazement, golden morning light through trees, photorealistic candid nature photograph',
  community: 'Diverse group of young children sitting together in a circle outdoors under a large tree smiling, warm natural sunlight, photorealistic candid photograph',
  growth:    'Young green sapling growing from rich dark soil with bright natural light, photorealistic botanical close-up photograph',
  unique:    'One distinctive lone tree with unusually twisted branches standing alone on a hillside, dramatic natural light, photorealistic landscape photograph',
  connected: 'Wide view of a dense forest where tree roots visibly interweave at the surface, interconnected woodland floor, photorealistic nature photograph',
};

// ── ASK CLAUDE FOR A PROMPT (unknown words in future explorations) ─────────
async function generatePromptWithClaude(word, exploration) {
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
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `Write a short image generation prompt for a PHOTOREALISTIC photograph of: "${word}"
Context: vocabulary word for early childhood curriculum about "${exploration || 'nature'}".
Rules: real photograph only (not cartoon, not illustration), "${word}" must be the clear main subject, natural lighting, child-appropriate. End with: photorealistic nature photograph
Reply with ONLY the prompt text, max 35 words.`
        }]
      })
    });
    const data = await res.json();
    return (((data.content || [])[0] || {}).text || '').trim();
  } catch (e) {
    return '';
  }
}

// ── FETCH IMAGE FROM POLLINATIONS (server-side) ───────────────────────────
async function fetchPollinationsImage(prompt, w, h) {
  const url = 'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(prompt) +
    '?width=' + w + '&height=' + h + '&model=flux&nologo=true&seed=42';

  const res = await fetch(url, {
    timeout: 30000,  // 30 second timeout — Pollinations generates on first request
    headers: { 'Accept': 'image/jpeg,image/*' }
  });

  if (!res.ok) throw new Error('Pollinations returned ' + res.status);

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('image')) throw new Error('Not an image: ' + contentType);

  const buffer = await res.buffer();
  if (!buffer || buffer.length < 1000) throw new Error('Image too small — likely an error page');

  return { buffer, contentType };
}

// ── ROUTE: GET /api/vocab-image/:word ─────────────────────────────────────
router.get('/:word', async (req, res) => {
  const word        = (req.params.word || '').toLowerCase().trim();
  const exploration = (req.query.exploration || 'trees').toLowerCase();
  const w = parseInt(req.query.w) || 680;
  const h = parseInt(req.query.h) || 300;
  const cacheKey = word + '_' + w + 'x' + h;

  // 1. Serve from cache if available
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }

  // 2. Get prompt
  let prompt = KNOWN_PROMPTS[word];
  if (!prompt) {
    prompt = await generatePromptWithClaude(word, exploration);
  }
  if (!prompt || prompt.length < 10) {
    prompt = 'Close-up photograph of ' + word + ', natural daylight, photorealistic nature photograph';
  }

  // 3. Fetch image from Pollinations
  try {
    const { buffer, contentType } = await fetchPollinationsImage(prompt, w, h);
    imageCache.set(cacheKey, { buffer, contentType });
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Vocab image generation failed for "' + word + '":', err.message);
    res.status(503).json({ error: 'Image generation failed', word, prompt });
  }
});

module.exports = router;
