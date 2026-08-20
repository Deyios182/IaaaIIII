/**
 * gym-server/gym-server.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Servidor WebSocket del Cerebro IA — Node.js (CommonJS)
 *
 * Implementa 3 Políticas de Control Didácticas intercambiables:
 *  1. 'random': Política de exploración caótica aleatoria (para iniciar).
 *  2. 'stand': Controlador PD de Equilibrio Activo. Trata de mantener el torso erguido.
 *  3. 'walk': Generador de Marcha Sinusoidal (Gait Generator) con seguimiento PD.
 *
 * Admite comandos en tiempo real por WebSocket para cambiar de política o empujar.
 */

const WebSocket = require('ws');

// ─── Configuración ────────────────────────────────────────────────────────────

const PORT = 8080;
const ACTION_HZ = 30; // 30 Hz para mayor precisión de control en física activa
const ACTION_INTERVAL_MS = 1000 / ACTION_HZ;

const JOINTS = [
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

// ─── Estado de la Sesión de Entrenamiento ─────────────────────────────────────

const agentState = {
  episode: 0,
  stepCount: 0,
  totalReward: 0,
  lastTelemetry: null,
  policy: 'stand', // Política activa por defecto: Equilibrio Activo para que no caiga de inmediato
};

// ─── Servidor WebSocket ───────────────────────────────────────────────────────

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`\n🤖 Servidor del Gimnasio IA listo en ws://localhost:${PORT}`);
  console.log(`   Política inicial: '${agentState.policy.toUpperCase()}' | Frecuencia: ${ACTION_HZ} Hz\n`);
});

