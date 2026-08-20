-- gym-server/gym_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Schema de Supabase para logs de entrenamiento del Robot Gym (Sim-to-Real)
--
-- Ejecutar en el SQL Editor de Supabase: https://app.supabase.com
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Tabla principal de logs de entrenamiento ────────────────────────────────

CREATE TABLE IF NOT EXISTS gym_training_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Identificación del episodio
    session_id      TEXT NOT NULL,          -- ID único de sesión de entrenamiento
    episode         INTEGER NOT NULL,        -- Número de episodio dentro de la sesión
    step            INTEGER NOT NULL,        -- Número de paso dentro del episodio

    -- Señal de aprendizaje
    reward          FLOAT8 NOT NULL,         -- Recompensa del paso actual
    cumulative_reward FLOAT8 DEFAULT 0,      -- Recompensa acumulada del episodio
    done            BOOLEAN NOT NULL DEFAULT FALSE, -- Si el episodio terminó

    -- Estado del robot (observación)
    torso_height    FLOAT8,                  -- Altura del torso en metros
    torso_x         FLOAT8,                  -- Posición X (desviación lateral)
    torso_z         FLOAT8,                  -- Posición Z (avance hacia adelante)
    forward_velocity FLOAT8,                 -- Velocidad hacia adelante (m/s)
    lateral_velocity FLOAT8,                 -- Velocidad lateral (m/s)

    -- Estado de articulaciones (snapshot JSON)
    -- Estructura: { "left_knee": { "angle": 0.5, "velocity": 1.2, "torque": 5.0 }, ... }
    joint_snapshot  JSONB,

    -- Comando aplicado en este paso
    action_joint    TEXT,                    -- Articulación donde se aplicó el torque
    action_value    FLOAT8,                  -- Magnitud del torque aplicado (N·m)

    -- Métricas de red
    server_latency_ms INTEGER,               -- Latencia WS de ida y vuelta (ms)
    frame_id        BIGINT                   -- ID de frame del cliente
);

-- ─── Tabla de metadatos de sesión ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gym_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT UNIQUE NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,

    -- Configuración del entrenamiento
    robot_config    JSONB,                   -- DEFAULT_ROBOT_CONFIG usado
    policy_name     TEXT DEFAULT 'random',   -- 'random', 'ppo', 'sac', etc.
    notes           TEXT,                    -- Notas libres del investigador

    -- Estadísticas del episodio (actualizadas al cerrar sesión)
    total_episodes  INTEGER DEFAULT 0,
    total_steps     INTEGER DEFAULT 0,
    best_reward     FLOAT8 DEFAULT 0,
    avg_reward      FLOAT8 DEFAULT 0
);

-- ─── Índices para consultas rápidas de análisis ──────────────────────────────

-- Buscar todos los pasos de un episodio específico
CREATE INDEX IF NOT EXISTS idx_gym_logs_episode
    ON gym_training_logs (session_id, episode, step);

-- Buscar los mejores episodios por recompensa
CREATE INDEX IF NOT EXISTS idx_gym_logs_reward
    ON gym_training_logs (reward DESC);

-- Filtrar por si el episodio terminó (para análisis de caídas)
CREATE INDEX IF NOT EXISTS idx_gym_logs_done
    ON gym_training_logs (done) WHERE done = TRUE;

-- ─── Vista para estadísticas por episodio ────────────────────────────────────

CREATE OR REPLACE VIEW gym_episode_stats AS
SELECT
    session_id,
    episode,
    COUNT(*) AS total_steps,
    SUM(reward) AS total_reward,
    AVG(reward) AS avg_reward,
    MAX(torso_height) AS max_height,
    MAX(torso_z) AS max_forward_distance,
    BOOL_OR(done) AS completed,
    MIN(created_at) AS started_at,
    MAX(created_at) AS ended_at
FROM gym_training_logs
GROUP BY session_id, episode
ORDER BY session_id, episode;

-- ─── RLS (Row Level Security) — Opcional para multiusuario ──────────────────
-- Descomentar si se requiere autenticación de usuario:

-- ALTER TABLE gym_training_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gym_sessions ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow anon read" ON gym_training_logs
--     FOR SELECT USING (true);

-- CREATE POLICY "Allow anon insert" ON gym_training_logs
--     FOR INSERT WITH CHECK (true);

-- ─── Función helper para iniciar una sesión nueva ────────────────────────────

CREATE OR REPLACE FUNCTION gym_start_session(
    p_session_id TEXT,
    p_policy_name TEXT DEFAULT 'random',
    p_robot_config JSONB DEFAULT '{}',
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO gym_sessions (session_id, policy_name, robot_config, notes)
    VALUES (p_session_id, p_policy_name, p_robot_config, p_notes)
    ON CONFLICT (session_id) DO NOTHING
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Datos de ejemplo para testing ──────────────────────────────────────────

-- INSERT INTO gym_sessions (session_id, policy_name, notes)
-- VALUES ('test-session-001', 'random', 'Primera sesión de calibración de físicas');
