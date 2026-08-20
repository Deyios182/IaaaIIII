/**
 * gym/GymLauncher.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pantalla de entrada al Gimnasio de Robótica InMoov.
 */

import React, { useState } from 'react';
import GymScene from './GymScene';

// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_CARDS = [
  {
    icon: '🦾',
    title: '35 DOF — InMoov Completo',
    desc: 'Cuello, torso, brazos con dedos individuales y piernas. Física Rapier WASM.',
  },
  {
    icon: '🧠',
    title: 'Red Neuronal JS Puro',
    desc: 'REINFORCE con baseline. Input 72D → 128 → 64 → 35 outputs. Sin Python.',
  },
  {
    icon: '📡',
    title: 'Telemetría 30 Hz',
    desc: 'Vector de observación de 72 dimensiones. Conciencia corporal total.',
  },
  {
    icon: '🔗',
    title: 'Exportar a MyRobotLab',
    desc: 'Compatible con Arduino+PCA9685, ROS y el software oficial del InMoov.',
  },
  {
    icon: '🎛️',
    title: '8 Políticas de IA',
    desc: 'Stand, Walk, Reach, Wave, Grasp, Balance. Hot-swap en tiempo real.',
  },
  {
    icon: '💾',
    title: 'Modelos Persistentes',
    desc: 'Los pesos se guardan en JSON. El robot mejora entre sesiones.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function GymLauncher() {
  const [launched, setLaunched] = useState(false);

  if (launched) {
    return (
      /* Cambiado de width/height screen absolutos a inset: 0 relativo al main container */
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        background: '#020617', 
        zIndex: 50, 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <button
          onClick={() => setLaunched(false)}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 200,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(14, 165, 233, 0.5)',
            color: '#38bdf8',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '11px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          ← SALIR DEL GYM
        </button>
        <GymScene />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100%',
      background: 'linear-gradient(135deg, #020617 0%, #0c1a3a 50%, #020617 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: '"Inter", "Segoe UI", sans-serif',
      boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)'
    }}>

      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: 'rgba(14, 165, 233, 0.1)',
        border: '1px solid rgba(14, 165, 233, 0.3)',
        borderRadius: 100, padding: '6px 20px', marginBottom: 24,
        color: '#38bdf8', fontSize: 11, letterSpacing: 2, fontWeight: 700,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        INMOOV SIM-TO-REAL • 35 DOF
      </div>

      {/* Título */}
      <h1 style={{
        color: '#f1f5f9', fontSize: 52, fontWeight: 800,
        margin: '0 0 8px', letterSpacing: -2, lineHeight: 1.1, textAlign: 'center',
      }}>
        🦾 Robot Gym
      </h1>
      <p style={{ color: '#475569', fontSize: 15, maxWidth: 560, lineHeight: 1.7, margin: '0 auto 16px', textAlign: 'center' }}>
        Entrenamiento de IA con conciencia corporal total.<br />
        Física Rapier + red neuronal JS + exportación a hardware real.
      </p>

      {/* DOF badge row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: '🗣️', label: 'Cuello 2DOF' },
          { icon: '💪', label: 'Brazos 8DOF' },
          { icon: '✋', label: 'Manos 10DOF' },
          { icon: '🦵', label: 'Piernas 6DOF' },
        ].map(({ icon, label }) => (
          <span key={label} style={{
            background: 'rgba(14,165,233,0.08)',
            border: '1px solid rgba(14,165,233,0.2)',
            borderRadius: 20, padding: '4px 12px',
            color: '#64748b', fontSize: 11,
          }}>
            {icon} {label}
          </span>
        ))}
      </div>

      {/* Feature grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14, maxWidth: 760, width: '100%', marginBottom: 36,
      }}>
        {FEATURE_CARDS.map((card, i) => (
          <div key={i} style={{
            background: 'rgba(14,165,233,0.04)',
            border: '1px solid rgba(14,165,233,0.12)',
            borderRadius: 12, padding: '18px 16px',
            transition: 'border-color 0.2s, background 0.2s',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(14,165,233,0.35)';
              e.currentTarget.style.background = 'rgba(14,165,233,0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(14,165,233,0.12)';
              e.currentTarget.style.background = 'rgba(14,165,233,0.04)';
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{card.title}</div>
            <div style={{ color: '#475569', fontSize: 11, lineHeight: 1.5 }}>{card.desc}</div>
          </div>
        ))}
      </div>

      {/* Instrucciones servidor */}
      <div style={{
        background: 'rgba(2,6,23,0.8)',
        border: '1px solid rgba(34,197,94,0.2)',
        borderRadius: 10, padding: '16px 20px',
        maxWidth: 560, width: '100%', marginBottom: 32,
      }}>
        <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>
          ▶ INICIAR CEREBRO IA (OPCIONAL)
        </div>
        <code style={{
          display: 'block', color: '#94a3b8', fontSize: 11,
          fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)',
          padding: '10px 12px', borderRadius: 6, lineHeight: 2,
        }}>
          <span style={{ color: '#334155' }}># Instalar dependencia WebSocket</span><br />
          cd gym-server && npm install ws<br />
          <br />
          <span style={{ color: '#334155' }}># Iniciar servidor RL + API REST</span><br />
          node gym-server.js<br />
          <br />
          <span style={{ color: '#334155' }}># API disponible en localhost:8081</span>
        </code>
        <p style={{ color: '#334155', fontSize: 10, marginTop: 8, marginBottom: 0 }}>
          Sin el servidor, el robot cae bajo gravedad. Con él, la IA aprende sola.
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => setLaunched(true)}
        style={{
          background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
          border: 'none', color: 'white',
          padding: '16px 56px', borderRadius: 12,
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          letterSpacing: 0.5,
          boxShadow: '0 0 40px rgba(14,165,233,0.4)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 0 60px rgba(14,165,233,0.6)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 0 40px rgba(14,165,233,0.4)';
        }}
      >
        🚀 Iniciar Simulación InMoov
      </button>

      <p style={{ color: '#1e3a5f', fontSize: 10, marginTop: 16, fontFamily: 'monospace' }}>
        Rapier WASM • 35 RigidBodies • 72D observation space
      </p>
    </div>
  );
}
