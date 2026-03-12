-- TCC Curriculum Portal Database Schema

-- Session store
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- Centers
CREATE TABLE IF NOT EXISTS centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Users (teachers, directors, admin)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','multi_site_director','center_director','teacher')),
  center_id UUID REFERENCES centers(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Classrooms
CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  youngest_months NUMERIC(4,1) NOT NULL,
  oldest_months NUMERIC(4,1) NOT NULL,
  school_year VARCHAR(9) NOT NULL, -- e.g. '2024-2025'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Curriculum plans
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  plan_type VARCHAR(10) NOT NULL CHECK (plan_type IN ('monthly','weekly','daily')),
  school_year VARCHAR(9) NOT NULL,
  month_num INTEGER, -- 1-12
  week_num INTEGER,  -- 1-4
  day_name VARCHAR(10), -- Monday etc
  study_theme VARCHAR(200),
  week_focus VARCHAR(200),
  content JSONB NOT NULL,
  is_complete BOOLEAN DEFAULT false,
  teacher_notes TEXT,
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Teacher classroom history (for transfers)
CREATE TABLE IF NOT EXISTS classroom_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP DEFAULT NOW(),
  removed_at TIMESTAMP
);

-- Insert default centers
INSERT INTO centers (id, name, location) VALUES
  ('11111111-1111-1111-1111-111111111111', 'The Children''s Center - Niles', 'Niles, MI'),
  ('22222222-2222-2222-2222-222222222222', 'The Children''s Center - Peace Boulevard', 'Peace Blvd, MI'),
  ('33333333-3333-3333-3333-333333333333', 'Montessori Children''s Center', 'Saint Joseph, MI')
ON CONFLICT DO NOTHING;
