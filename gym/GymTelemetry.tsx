/**
 * gym/GymTelemetry.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * HUD unificado del Robot Gym InMoov con diseño de 2 Columnas Compacto y Scroll.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TelemetryFrame, GymControllerState, WsStatus } from './types/gym.types';
import { JointCommand } from './types/gym.types';

// ─────────────────────────────────────────────────────────────────────────────

interface GymTelemetryProps {
  controllerState: GymControllerState;
  latestFrame: TelemetryFrame | null;
  mode?: 'rl' | 'pose';
  onModeChange?: (mode: 'rl' | 'pose') => void;
}

const STATUS_CONFIG: Record<WsStatus, { color: string; label: string; pulse: boolean }> = {
  connecting:   { color: '#f59e0b', label: 'CONECTANDO',   pulse: true  },
  connected:    { color: '#22c55e', label: 'CONECTADO',    pulse: false },
  disconnected: { color: '#ef4444', label: 'DESCONECTADO', pulse: false },
  error:        { color: '#f97316', label: 'ERROR',        pulse: true  },
};

const POLICIES = [
  { id: 'stand',        icon: '🧍', label: 'Equilibrio',   desc: 'Mantenerse de pie' },
  { id: 'walk',         icon: '🚶', label: 'Caminar',      desc: 'Avanzar recto' },
  { id: 'reach_left',   icon: '👈', label: 'Brazo Izq.',   desc: 'Extender brazo izquierdo' },
  { id: 'reach_right',  icon: '👉', label: 'Brazo Der.',   desc: 'Extender brazo derecho' },
  { id: 'wave',         icon: '👋', label: 'Saludar',      desc: 'Agitar mano derecha' },
  { id: 'grasp',        icon: '✊', label: 'Agarrar',      desc: 'Cerrar/abrir mano' },
  { id: 'balance_push', icon: '🤸', label: 'Anti-Caída',   desc: 'Recuperar de empujones' },
  { id: 'random',       icon: '🎲', label: 'Caótico',      desc: 'Torques aleatorios' },
];

const POLICY_BODY = {
  stand:        ['legs', 'torso'],
  walk:         ['legs', 'torso', 'arms'],
  reach_left:   ['torso', 'larm'],
  reach_right:  ['torso', 'rarm'],
  wave:         ['rarm', 'rhand', 'neck'],
  grasp:        ['rarm', 'rhand'],
  balance_push: ['legs', 'torso', 'arms'],
  random:       ['legs', 'torso', 'arms', 'lhand', 'rhand', 'neck'],
};

const GROUP_CLR: Record<string, string> = {
  neck:  '#a78bfa', torso: '#60a5fa',
  arms:  '#34d399', larm:  '#34d399', rarm: '#34d399',
  lhand: '#6ee7b7', rhand: '#6ee7b7', legs: '#f59e0b',
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MetricRow({ label, value, unit = '', highlight = false }: {
  label: string; value: string | number; unit?: string; highlight?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ color: '#475569', fontSize: '9px', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ color: highlight ? '#22d3ee' : '#94a3b8', fontSize: '9px', fontFamily: 'monospace', fontWeight: highlight ? 700 : 400 }}>
        {typeof value === 'number' ? value.toFixed(3) : value}
        {unit && <span style={{ color: '#334155', marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8, marginBottom: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', color: '#334155', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
      {children}
    </div>
  );
}

function RewardBar({ reward }: { reward: number }) {
  const normalized = Math.max(0, Math.min(100, ((reward + 2) / 4) * 100));
  const color = reward > 0.5 ? '#22c55e' : reward > -0.5 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#334155', fontSize: 8, fontFamily: 'monospace' }}>REWARD</span>
        <span style={{ color, fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>{reward.toFixed(4)}</span>
      </div>
      <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${normalized}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function BodyMap({ activeGroups }: { activeGroups: string[] }) {
  const has = (g: string) => activeGroups.includes(g);
  const fill = (g: string) => has(g) ? (GROUP_CLR[g] || '#38bdf8') : '#0f172a';
  const stroke = (g: string) => has(g) ? (GROUP_CLR[g] || '#38bdf8') : '#1e293b';
  const s = (g: string): React.CSSProperties => ({ fill: fill(g), stroke: stroke(g), strokeWidth: 0.8, transition: 'all 0.3s' });

  return (
    <svg width={48} height={90} viewBox="0 0 80 140" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={40} cy={11} r={10} style={s('neck')} />
      <rect x={36} y={21} width={8} height={8} rx={2} style={s('neck')} />
      <rect x={22} y={29} width={36} height={40} rx={4} style={s('torso')} />
      <rect x={6} y={29} width={14} height={22} rx={4} style={s('larm')} />
      <rect x={6} y={54} width={14} height={20} rx={3} style={s('larm')} />
      <rect x={4} y={75} width={18} height={14} rx={2} style={s('lhand')} />
      <rect x={60} y={29} width={14} height={22} rx={4} style={s('rarm')} />
      <rect x={60} y={54} width={14} height={20} rx={3} style={s('rarm')} />
      <rect x={58} y={75} width={18} height={14} rx={2} style={s('rhand')} />
      <rect x={23} y={71} width={14} height={28} rx={4} style={s('legs')} />
      <rect x={23} y={101} width={14} height={24} rx={3} style={s('legs')} />
      <rect x={43} y={71} width={14} height={28} rx={4} style={s('legs')} />
      <rect x={43} y={101} width={14} height={24} rx={3} style={s('legs')} />
    </svg>
  );
}

function RewardChart({ history }: { history: number[] }) {
  if (history.length < 2) return (
    <div style={{ height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: 8, fontFamily: 'monospace' }}>
      Esperando datos...
    </div>
  );
  const last = history.slice(-30);
  const maxV = Math.max(...last, 1), minV = Math.min(...last, -1), range = maxV - minV || 1;
  const W = 140, H = 35;
  const pts = last.map((v, i) => `${(i / (last.length - 1)) * W},${H - ((v - minV) / range) * H}`).join(' ');
  const zeroY = H - ((0 - minV) / range) * H;
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="2,2" />
      <polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth={1} />
      <text x={1} y={8}  fill="#334155" fontSize={7} fontFamily="monospace">{maxV.toFixed(0)}</text>
      <text x={1} y={H-1} fill="#334155" fontSize={7} fontFamily="monospace">{minV.toFixed(0)}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const REST_URL = 'http://localhost:8081';

export default function GymTelemetry({ controllerState, latestFrame, mode = 'rl', onModeChange }: GymTelemetryProps) {
  const statusCfg = STATUS_CONFIG[controllerState.status];
  const [activePolicy, setActivePolicy] = useState('stand');
  const [collapsed, setCollapsed] = useState(false);
  const [serverStats, setServerStats] = useState<any>(null);
  const [exportMsg, setExportMsg] = useState('');

  // FPS Counter
  const [fps, setFps] = useState(0);
  const lastFrameRef = useRef(performance.now());
  const fpsArr = useRef<number[]>([]);
  useEffect(() => {
    const iv = setInterval(() => {
      const now = performance.now();
      fpsArr.current.push(1000 / (now - lastFrameRef.current));
      lastFrameRef.current = now;
      if (fpsArr.current.length > 10) fpsArr.current.shift();
      setFps(Math.round(fpsArr.current.reduce((a, b) => a + b, 0) / fpsArr.current.length));
    }, 100);
    return () => clearInterval(iv);
  }, []);

  // REST API Polling
  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${REST_URL}/stats`);
      if (r.ok) setServerStats(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 2000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  // Recibir políticas desde broadcast
  useEffect(() => {
    const ch = new BroadcastChannel('gym_channel');
    ch.onmessage = (e) => { if (e.data?.action === 'set_policy') setActivePolicy(e.data.parameter); };
    return () => ch.close();
  }, []);

  const sendPolicy = (id: string) => {
    const ch = new BroadcastChannel('gym_channel');
    ch.postMessage({ action: 'set_policy', parameter: id });
    ch.close();
    setActivePolicy(id);
    fetch(`${REST_URL}/policy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy: id }) }).catch(() => {});
  };

  const handleExport = async () => {
    try {
      const r = await fetch(`${REST_URL}/export?policy=${activePolicy}`);
      if (r.ok) {
        const data = await r.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `inmoov_${activePolicy}_${Date.now()}.json`;
        a.click();
        setExportMsg('✅ Descargado!');
      } else setExportMsg('⚠️ Servidor offline');
    } catch { setExportMsg('⚠️ Servidor offline'); }
    setTimeout(() => setExportMsg(''), 3000);
  };

  const currentStats = serverStats?.stats?.[activePolicy];
  const rewardHistory: number[] = currentStats?.rewardHistory ?? [];
  const activeGroups: string[] = POLICY_BODY[activePolicy as keyof typeof POLICY_BODY] ?? [];

  const panelBase: React.CSSProperties = {
    position: 'absolute', top: 16,
    background: 'rgba(2, 6, 23, 0.94)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(14, 165, 233, 0.22)',
    borderRadius: 10, padding: 10,
    fontFamily: '"Inter", sans-serif',
    zIndex: 120,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  };

  if (collapsed) {
    return (
      <div style={{ ...panelBase, left: 16, width: 38, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>🤖</span>
        <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14, padding: 0, transform: 'rotate(-90deg)' }}>⟨</button>
      </div>
    );
  }

  return (
    <>
      {/* ══════════════ PANEL IZQUIERDO — DISEÑO COMPACTO MULTI-COLUMNA (360px) ══════════════ */}
      {/* Usamos left: 16 ya que el contenedor 3D inicia después del sidebar de la app. */}
      {/* Agregamos overflowY: 'auto' y calculamos maxHeight sobre el 100% de la altura visible del canvas */}
      <div style={{ 
        ...panelBase, 
        left: 16, 
        width: 360, 
        maxHeight: 'calc(100% - 32px)', 
        overflowY: 'auto',
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        
        {/* Header con Modos */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(14,165,233,0.2)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['rl','🤖 RL'], ['pose','📷 Pose']] as const).map(([m, label]) => (
              <button key={m} onClick={() => onModeChange?.(m)}
                style={{
                  background: mode === m ? 'rgba(14,165,233,0.25)' : 'rgba(15,23,42,0.6)',
                  border: `1px solid ${mode === m ? 'rgba(14,165,233,0.6)' : 'rgba(51,65,85,0.4)'}`,
                  borderRadius: 5, padding: '3px 8px',
                  color: mode === m ? '#38bdf8' : '#64748b',
                  fontSize: 9, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'monospace', transition: 'all 0.15s',
                }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#475569', fontSize: 9, fontFamily: 'monospace' }}>{fps} FPS</span>
            <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 12, padding: 0 }}>⟨</button>
          </div>
        </div>

        {/* Contenido en Dos Columnas */}
        <div style={{ display: 'flex', gap: 10 }}>
          
          {/* COLUMNA 1: Cuerpo + Políticas (Ancho: 165px) */}
          <div style={{ width: 165, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'rgba(15,23,42,0.4)', borderRadius: 8, padding: '4px 0', border: '1px solid rgba(255,255,255,0.02)' }}>
              <BodyMap activeGroups={activeGroups} />
            </div>

            <SectionLabel>Políticas</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
              {POLICIES.map(p => {
                const active = activePolicy === p.id;
                return (
                  <button key={p.id} onClick={() => sendPolicy(p.id)} title={p.desc}
                    style={{
                      background: active ? 'rgba(14,165,233,0.25)' : 'rgba(15,23,42,0.6)',
                      border: `1px solid ${active ? 'rgba(14,165,233,0.7)' : 'rgba(51,65,85,0.5)'}`,
                      borderRadius: 4, padding: '2px 0',
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'all 0.1s',
                    }}>
                    <div style={{ fontSize: 10, lineHeight: 1 }}>{p.icon}</div>
                    <div style={{ color: active ? '#cbd5e1' : '#475569', fontSize: 6.5, marginTop: 1, fontFamily: 'monospace' }}>
                      {p.label.substring(0, 5)}
                    </div>
                  </button>
                );
              })}
            </div>

            <SectionLabel>Empujar Torso</SectionLabel>
            <div style={{ display: 'flex', gap: 2 }}>
              {[{ id: 'forward', label: '↑ Adel.' }, { id: 'backward', label: '↓ Atr.' }, { id: 'up', label: 'Jump' }].map(d => (
                <button key={d.id}
                  onClick={() => { const ch = new BroadcastChannel('gym_channel'); ch.postMessage({ action: 'push', parameter: d.id }); ch.close(); }}
                  style={{ flex: 1, padding: '2px 0', borderRadius: 3, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)', color: '#475569', fontSize: 7.5, cursor: 'pointer', fontFamily: 'monospace' }}
                >{d.label}</button>
              ))}
            </div>
          </div>

          {/* COLUMNA 2: Telemetría + Stats + Gráfica (Ancho: 165px) */}
          <div style={{ width: 165, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: statusCfg.color, boxShadow: `0 0 3px ${statusCfg.color}` }} />
              <span style={{ color: statusCfg.color, fontSize: 8, fontWeight: 700, fontFamily: 'monospace' }}>{statusCfg.label.substring(0, 5)}</span>
              <span style={{ color: '#334155', fontSize: 8, marginLeft: 'auto', fontFamily: 'monospace' }}>{controllerState.latencyMs}ms</span>
            </div>

            <MetricRow label="CMD/Frames" value={`${controllerState.commandsReceived}/${controllerState.framesSent}`} />
            
            {latestFrame && (
              <>
                <SectionLabel>Telemetría</SectionLabel>
                <MetricRow label="Altura Y" value={latestFrame.robot.position[1]} unit="m" highlight={latestFrame.robot.position[1] > 0.4} />
                <MetricRow label="Pos X/Z" value={`${latestFrame.robot.position[0].toFixed(1)}/${latestFrame.robot.position[2].toFixed(1)}`} />
                <MetricRow label="Veloc. Z" value={latestFrame.robot.linearVelocity[2]} unit="m/s" />
                <RewardBar reward={latestFrame.reward} />
              </>
            )}

            <SectionLabel>Entrenamiento RL</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 2 }}>
              <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.3)', borderRadius: 4, padding: '2px 4px' }}>
                <div style={{ color: '#334155', fontSize: 7, fontFamily: 'monospace' }}>Episodio</div>
                <div style={{ color: '#cbd5e1', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>{currentStats?.episode ?? '—'}</div>
              </div>
              <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.3)', borderRadius: 4, padding: '2px 4px' }}>
                <div style={{ color: '#334155', fontSize: 7, fontFamily: 'monospace' }}>Avg Rwd</div>
                <div style={{ color: '#cbd5e1', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>{currentStats ? currentStats.avgReward.toFixed(1) : '—'}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.3)', borderRadius: 4, padding: '2px', marginBottom: 4 }}>
              <RewardChart history={rewardHistory} />
            </div>

            <button onClick={handleExport}
              style={{ width: '100%', padding: '4px', borderRadius: 4, background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(59,130,246,0.12))', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8', fontSize: 8.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s' }}
            >
              🔗 Exportar MyRobotLab
            </button>
            {exportMsg && <div style={{ textAlign: 'center', fontSize: 7.5, color: '#22c55e', marginTop: 1 }}>{exportMsg}</div>}
          </div>
        </div>

        {/* Footer pequeño */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 3, borderTop: '1px solid rgba(255,255,255,0.03)', color: '#1e293b', fontSize: 7, fontFamily: 'monospace' }}>
          <span>ws://localhost:8080</span>
          <span>rest://localhost:8081</span>
        </div>
      </div>

      {/* ══════════════ PANEL DERECHO — Joints en tiempo real (Scrolleable) ══════════════ */}
      {latestFrame && (
        <div style={{ 
          ...panelBase, 
          right: 16, 
          left: 'auto', 
          width: 140, 
          maxHeight: 'calc(100% - 32px)', 
          overflowY: 'auto', 
          scrollbarWidth: 'thin', 
          scrollbarColor: 'rgba(14,165,233,0.15) transparent' 
        }}>
          <div style={{ color: '#38bdf8', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid rgba(14,165,233,0.2)' }}>
            ⚙️ JOINTS ({Object.keys(latestFrame.joints).length})
          </div>
          {(Object.entries(latestFrame.joints) as [string, { torque: number }][]).map(([joint, state]) => (
            <div key={joint} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ color: '#475569', fontSize: 8, fontFamily: 'monospace' }}>{joint.replace(/_/g, ' ')}</span>
              <span style={{ color: Math.abs(state.torque) > 8 ? '#f59e0b' : '#64748b', fontSize: 8, fontFamily: 'monospace' }}>
                {state.torque.toFixed(1)}<span style={{ color: '#1e293b', marginLeft: 1 }}>N</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
