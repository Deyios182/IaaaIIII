-- ============================================
-- NOVA IA - Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- ============ NOVA_PROFILES (User data - standalone, no auth dependency) ============
CREATE TABLE IF NOT EXISTS nova_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    timezone TEXT DEFAULT 'America/Santiago',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_pro BOOLEAN DEFAULT FALSE,
    subscription_end DATE
);

-- Insert Deyios as the first user
INSERT INTO nova_profiles (id, username, timezone, is_pro)
VALUES ('11111111-1111-1111-1111-111111111111', 'Deyios', 'America/Santiago', true)
ON CONFLICT (id) DO NOTHING;

-- ============ NOVA_FACTS (Learned information) ============
CREATE TABLE IF NOT EXISTS nova_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES nova_profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT CHECK (category IN ('like', 'dislike', 'interest', 'habit', 'fact')),
    learned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nova_facts_user ON nova_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_nova_facts_category ON nova_facts(category);

-- ============ NOVA_KNOWN_PEOPLE (Vision detected) ============
CREATE TABLE IF NOT EXISTS nova_known_people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES nova_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT,
    visual_description TEXT,
    voice_description TEXT,
    is_unknown BOOLEAN DEFAULT FALSE,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nova_people_user ON nova_known_people(user_id);

-- ============ NOVA_MEMORIES (Important conversations) ============
CREATE TABLE IF NOT EXISTS nova_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES nova_profiles(id) ON DELETE CASCADE,
    user_message TEXT,
    ai_response TEXT,
    emotion TEXT,
    is_important BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nova_memories_user ON nova_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_nova_memories_time ON nova_memories(timestamp DESC);

-- ============ NOVA_REMINDERS ============
CREATE TABLE IF NOT EXISTS nova_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES nova_profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    trigger_time TIMESTAMP WITH TIME ZONE NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nova_reminders_user ON nova_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_nova_reminders_pending ON nova_reminders(completed, trigger_time);

-- ============ VERIFICATION ============
SELECT 'Tables created successfully!' as status;
SELECT username, is_pro FROM nova_profiles WHERE id = '11111111-1111-1111-1111-111111111111';
