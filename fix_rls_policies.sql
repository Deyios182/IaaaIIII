-- ============================================================
-- FIX RLS — Ejecutar en Supabase SQL Editor
-- Soluciona: error 401 (Unauthorized) y 42501 (RLS violation)
-- ============================================================
-- El anon key no puede escribir/leer porque RLS está activo
-- pero sin políticas. Este script las crea.
-- ============================================================

-- 1. Habilitar RLS (por si acaso no está activo)
ALTER TABLE nova_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_facts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_known_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_memories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_reminders    ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas anteriores conflictivas (idempotente)
DROP POLICY IF EXISTS "nova_profiles_public_access"     ON nova_profiles;
DROP POLICY IF EXISTS "nova_facts_public_access"        ON nova_facts;
DROP POLICY IF EXISTS "nova_known_people_public_access" ON nova_known_people;
DROP POLICY IF EXISTS "nova_memories_public_access"     ON nova_memories;
DROP POLICY IF EXISTS "nova_reminders_public_access"    ON nova_reminders;

-- 3. Crear políticas de acceso total para anon key
--    (App de un solo usuario sin Supabase Auth — acceso público controlado por user_id en código)
CREATE POLICY "nova_profiles_public_access"
    ON nova_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "nova_facts_public_access"
    ON nova_facts FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "nova_known_people_public_access"
    ON nova_known_people FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "nova_memories_public_access"
    ON nova_memories FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "nova_reminders_public_access"
    ON nova_reminders FOR ALL USING (true) WITH CHECK (true);

-- 4. Añadir columnas faltantes en nova_known_people (si no existen)
ALTER TABLE nova_known_people ADD COLUMN IF NOT EXISTS photo_data TEXT;
ALTER TABLE nova_known_people ADD COLUMN IF NOT EXISTS face_descriptor FLOAT[];

-- ✅ Verificación
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies
WHERE tablename LIKE 'nova_%'
ORDER BY tablename;