wss.on('connection', (ws, req) => {
  const clientId = req.socket.remoteAddress;
  console.log(`[GymServer] ✅ Cliente conectado: ${clientId}`);

  // Enviar política activa inicial al conectar
  ws.send(JSON.stringify({
    action: 'status_update',
    policy: agentState.policy,
    serverTs: Date.now()
  }));

  // ── Recibir telemetría y comandos ──────────────────────────────────────────
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // 1. Handshake
      if (msg.type === 'gym_hello') {
        console.log(`[GymServer] 👋 Handshake recibido del Gym Frontend`);
        ws.send(JSON.stringify({
          type: 'gym_ack',
          message: `Cerebro IA conectado. Ejecutando política: ${agentState.policy}`,
          actionHz: ACTION_HZ,
          serverTs: Date.now(),
        }));
        return;
      }

      // 2. Comando para cambiar de política (enviado desde la interfaz o el chatbot)
      if (msg.type === 'set_policy') {
        if (msg.policy && ['random', 'stand', 'walk'].includes(msg.policy)) {
          agentState.policy = msg.policy;
          console.log(`[GymServer] 🧠 Cambio de política a: '${msg.policy.toUpperCase()}'`);
          
          // Notificar cambio
          ws.send(JSON.stringify({
            action: 'status_update',
            policy: agentState.policy,
            serverTs: Date.now()
          }));
        }
        return;
      }

      // 3. Comando de empujón (perturbación física)
      if (msg.type === 'apply_push') {
        const force = msg.force || 5; // Newton-segundos de impulso
        const dir = msg.direction === 'forward' ? [0, 0, force] : 
                    msg.direction === 'backward' ? [0, 0, -force] : [0, force, 0];
        
        console.log(`[GymServer] 💨 Aplicando perturbación: ${msg.direction} (fuerza: ${force} N)`);
        ws.send(JSON.stringify({
          action: 'apply_impulse',
          joint: 'torso',
          vector: dir,
          serverTs: Date.now()
        }));
        return;
      }

      // 4. Procesar TelemetryFrame de físicas
      if (msg.frameId !== undefined) {
        agentState.lastTelemetry = msg;
        agentState.stepCount++;
        agentState.totalReward += msg.reward ?? 0;

        // Resetear al caer (solo tras al menos 10 steps para evitar bucles de reinicio iniciales)
        if (msg.done && agentState.stepCount > 10) {
          console.log(`[GymServer] 🏁 Episodio ${agentState.episode} terminado. Steps: ${agentState.stepCount} | Reward: ${agentState.totalReward.toFixed(2)}`);
          agentState.episode++;
          agentState.stepCount = 0;
          agentState.totalReward = 0;

          ws.send(JSON.stringify({
            action: 'reset_robot',
            serverTs: Date.now(),
          }));
        }
      }
    } catch (err) {
      console.warn('[GymServer] Error procesando mensaje:', err.message);
    }
  });

  // ── Bucle de Control en Tiempo Real (Física y Acción) ──────────────────────
  const actionLoop = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(actionLoop);
      return;
    }

    const telemetry = agentState.lastTelemetry;
    if (!telemetry || !telemetry.robot) return;

    const time = Date.now() / 1000;
    const commands = [];

    // Extraer variables del estado físico del torso
    const [tx, ty, tz] = telemetry.robot.position;
    const [qx, qy, qz, qw] = telemetry.robot.orientation;
    const [vx, vy, vz] = telemetry.robot.linearVelocity;
    const [wx, wy, wz] = telemetry.robot.angularVelocity;

    // Calcular inclinación sagital (Pitch) del torso usando cuaterniones
    const pitch = Math.atan2(2 * (qw * qx + qy * qz), 1 - 2 * (qx * qx + qy * qy));

    // Usar el mapa de articulaciones directamente enviado por el cliente
    const jointMap = telemetry.joints || {};

    // ─────────────────────────────────────────────────────────────────────────
    // POLÍTICA 1: EQUILIBRIO ACTIVO (PD CONTROL)
    // ─────────────────────────────────────────────────────────────────────────
    if (agentState.policy === 'stand') {
      // Ganancias PD para cadera
      const Kp_hip = 75; 
      const Kd_hip = 8;
      
      // Controlar caderas para contrarrestar la inclinación del torso
      const targetHipLeft = -pitch * 1.2;
      const targetHipRight = -pitch * 1.2;

      const currentHipLeft = jointMap['left_hip']?.angle ?? 0;
      const currentHipRight = jointMap['right_hip']?.angle ?? 0;

      const torqueLeftHip = -Kp_hip * (currentHipLeft - targetHipLeft) - Kd_hip * (jointMap['left_hip']?.velocity ?? 0);
      const torqueRightHip = -Kp_hip * (currentHipRight - targetHipRight) - Kd_hip * (jointMap['right_hip']?.velocity ?? 0);

      // Rodillas ligeramente flexionadas para absorber impacto
      const Kp_knee = 60;
      const Kd_knee = 5;
      const targetKnee = -0.35; // ~-20 grados de flexión

      const currentKneeLeft = jointMap['left_knee']?.angle ?? 0;
      const currentKneeRight = jointMap['right_knee']?.angle ?? 0;

      const torqueLeftKnee = -Kp_knee * (currentKneeLeft - targetKnee) - Kd_knee * (jointMap['left_knee']?.velocity ?? 0);
      const torqueRightKnee = -Kp_knee * (currentKneeRight - targetKnee) - Kd_knee * (jointMap['right_knee']?.velocity ?? 0);

      // Tobillos para balance fino
      const Kp_ankle = 30;
      const Kd_ankle = 3;
      const targetAnkle = pitch * 0.5;

      const currentAnkleLeft = jointMap['left_ankle']?.angle ?? 0;
      const currentAnkleRight = jointMap['right_ankle']?.angle ?? 0;

      const torqueLeftAnkle = -Kp_ankle * (currentAnkleLeft - targetAnkle) - Kd_ankle * (jointMap['left_ankle']?.velocity ?? 0);
      const torqueRightAnkle = -Kp_ankle * (currentAnkleRight - targetAnkle) - Kd_ankle * (jointMap['right_ankle']?.velocity ?? 0);

      // Enviar comandos al cliente
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'left_hip', value: parseFloat(torqueLeftHip.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'right_hip', value: parseFloat(torqueRightHip.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'left_knee', value: parseFloat(torqueLeftKnee.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'right_knee', value: parseFloat(torqueRightKnee.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'left_ankle', value: parseFloat(torqueLeftAnkle.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'right_ankle', value: parseFloat(torqueRightAnkle.toFixed(4)), serverTs: Date.now() }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POLÍTICA 2: CAMINAR (GENERADOR DE MARCHA SINUSOIDAL + SEGUIMIENTO PD)
    // ─────────────────────────────────────────────────────────────────────────
    else if (agentState.policy === 'walk') {
      const freq = 4.5; // Frecuencia de pasos
      const amp_hip = 0.35; // Amplitud cadera
      const amp_knee = 0.40; // Amplitud rodilla

      // Huesos de cadera oscilando en desfase de 180° (PI)
      const targetHipLeft = Math.sin(time * freq) * amp_hip - 0.1;
      const targetHipRight = Math.sin(time * freq + Math.PI) * amp_hip - 0.1;

      // Las rodillas se doblan cuando la pierna va hacia atrás para dar el paso
      const targetKneeLeft = (Math.sin(time * freq - Math.PI/2) * amp_knee) - 0.45;
      const targetKneeRight = (Math.sin(time * freq + Math.PI - Math.PI/2) * amp_knee) - 0.45;

      // Tobillos
      const targetAnkleLeft = Math.sin(time * freq) * 0.1;
      const targetAnkleRight = Math.sin(time * freq + Math.PI) * 0.1;

      // Controladores PD para seguir la trayectoria sinusoidal
      const Kp = 75; const Kd = 6;

      const torqueLeftHip = -Kp * ((jointMap['left_hip']?.angle ?? 0) - targetHipLeft) - Kd * (jointMap['left_hip']?.velocity ?? 0);
      const torqueRightHip = -Kp * ((jointMap['right_hip']?.angle ?? 0) - targetHipRight) - Kd * (jointMap['right_hip']?.velocity ?? 0);
      const torqueLeftKnee = -Kp * ((jointMap['left_knee']?.angle ?? 0) - targetKneeLeft) - Kd * (jointMap['left_knee']?.velocity ?? 0);
      const torqueRightKnee = -Kp * ((jointMap['right_knee']?.angle ?? 0) - targetKneeRight) - Kd * (jointMap['right_knee']?.velocity ?? 0);
      const torqueLeftAnkle = -35 * ((jointMap['left_ankle']?.angle ?? 0) - targetAnkleLeft) - 3 * (jointMap['left_ankle']?.velocity ?? 0);
      const torqueRightAnkle = -35 * ((jointMap['right_ankle']?.angle ?? 0) - targetAnkleRight) - 3 * (jointMap['right_ankle']?.velocity ?? 0);

      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'left_hip', value: parseFloat(torqueLeftHip.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'right_hip', value: parseFloat(torqueRightHip.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'left_knee', value: parseFloat(torqueLeftKnee.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'right_knee', value: parseFloat(torqueRightKnee.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'left_ankle', value: parseFloat(torqueLeftAnkle.toFixed(4)), serverTs: Date.now() }));
      ws.send(JSON.stringify({ action: 'apply_torque', joint: 'right_ankle', value: parseFloat(torqueRightAnkle.toFixed(4)), serverTs: Date.now() }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POLÍTICA 3: EXPLORACIÓN ALEATORIA (DUMMY RANDOM)
    // ─────────────────────────────────────────────────────────────────────────
    else {
      // Política aleatoria simple original
      const joint = JOINTS[Math.floor(Math.random() * JOINTS.length)];
      let torqueValue = (Math.random() - 0.5) * 15;
      ws.send(JSON.stringify({
        action: 'apply_torque',
        joint,
        value: parseFloat(torqueValue.toFixed(4)),
        serverTs: Date.now(),
      }));
    }

  }, ACTION_INTERVAL_MS);

  ws.on('close', (code, reason) => {
    clearInterval(actionLoop);
    console.log(`[GymServer] ❌ Cliente desconectado. Código: ${code}`);
  });
});

process.on('SIGINT', () => {
  console.log('\n[GymServer] 🛑 Cerrando servidor...');
  wss.close(() => {
    process.exit(0);
  });
});
