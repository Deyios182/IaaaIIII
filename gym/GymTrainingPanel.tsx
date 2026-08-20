/**
 * gym/GymTrainingPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel de Control de Entrenamiento IA — InMoov Full Body
 *
 * Muestra en tiempo real:
 *  • Política activa (selector con 8 modos)
 *  • Gráfica de reward por episodio (SVG, últimos 50)
 *  • Mapa corporal InMoov (joints activos)
 *  • Estadísticas de entrenamiento (episodios, reward promedio)
 *  • Botón exportar a MyRobotLab
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PolicyName, POLICY_DESCRIPTIONS, JOINT_GROUPS } from './types/gym.types';

// ─────────────────────────────────────────────────────────────────────────────

interface TrainingStats {
  activePolicy: PolicyName;
  stats: Record<string, {
    episode: number;
    stepCount: number;
    rewardHistory: number[];
    avgReward: number;
  }>;
  joints: number;
  clients: number;
}

interface GymTrainingPanelProps {
  isVisible?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

const REST_URL = 'http://localhost:8081';

// Colores para los grupos de joints
const GROUP_COLORS: Record<string, string> = {
  neck:       '#a78bfa',
  torso:      '#60a5fa',
  left_arm:   '#34d399',
  right_arm:  '#34d399',
  left_hand:  '#6ee7b7',
  right_hand: '#6ee7b7',
  legs:       '#f59e0b',
};

// ─── Mini Gráfica de Reward ───────────────────────────────────────────────────

function RewardChart({ history }: { history: number[] }) {
  if (history.length < 2) {
    return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 11, fontFamily: 'monospace' }}>
        Esperando episodios...
      </div>
    );
  }

  const last50 = history.slice(-50);
  const maxVal = Math.max(...last50, 1);
  const minVal = Math.min(...last50, -1);
  const range  = maxVal - minVal || 1;
  const W = 260, H = 80;

  const points = last50.map((v, i) => {
    const x = (i / (last50.length - 1)) * W;
    const y = H - ((v - minVal) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Línea de cero
  const zeroY = H - ((0 - minVal) / range) * H;

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Línea de cero */}
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="4,4" />
      {/* Área bajo la curva */}
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <polyline points={`0,${H} ${points} ${W},${H}`} fill="url(#chartGrad)" />
      {/* Línea principal */}
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Punto actual */}
      {last50.length > 0 && (() => {
        const lastX = W;
        const lastY = H - ((last50[last50.length - 1] - minVal) / range) * H;
        return <circle cx={lastX} cy={lastY} r={3} fill="#38bdf8" />;
      })()}
      {/* Labels */}
      <text x={2} y={10} fill="#475569" fontSize={9} fontFamily="monospace">{maxVal.toFixed(1)}</text>
      <text x={2} y={H - 2} fill="#475569" fontSize={9} fontFamily="monospace">{minVal.toFixed(1)}</text>
    </svg>
  );
}

// ─── Mapa Corporal InMoov ─────────────────────────────────────────────────────

