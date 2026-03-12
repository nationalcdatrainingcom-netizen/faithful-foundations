# Faithful Foundations — Curriculum Platform

Faith-based early childhood curriculum for The Children's Center and beyond.

## What This Is

A full-stack Node.js/Express application that serves as both:
1. **Content Creation Tool** (for Mary/admins) — generate, review, approve, and publish lessons using AI
2. **Curriculum Delivery Site** (for teachers) — access published Daily Learning Experiences, Weekly Teaching Guides, and printables

## Quick Start — Deploy to Render

1. Push this folder to a new GitHub repository (e.g. `faithful-foundations`)
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Set environment variables:
   - `DATABASE_URL` — from your Render PostgreSQL database
   - `SESSION_SECRET` — any long random string
   - `ANTHROPIC_API_KEY` — your Anthropic API key
5. Deploy

The database schema runs automatically on first startup.

## Default Login

- Username: `mary`
- PIN: `1234`
- **Change this immediately after first login via Admin → Users**

## User Roles

| Role | Access |
|------|--------|
| `super_admin` | Everything — generate, approve, publish, manage users |
| `content_admin` | Generate and approve content |
| `center_director` | View all published content for their center |
| `teacher` | View published content for their classroom's age band |

## Adding Teachers

1. Sign in as mary (super_admin)
2. Go to Admin → Users → Create User
3. Set role to `teacher`, assign center and classroom
4. Give them their username and PIN

## Generating Lessons

1. Go to **Create Content** tab
2. Fill in the lesson details (day, week, focus, fruit of spirit, etc.)
3. For continuity context — describe what happened in previous days so the AI can reference prior learning
4. Click Generate — takes ~30-60 seconds
5. Review the lesson
6. Approve → Publish (published lessons become visible to teachers)

## Exploring Trees — Scope & Sequence

The full scope and sequence is in `content/trees-scope-sequence.json`.
All 25 days are mapped with:
- Daily focus and investigation question
- Vocabulary word
- Fruit of the Spirit per week
- Required books
- Fruitful Moments
- Continuity notes for AI generation

## Age Bands

- Infant/Toddler (0–18 months)
- Older Toddler (18–30 months)  
- Preschool (2½–4 years)
- Pre-K (4–5 years)

Note: Infant/Toddler and Older Toddler use a modified lesson format — these will be developed separately.

## Standards

NAEYC Developmental Domains:
- Social & Emotional Development (SE)
- Physical Development & Health (PD)
- Language & Literacy (LL)
- Cognitive Development (CD)
- Creative Arts (CA)

## File Structure

```
faithful-foundations/
├── server.js              — Main Express app
├── package.json
├── render.yaml            — Render deployment config
├── db/
│   └── schema.sql         — Database schema (auto-runs on startup)
├── routes/
│   ├── auth.js            — Login/logout/session
│   ├── explorations.js    — Curriculum library API
│   ├── lessons.js         — Lesson view/approve/publish API
│   ├── generate.js        — AI generation API
│   └── admin.js           — User/center/content management API
├── public/
│   └── index.html         — Full single-page application
└── content/
    └── trees-scope-sequence.json  — Complete Trees exploration map
```
