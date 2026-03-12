-- Faithful Foundations Database Schema

-- Session store
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- ============================================================
-- ORGANIZATIONS (purchasing programs / TCC itself)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'customer', -- 'owner' (TCC) or 'customer'
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'active', -- active, trial, expired
  subscription_expires DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert TCC as the owner organization
INSERT INTO organizations (id, name, type, contact_email)
VALUES ('00000000-0000-0000-0000-000000000001', 'The Children''s Center', 'owner', 'admin@tcc.org')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CENTERS (locations within an organization)
-- ============================================================
CREATE TABLE IF NOT EXISTS centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  sync_mode VARCHAR(50) DEFAULT 'flexible', -- 'synced' (all classrooms same topic) or 'flexible'
  created_at TIMESTAMP DEFAULT NOW()
);

-- TCC Centers
INSERT INTO centers (id, organization_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'TCC Niles'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'TCC Peace Boulevard'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', 'Montessori Children''s Center')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CLASSROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID REFERENCES centers(id),
  name VARCHAR(255) NOT NULL,
  age_band VARCHAR(50) NOT NULL, -- 'infant_toddler', 'older_toddler', 'preschool', 'prek'
  age_range_label VARCHAR(100), -- display label e.g. "2½–4 years"
  teacher_name VARCHAR(255),
  current_exploration_id UUID, -- active exploration
  current_day INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  center_id UUID REFERENCES centers(id),
  classroom_id UUID REFERENCES classrooms(id),
  username VARCHAR(100) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'super_admin', 'content_admin', 'center_director', 'teacher'
  full_name VARCHAR(255),
  email VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Default super admin (Mary)
INSERT INTO users (id, organization_id, username, pin_hash, role, full_name)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000001',
  'mary',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: 1234
  'super_admin',
  'Mary'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- EXPLORATIONS (the curriculum units)
-- ============================================================
CREATE TABLE IF NOT EXISTS explorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL, -- e.g. "Exploring Trees"
  topic VARCHAR(100) NOT NULL, -- e.g. "trees"
  overarching_question TEXT,
  suggested_month VARCHAR(50),
  total_days INT DEFAULT 25,
  core_days INT DEFAULT 20,
  optional_days INT DEFAULT 5,
  status VARCHAR(50) DEFAULT 'in_development', -- 'in_development', 'partial', 'complete', 'published', 'coming_soon'
  weeks_available INT DEFAULT 0, -- how many weeks are fully published
  scope_sequence JSONB, -- stores the full scope and sequence JSON
  book_list JSONB, -- required and suggested books
  learning_area_setup JSONB, -- Day 1 area changes
  sort_order INT DEFAULT 99,
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
);

-- Insert Trees exploration
INSERT INTO explorations (id, title, topic, overarching_question, suggested_month, status, sort_order)
VALUES (
  'eeeeeeee-eeee-eeee-eeee-000000000001',
  'Exploring Trees',
  'trees',
  'What are trees? How do trees grow, change, and help the world around them?',
  'May',
  'in_development',
  1
) ON CONFLICT DO NOTHING;

-- ============================================================
-- DAILY LESSONS
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exploration_id UUID REFERENCES explorations(id),
  day_number INT NOT NULL,
  week_number INT NOT NULL,
  day_type VARCHAR(50) DEFAULT 'core', -- 'introduction', 'core', 'optional_review'
  age_band VARCHAR(50) NOT NULL, -- 'infant_toddler', 'older_toddler', 'preschool', 'prek'
  focus VARCHAR(255),
  fruit_of_spirit VARCHAR(100),
  vocabulary_word VARCHAR(100),
  vocabulary_definition TEXT,
  vocabulary_spanish VARCHAR(100),
  lets_think TEXT,
  lets_think_display_instructions TEXT,
  required_book JSONB, -- {title, author}
  fruitful_moments JSONB, -- array of {name, type}
  content TEXT, -- full generated lesson text
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'in_review', 'approved', 'published'
  mary_notes TEXT, -- approval notes
  generation_prompt JSONB, -- stores what was sent to AI
  continuity_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  published_at TIMESTAMP,
  UNIQUE(exploration_id, day_number, age_band)
);

-- ============================================================
-- FRUITFUL MOMENTS (cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS fruitful_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exploration_id UUID REFERENCES explorations(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50), -- 'opening', 'transition', 'outdoor', 'social_emotional'
  naeyc_objective TEXT,
  related_objectives TEXT,
  full_script TEXT,
  observation_questions JSONB,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CLASSROOM PROGRESS (tracks which day each classroom is on)
-- ============================================================
CREATE TABLE IF NOT EXISTS classroom_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  exploration_id UUID REFERENCES explorations(id),
  current_day INT DEFAULT 1,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  UNIQUE(classroom_id, exploration_id)
);

-- ============================================================
-- CENTER SUBSCRIPTIONS (what explorations a center has access to)
-- ============================================================
CREATE TABLE IF NOT EXISTS center_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID REFERENCES centers(id),
  exploration_id UUID REFERENCES explorations(id),
  purchased_at TIMESTAMP DEFAULT NOW(),
  expires_at DATE,
  UNIQUE(center_id, exploration_id)
);

-- TCC has access to everything
INSERT INTO center_subscriptions (center_id, exploration_id)
SELECT c.id, e.id
FROM centers c, explorations e
WHERE c.organization_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;