function BodyMap({ activeJointGroups }: { activeJointGroups: string[] }) {
  const isActive = (group: string) => activeJointGroups.includes(group);

  const partStyle = (group: string): React.CSSProperties => ({
    fill: isActive(group) ? GROUP_COLORS[group] || '#38bdf8' : '#1e293b',
    stroke: isActive(group) ? (GROUP_COLORS[group] || '#38bdf8') : '#334155',
    strokeWidth: 1,
    transition: 'fill 0.3s, stroke 0.3s',
    filter: isActive(group) ? `drop-shadow(0 0 4px ${GROUP_COLORS[group] || '#38bdf8'})` : 'none',
  });

  return (
    <svg width={100} height={180} viewBox="0 0 100 180" style={{ display: 'block', margin: '0 auto' }}>
      {/* Cabeza */}
      <circle cx={50} cy={14} r={13} style={partStyle('neck')} />
      {/* Cuello */}
      <rect x={45} y={27} width={10} height={10} rx={2} style={partStyle('neck')} />
      {/* Torso */}
      <rect x={28} y={37} width={44} height={52} rx={5} style={partStyle('torso')} />
      {/* Brazo izquierdo — superior */}
      <rect x={8} y={37} width={18} height={28} rx={5} style={partStyle('left_arm')} />
      {/* Brazo izquierdo — antebrazo */}
      <rect x={8} y={68} width={18} height={26} rx={4} style={partStyle('left_arm')} />
      {/* Mano izquierda */}
      <rect x={6} y={97} width={22} height={18} rx={3} style={partStyle('left_hand')} />
      {/* Dedos izquierdos */}
      {[0,1,2,3,4].map(i => (
        <rect key={i} x={7 + i*4} y={115} width={3} height={12} rx={1.5} style={partStyle('left_hand')} />
      ))}
      {/* Brazo derecho — superior */}
      <rect x={74} y={37} width={18} height={28} rx={5} style={partStyle('right_arm')} />
      {/* Brazo derecho — antebrazo */}
      <rect x={74} y={68} width={18} height={26} rx={4} style={partStyle('right_arm')} />
      {/* Mano derecha */}
      <rect x={72} y={97} width={22} height={18} rx={3} style={partStyle('right_hand')} />
      {/* Dedos derechos */}
      {[0,1,2,3,4].map(i => (
        <rect key={i} x={73 + i*4} y={115} width={3} height={12} rx={1.5} style={partStyle('right_hand')} />
      ))}
      {/* Pierna izquierda — muslo */}
      <rect x={29} y={91} width={18} height={36} rx={5} style={partStyle('legs')} />
      {/* Pierna izquierda — tibia */}
      <rect x={29} y={130} width={18} height={32} rx={4} style={partStyle('legs')} />
      {/* Pie izquierdo */}
      <rect x={24} y={162} width={28} height={10} rx={3} style={partStyle('legs')} />
      {/* Pierna derecha — muslo */}
      <rect x={53} y={91} width={18} height={36} rx={5} style={partStyle('legs')} />
      {/* Pierna derecha — tibia */}
      <rect x={53} y={130} width={18} height={32} rx={4} style={partStyle('legs')} />
      {/* Pie derecho */}
      <rect x={48} y={162} width={28} height={10} rx={3} style={partStyle('legs')} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GymTrainingPanel({ isVisible = true }: GymTrainingPanelProps) {
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyName>('stand');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Pollear el servidor REST cada 2s
  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${REST_URL}/stats`);
      if (r.ok) {
        const data: TrainingStats = await r.json();
        setStats(data);
        setSelectedPolicy(data.activePolicy as PolicyName);
      }
    } catch { /* servidor no corriendo, silencioso */ }
  }, []);

  useEffect(() => {
    fetchStats();
    pollRef.current = setInterval(fetchStats, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchStats]);

  const handlePolicyChange = async (policy: PolicyName) => {
    try {
      await fetch(`${REST_URL}/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      });
      setSelectedPolicy(policy);
      // También notificar via BroadcastChannel al gym
      const ch = new BroadcastChannel('gym_channel');
      ch.postMessage({ action: 'set_policy', parameter: policy });
      ch.close();
    } catch { console.warn('[GymPanel] Servidor no disponible'); }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportMsg('');
    try {
      const r = await fetch(`${REST_URL}/export?policy=${selectedPolicy}`);
      if (r.ok) {
        const data = await r.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inmoov_${selectedPolicy}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg('✅ Exportado!');
      }
    } catch {
      setExportMsg('⚠️ Conéctate al servidor primero');
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMsg(''), 3000);
    }
  };

  if (!isVisible) return null;

  const policyNames = Object.keys(POLICY_DESCRIPTIONS) as PolicyName[];
  const currentPolicyDef = POLICY_DESCRIPTIONS[selectedPolicy];
  const currentStats = stats?.stats?.[selectedPolicy];
  const rewardHistory = currentStats?.rewardHistory ?? [];
  const avgReward = currentStats?.avgReward ?? 0;
  const episode = currentStats?.episode ?? 0;
  const serverOnline = stats !== null;

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    left: 16,
    width: collapsed ? 44 : 290,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    background: 'rgba(2, 6, 23, 0.92)',
    border: '1px solid rgba(14, 165, 233, 0.25)',
    borderRadius: 12,
    padding: collapsed ? 10 : 16,
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    zIndex: 100,
    backdropFilter: 'blur(12px)',
    transition: 'width 0.3s ease',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(14,165,233,0.3) transparent',
  };

  if (collapsed) {
    return (
      <div style={panelStyle}>
        <button onClick={() => setCollapsed(false)} title="Abrir panel IA"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <span style={{ fontSize: 8, color: '#475569', writingMode: 'vertical-rl', letterSpacing: 1, marginTop: 4 }}>RL PANEL</span>
        </button>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <div>
            <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>InMoov RL</div>
            <div style={{ color: '#475569', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>35 DOF • 72D obs</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: serverOnline ? '#22c55e' : '#ef4444', boxShadow: serverOnline ? '0 0 6px #22c55e' : 'none' }} />
            <span style={{ color: serverOnline ? '#22c55e' : '#ef4444', fontSize: 9, fontFamily: 'monospace' }}>
              {serverOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 14, padding: 0, lineHeight: 1 }}>⟨</button>
        </div>
      </div>

      {/* ── Selector de Política ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Política Activa</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {policyNames.map(policy => {
            const def = POLICY_DESCRIPTIONS[policy];
            const active = policy === selectedPolicy;
            return (
              <button key={policy} onClick={() => handlePolicyChange(policy)}
                style={{
                  background: active ? 'rgba(14,165,233,0.2)' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${active ? 'rgba(14,165,233,0.6)' : 'rgba(51,65,85,0.6)'}`,
                  borderRadius: 6,
                  padding: '6px 8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  boxShadow: active ? '0 0 10px rgba(14,165,233,0.2)' : 'none',
                }}>
                <div style={{ fontSize: 14, marginBottom: 2 }}>{def.icon}</div>
                <div style={{ color: active ? '#e2e8f0' : '#64748b', fontSize: 9, fontWeight: 600, lineHeight: 1.2 }}>{def.label}</div>
              </button>
            );
          })}
        </div>
        {/* Descripción de política activa */}
        <div style={{ marginTop: 8, background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.1)', borderRadius: 6, padding: '6px 10px' }}>
          <div style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>
            {currentPolicyDef.icon} {currentPolicyDef.desc}
          </div>
        </div>
      </div>

      {/* ── Mapa Corporal ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Joints Activos</div>
        <BodyMap activeJointGroups={currentPolicyDef.activeJoints as string[]} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, justifyContent: 'center' }}>
          {(currentPolicyDef.activeJoints as string[]).map(group => (
            <span key={group} style={{ background: `${GROUP_COLORS[group] || '#38bdf8'}22`, border: `1px solid ${GROUP_COLORS[group] || '#38bdf8'}55`, borderRadius: 4, padding: '2px 6px', fontSize: 8, color: GROUP_COLORS[group] || '#38bdf8', fontFamily: 'monospace' }}>
              {group.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* ── Estadísticas ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Entrenamiento</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'Episodio', value: episode },
            { label: 'Avg Reward', value: avgReward.toFixed(2) },
            { label: 'Joints', value: stats?.joints ?? 35 },
            { label: 'Clientes', value: stats?.clients ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)', borderRadius: 6, padding: '6px 8px' }}>
              <div style={{ color: '#475569', fontSize: 8, marginBottom: 2 }}>{label}</div>
              <div style={{ color: '#e2e8f0', fontSize: 14, fontFamily: 'monospace', fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gráfica Reward ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Reward por Episodio</div>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)', borderRadius: 8, padding: '8px', overflow: 'hidden' }}>
          <RewardChart history={rewardHistory} />
        </div>
        {rewardHistory.length > 0 && (
          <div style={{ marginTop: 4, textAlign: 'right', color: '#475569', fontSize: 9, fontFamily: 'monospace' }}>
            {rewardHistory.length} episodios registrados
          </div>
        )}
      </div>

      {/* ── Acciones ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Exportar a robot */}
        <button onClick={handleExport} disabled={isExporting}
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(59,130,246,0.2))',
            border: '1px solid rgba(14,165,233,0.4)',
            borderRadius: 8,
            color: '#38bdf8',
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: isExporting ? 'wait' : 'pointer',
            fontFamily: '"Inter", sans-serif',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.7)'; e.currentTarget.style.background = 'rgba(14,165,233,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(14,165,233,0.1), rgba(59,130,246,0.1))'; }}
        >
          <span>{isExporting ? '⏳' : '🔗'}</span>
          <span>{isExporting ? 'Exportando...' : 'Exportar → MyRobotLab'}</span>
        </button>
        {exportMsg && (
          <div style={{ textAlign: 'center', fontSize: 10, color: exportMsg.startsWith('✅') ? '#22c55e' : '#f59e0b', fontFamily: 'monospace' }}>
            {exportMsg}
          </div>
        )}

        {/* Guardar modelo */}
        <button onClick={async () => { try { await fetch(`${REST_URL}/save`, { method: 'POST' }); } catch {} }}
          style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(51,65,85,0.5)',
            borderRadius: 8,
            color: '#64748b',
            padding: '7px 12px',
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: '"Inter", sans-serif',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(100,116,139,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(51,65,85,0.5)'; }}
        >
          💾 Guardar Modelo
        </button>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(51,65,85,0.4)', textAlign: 'center', color: '#1e3a5f', fontSize: 8, fontFamily: 'monospace', letterSpacing: 0.5 }}>
        node gym-server/gym-server.js
      </div>
    </div>
  );
}
