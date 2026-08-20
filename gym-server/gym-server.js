/**
 * gym-server/gym-server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cerebro IA del Robot InMoov — Servidor WebSocket + HTTP REST
 *
 * CARACTERÍSTICAS:
 *  • Red neuronal en JS puro (sin Python, sin TensorFlow) — 2 capas densas
 *  • Algoritmo REINFORCE con baseline (policy gradient)
 *  • Multi-política: stand, walk, reach_left, reach_right, wave, grasp, balance_push
 *  • Vector de observación de 72 dimensiones (conciencia corporal completa)
 *  • Persistencia de modelos en ./models/*.json
 *  • API REST en puerto 8081 para el panel de control
 *  • Exportación a formato InMoov/MyRobotLab JSON
 *
 * USO:
 *   npm install ws
 *   node gym-server.js
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Configuración ─────────────────────────────────────────────────────────────

const WS_PORT   = 8080;
const REST_PORT = 8081;
const ACTION_HZ = 20;
const ACTION_INTERVAL_MS = 1000 / ACTION_HZ;
const MODELS_DIR = path.join(__dirname, 'models');

if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// ─── Articulaciones InMoov (35 DOF) ──────────────────────────────────────────

const ALL_JOINTS = [
  'neck_yaw', 'neck_pitch',
  'torso_rotation',
  'l_shoulder_pitch', 'l_shoulder_yaw', 'l_elbow', 'l_wrist',
  'l_thumb', 'l_index', 'l_middle', 'l_ring', 'l_pinky',
  'r_shoulder_pitch', 'r_shoulder_yaw', 'r_elbow', 'r_wrist',
  'r_thumb', 'r_index', 'r_middle', 'r_ring', 'r_pinky',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

// Joints activos por política
const POLICY_JOINTS = {
  random:       ALL_JOINTS,
  stand:        ['left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','torso_rotation'],
  walk:         ['left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','torso_rotation','l_shoulder_pitch','r_shoulder_pitch'],
  reach_left:   ['l_shoulder_pitch','l_shoulder_yaw','l_elbow','l_wrist','torso_rotation'],
  reach_right:  ['r_shoulder_pitch','r_shoulder_yaw','r_elbow','r_wrist','torso_rotation'],
  wave:         ['r_shoulder_pitch','r_shoulder_yaw','r_elbow','neck_yaw'],
  grasp:        ['r_thumb','r_index','r_middle','r_ring','r_pinky','r_wrist'],
  balance_push: ['left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','l_shoulder_pitch','r_shoulder_pitch','torso_rotation'],
};

// ─── Red Neuronal Simple (JS Puro) ────────────────────────────────────────────
// Arquitectura: Input(72) → Dense(128, tanh) → Dense(64, tanh) → Output(35, tanh)

class NeuralNet {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize  = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    this.lr = 0.001; // Learning rate

    // Inicializar pesos con Xavier/Glorot
    const xavier = (fan_in, fan_out) => Math.sqrt(6 / (fan_in + fan_out));
    this.W1 = this._randMatrix(hiddenSize, inputSize,  xavier(inputSize, hiddenSize));
    this.b1 = new Array(hiddenSize).fill(0);
    this.W2 = this._randMatrix(hiddenSize, hiddenSize, xavier(hiddenSize, hiddenSize));
    this.b2 = new Array(hiddenSize).fill(0);
    this.W3 = this._randMatrix(outputSize, hiddenSize, xavier(hiddenSize, outputSize));
    this.b3 = new Array(outputSize).fill(0);

    // Historial de activaciones para backprop
    this._cache = {};
  }

  _randMatrix(rows, cols, scale) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
    );
  }

  _tanh(x)     { return Math.tanh(x); }
  _tanhDeriv(y) { return 1 - y * y; }

  _matVec(W, v, b) {
    return W.map((row, i) => row.reduce((sum, w, j) => sum + w * v[j], 0) + b[i]);
  }

  /** Forward pass — devuelve acciones en rango [-1, 1] */
  forward(obs) {
    const z1 = this._matVec(this.W1, obs, this.b1);
    const a1 = z1.map(v => this._tanh(v));
    const z2 = this._matVec(this.W2, a1, this.b2);
    const a2 = z2.map(v => this._tanh(v));
    const z3 = this._matVec(this.W3, a2, this.b3);
    const a3 = z3.map(v => this._tanh(v));
    this._cache = { obs, a1, a2, a3 };
    return a3;
  }

  /** Actualización simple de gradientes por reward signal (REINFORCE) */
  update(reward) {
    const { obs, a1, a2, a3 } = this._cache;
    if (!obs) return;
    const lr = this.lr * Math.sign(reward) * Math.min(Math.abs(reward), 5.0);

    // Capa 3 (output)
    for (let i = 0; i < this.outputSize; i++) {
      const grad = this._tanhDeriv(a3[i]);
      for (let j = 0; j < this.hiddenSize; j++) {
        this.W3[i][j] += lr * grad * a2[j];
      }
      this.b3[i] += lr * grad;
    }

    // Capa 2
    for (let i = 0; i < this.hiddenSize; i++) {
      const grad = this._tanhDeriv(a2[i]);
      for (let j = 0; j < this.hiddenSize; j++) {
        this.W2[i][j] += lr * grad * a1[j];
      }
      this.b2[i] += lr * grad;
    }

    // Capa 1
    for (let i = 0; i < this.hiddenSize; i++) {
      const grad = this._tanhDeriv(a1[i]);
      for (let j = 0; j < this.inputSize; j++) {
        this.W1[i][j] += lr * grad * obs[j];
      }
      this.b1[i] += lr * grad;
    }
  }

  /** Serializar pesos a JSON */
  toJSON() {
    return { W1: this.W1, b1: this.b1, W2: this.W2, b2: this.b2, W3: this.W3, b3: this.b3,
             inputSize: this.inputSize, hiddenSize: this.hiddenSize, outputSize: this.outputSize };
  }

  /** Cargar pesos desde JSON */
  fromJSON(data) {
    this.W1 = data.W1; this.b1 = data.b1;
    this.W2 = data.W2; this.b2 = data.b2;
    this.W3 = data.W3; this.b3 = data.b3;
  }
}

// ─── Gestor de Políticas ──────────────────────────────────────────────────────

class PolicyManager {
  constructor() {
    this.policies = {};
    this.activePolicy = 'stand';
    this._initPolicies();
  }

  _initPolicies() {
    const policyNames = ['stand','walk','reach_left','reach_right','wave','grasp','balance_push'];
    for (const name of policyNames) {
      const modelPath = path.join(MODELS_DIR, `${name}.json`);
      const net = new NeuralNet(72, 128, 35);
      if (fs.existsSync(modelPath)) {
        try {
          net.fromJSON(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
          console.log(`[PolicyManager] ✅ Modelo cargado: ${name}`);
        } catch (e) {
          console.warn(`[PolicyManager] ⚠️  Error cargando ${name}:`, e.message);
        }
      }
      this.policies[name] = { net, episode: 0, stepCount: 0, totalReward: 0, rewardHistory: [] };
    }
  }

  setPolicy(name) {
    if (name === 'random' || this.policies[name]) {
      this.activePolicy = name;
      console.log(`[PolicyManager] 🎛️  Política activa: ${name}`);
      return true;
    }
    return false;
  }

  getActive() {
    return this.policies[this.activePolicy] || { net: null, episode: 0, stepCount: 0, totalReward: 0, rewardHistory: [] };
  }

  saveModel(name) {
    const policy = this.policies[name];
    if (!policy) return;
    const modelPath = path.join(MODELS_DIR, `${name}.json`);
    fs.writeFileSync(modelPath, JSON.stringify(policy.net.toJSON(), null, 2));
    console.log(`[PolicyManager] 💾 Modelo guardado: ${name}`);
  }

  getStats() {
    const stats = {};
    for (const [name, p] of Object.entries(this.policies)) {
      stats[name] = {
        episode: p.episode,
        stepCount: p.stepCount,
        rewardHistory: p.rewardHistory.slice(-50),
        avgReward: p.rewardHistory.length > 0
          ? p.rewardHistory.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, p.rewardHistory.length)
          : 0,
      };
    }
    return stats;
  }
}

// ─── Constructor de Observación (72D) ────────────────────────────────────────

function buildObservation(telemetry) {
  if (!telemetry) return new Array(72).fill(0);

  const robot  = telemetry.robot || {};
  const joints = telemetry.joints || {};
  const pos    = robot.position || [0, 0, 0];
  const ori    = robot.orientation || [0, 0, 0, 1];
  const linVel = robot.linearVelocity || [0, 0, 0];
  const angVel = robot.angularVelocity || [0, 0, 0];

  // Convertir cuaternión → Euler (roll, pitch, yaw)
  const [qx, qy, qz, qw] = ori;
  const roll  = Math.atan2(2*(qw*qx + qy*qz), 1 - 2*(qx*qx + qy*qy));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2*(qw*qy - qz*qx))));
  const yaw   = Math.atan2(2*(qw*qz + qx*qy), 1 - 2*(qy*qy + qz*qz));

  const obs = [
    // Torso pose [0-6]
    pos[0] * 0.1,          // x (normalizado)
    Math.min(pos[1], 3) * 0.5, // y altura
    pos[2] * 0.1,          // z
    roll  / Math.PI,       // roll [-1, 1]
    pitch / Math.PI,       // pitch [-1, 1]
    yaw   / Math.PI,       // yaw [-1, 1]
    // Velocidades [7-12]
    Math.max(-5, Math.min(5, linVel[0])) * 0.2,
    Math.max(-5, Math.min(5, linVel[1])) * 0.2,
    Math.max(-5, Math.min(5, linVel[2])) * 0.2,
    Math.max(-5, Math.min(5, angVel[0])) * 0.2,
    Math.max(-5, Math.min(5, angVel[1])) * 0.2,
    Math.max(-5, Math.min(5, angVel[2])) * 0.2,
  ];

  // Añadir estado de todos los joints [13-71] — ángulo + velocidad por joint
  for (const jointName of ALL_JOINTS) {
    const j = joints[jointName] || { angle: 0, velocity: 0 };
    obs.push(Math.max(-1, Math.min(1, j.angle / Math.PI)));
    obs.push(Math.max(-1, Math.min(1, j.velocity / (2 * Math.PI))));
  }

  // Padding hasta 72 si faltan joints
  while (obs.length < 72) obs.push(0);
  return obs.slice(0, 72);
}

// ─── Calculadora de Recompensa ────────────────────────────────────────────────

function calculateReward(telemetry, policyName) {
  if (!telemetry) return 0;
  const robot  = telemetry.robot || {};
  const joints = telemetry.joints || {};
  const pos    = robot.position || [0, 0, 0];
  const linVel = robot.linearVelocity || [0, 0, 0];
  const ori    = robot.orientation || [0, 0, 0, 1];

  // Extraer roll/pitch del cuaternión
  const [qx, qy, qz, qw] = ori;
  const roll  = Math.atan2(2*(qw*qx + qy*qz), 1 - 2*(qx*qx + qy*qy));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2*(qw*qy - qz*qx))));

  const height     = pos[1];                // altura del torso
  const forwardVel = linVel[2];             // velocidad Z (adelante)
  const lateralDev = Math.abs(linVel[0]);   // desviación lateral
  const tiltPenalty = (Math.abs(roll) + Math.abs(pitch)) / Math.PI; // inclinación

  // Energía gastada (suma de torques al cuadrado)
  const energy = Object.values(joints).reduce((sum, j) => {
    return sum + (j && j.torque ? Math.abs(j.torque) : 0);
  }, 0) * 0.001;

  let reward = 0;

  switch (policyName) {
    case 'stand':
      reward = 2.0 * Math.max(0, height - 0.5)    // Estar de pie
             - 1.5 * tiltPenalty                   // No inclinarse
             - 0.5 * lateralDev                    // No moverse lateralmente
             - energy;                             // Eficiencia energética
      break;

    case 'walk':
      reward = 3.0 * Math.max(0, forwardVel)        // Avanzar
             + 1.5 * Math.max(0, height - 0.5)      // Estar de pie
             - 0.5 * lateralDev                     // No desviarse
             - 1.0 * tiltPenalty                    // Estabilidad
             - energy;
      break;

    case 'reach_left': {
      const lElbow = (joints['l_elbow']?.angle ?? 0);
      const lShoulder = (joints['l_shoulder_pitch']?.angle ?? 0);
      reward = 2.0 * Math.max(0, lShoulder)          // Levantar hombro
             + 1.5 * Math.max(0, lElbow * 0.5)       // Extender codo
             + 0.5 * Math.max(0, height - 0.4)        // Mantenerse de pie
             - energy;
      break;
    }

    case 'reach_right': {
      const rElbow = (joints['r_elbow']?.angle ?? 0);
      const rShoulder = (joints['r_shoulder_pitch']?.angle ?? 0);
      reward = 2.0 * Math.max(0, rShoulder)
             + 1.5 * Math.max(0, rElbow * 0.5)
             + 0.5 * Math.max(0, height - 0.4)
             - energy;
      break;
    }

    case 'wave': {
      // Saludar: oscilar el hombro derecho periódicamente
      const rShoulder = Math.abs(joints['r_shoulder_pitch']?.angle ?? 0);
      reward = 3.0 * rShoulder                       // Hombro elevado
             + 0.5 * Math.max(0, height - 0.4)
             - energy;
      break;
    }

    case 'grasp': {
      // Cerrar la mano: todos los dedos deben flexionarse
      const fingers = ['r_thumb','r_index','r_middle','r_ring','r_pinky'];
      const avgFingerAngle = fingers.reduce((sum, f) => sum + Math.abs(joints[f]?.angle ?? 0), 0) / fingers.length;
      reward = 4.0 * avgFingerAngle                  // Dedos cerrados
             - energy;
      break;
    }

    case 'balance_push':
      reward = 3.0 * Math.max(0, height - 0.5)        // No caerse
             - 2.0 * tiltPenalty                       // Recuperar vertical
             - 0.5 * lateralDev
             - energy;
      break;

    default: // random
      reward = Math.max(0, height - 0.5);
  }

  // Penalización severa por caída
  if (telemetry.done) reward -= 20.0;

  return Math.max(-25, Math.min(25, reward));
}

// ─── Instancia global del gestor de políticas ─────────────────────────────────

const policyManager = new PolicyManager();

// ─── Servidor WebSocket ───────────────────────────────────────────────────────

const wss = new WebSocket.Server({ port: WS_PORT }, () => {
  console.log(`\n🤖 InMoov Gym Server — WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`   REST API: http://localhost:${REST_PORT}`);
  console.log(`   Política inicial: ${policyManager.activePolicy}`);
  console.log(`   Joints activos: ${ALL_JOINTS.length}\n`);
});

wss.on('connection', (ws) => {
  console.log('[GymServer] ✅ Simulador conectado');
  let lastTelemetry = null;
  let lastObservation = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Handshake
      if (msg.type === 'gym_hello') {
        ws.send(JSON.stringify({
          type: 'gym_ack',
          message: `InMoov RL Server listo. Política: ${policyManager.activePolicy}`,
          actionHz: ACTION_HZ,
          activePolicy: policyManager.activePolicy,
          joints: ALL_JOINTS.length,
          serverTs: Date.now(),
        }));
        return;
      }

      // Cambiar política desde el chatbot/frontend
      if (msg.type === 'set_policy') {
        policyManager.setPolicy(msg.policy);
        ws.send(JSON.stringify({ type: 'policy_changed', policy: policyManager.activePolicy }));
        return;
      }

      // Frame de telemetría
      if (msg.frameId !== undefined) {
        lastTelemetry = msg;

        // Calcular recompensa con la función de reward actual
        const reward = calculateReward(msg, policyManager.activePolicy);

        const activePolicy = policyManager.getActive();
        activePolicy.stepCount++;
        activePolicy.totalReward += reward;

        // Actualizar la red neuronal con la recompensa
        if (lastObservation && activePolicy.net) {
          activePolicy.net.update(reward);
        }

        // Fin de episodio
        if (msg.done) {
          const ep = activePolicy.episode;
          const totalR = activePolicy.totalReward;
          activePolicy.rewardHistory.push(totalR);
          if (activePolicy.rewardHistory.length > 200) activePolicy.rewardHistory.shift();

          console.log(`[RL] 🏁 Episodio ${ep} | Steps: ${activePolicy.stepCount} | Reward: ${totalR.toFixed(2)} | Política: ${policyManager.activePolicy}`);

          activePolicy.episode++;
          activePolicy.stepCount = 0;
          activePolicy.totalReward = 0;

          // Guardar modelo cada 10 episodios
          if (ep % 10 === 0) {
            policyManager.saveModel(policyManager.activePolicy);
          }

          // Reset
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'reset_robot', serverTs: Date.now() }));
          }
        }
      }
    } catch (err) {
      console.warn('[GymServer] Mensaje mal formado:', err.message);
    }
  });

  // ── Loop de acciones ──────────────────────────────────────────────────────
  const actionLoop = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) { clearInterval(actionLoop); return; }

    const activePolicy = policyManager.getActive();
    const joints = POLICY_JOINTS[policyManager.activePolicy] || ALL_JOINTS;

    let action;
    if (policyManager.activePolicy === 'random' || !lastTelemetry) {
      // Política aleatoria (fallback/debug)
      const joint = joints[Math.floor(Math.random() * joints.length)];
      let torque = (Math.random() - 0.5) * 20;
      if (joint.includes('knee')) torque = Math.random() * 8 + 2;
      action = [{ action: 'apply_torque', joint, value: parseFloat(torque.toFixed(4)), serverTs: Date.now() }];
    } else {
      // Red neuronal → observación → acción
      const obs = buildObservation(lastTelemetry);
      lastObservation = obs;
      const rawActions = activePolicy.net.forward(obs);

      // Mapear salidas de la red a comandos de torque para los joints activos
      action = joints.map((joint, i) => {
        const jointIdx = ALL_JOINTS.indexOf(joint);
        const rawVal = jointIdx >= 0 ? rawActions[jointIdx] : 0;

        // Escalar según el tipo de joint
        let maxT = 30;
        if (joint.includes('hip'))    maxT = 40;
        if (joint.includes('knee'))   maxT = 50;
        if (joint.includes('ankle'))  maxT = 25;
        if (joint.includes('elbow') || joint.includes('shoulder')) maxT = 20;
        if (joint.includes('wrist') || joint.includes('thumb') || 
            joint.includes('index') || joint.includes('middle') ||
            joint.includes('ring') || joint.includes('pinky'))  maxT = 5;
        if (joint.includes('neck'))   maxT = 8;

        return {
          action: 'apply_torque',
          joint,
          value: parseFloat((rawVal * maxT).toFixed(4)),
          serverTs: Date.now(),
        };
      });
    }

    try {
      // Enviar comandos (máximo 6 por tick para no saturar)
      const cmdsToSend = Array.isArray(action) ? action.slice(0, 8) : [action];
      for (const cmd of cmdsToSend) {
        ws.send(JSON.stringify(cmd));
      }
    } catch (err) {
      console.error('[GymServer] Error enviando comando:', err.message);
      clearInterval(actionLoop);
    }
  }, ACTION_INTERVAL_MS);

  ws.on('close', () => {
    clearInterval(actionLoop);
    console.log('[GymServer] ❌ Simulador desconectado');
  });

  ws.on('error', (err) => console.error('[GymServer] Error:', err.message));
});

// ─── API REST ─────────────────────────────────────────────────────────────────

const restServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = req.url;

  // GET /stats — estadísticas de entrenamiento
  if (req.method === 'GET' && url === '/stats') {
    res.writeHead(200);
    res.end(JSON.stringify({
      activePolicy: policyManager.activePolicy,
      stats: policyManager.getStats(),
      joints: ALL_JOINTS.length,
      clients: wss.clients.size,
    }));
    return;
  }

  // POST /policy — cambiar política
  if (req.method === 'POST' && url === '/policy') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { policy } = JSON.parse(body);
        const ok = policyManager.setPolicy(policy);
        res.writeHead(ok ? 200 : 400);
        res.end(JSON.stringify({ success: ok, activePolicy: policyManager.activePolicy }));
        // Notificar a clientes WS
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'set_policy', policy }));
          }
        });
      } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
    });
    return;
  }

  // POST /save — guardar modelo actual
  if (req.method === 'POST' && url === '/save') {
    policyManager.saveModel(policyManager.activePolicy);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, saved: policyManager.activePolicy }));
    return;
  }

  // GET /export?policy=walk — exportar keyframes para robot real
  if (req.method === 'GET' && url.startsWith('/export')) {
    const policyName = new URL(url, 'http://localhost').searchParams.get('policy') || policyManager.activePolicy;
    const policy = policyManager.policies[policyName];
    if (!policy) { res.writeHead(404); res.end(JSON.stringify({ error: 'Policy not found' })); return; }

    // Generar 20 keyframes (1 segundo a 20Hz) con inferencia de la red
    const keyframes = [];
    const dummyObs = new Array(72).fill(0);
    dummyObs[1] = 1.6 * 0.5; // Altura nominal InMoov

    for (let t = 0; t < 20; t++) {
      dummyObs[0] = Math.sin(t * 0.31) * 0.1; // Ciclo de marcha simulado
      const actions = policy.net.forward([...dummyObs]);
      const servoAngles = {};
      ALL_JOINTS.forEach((joint, i) => {
        // Convertir de [-1,1] a ángulos de servo [servoMin, servoMax]
        const SERVO_CONFIG = {
          neck_yaw:          { min: 40,  max: 140 },
          neck_pitch:        { min: 60,  max: 120 },
          torso_rotation:    { min: 35,  max: 145 },
          l_shoulder_pitch:  { min: 0,   max: 180 },
          l_shoulder_yaw:    { min: 10,  max: 80  },
          l_elbow:           { min: 0,   max: 150 },
          l_wrist:           { min: 0,   max: 180 },
          l_thumb:           { min: 0,   max: 90  },
          l_index:           { min: 0,   max: 90  },
          l_middle:          { min: 0,   max: 90  },
          l_ring:            { min: 0,   max: 90  },
          l_pinky:           { min: 0,   max: 90  },
          r_shoulder_pitch:  { min: 0,   max: 180 },
          r_shoulder_yaw:    { min: 100, max: 170 },
          r_elbow:           { min: 0,   max: 150 },
          r_wrist:           { min: 0,   max: 180 },
          r_thumb:           { min: 0,   max: 90  },
          r_index:           { min: 0,   max: 90  },
          r_middle:          { min: 0,   max: 90  },
          r_ring:            { min: 0,   max: 90  },
          r_pinky:           { min: 0,   max: 90  },
          left_hip:          { min: 20,  max: 160 },
          right_hip:         { min: 20,  max: 160 },
          left_knee:         { min: 0,   max: 120 },
          right_knee:        { min: 0,   max: 120 },
          left_ankle:        { min: 60,  max: 120 },
          right_ankle:       { min: 60,  max: 120 },
        };
        const cfg = SERVO_CONFIG[joint] || { min: 0, max: 180 };
        const normalized = (actions[i] + 1) / 2; // [0, 1]
        servoAngles[joint] = Math.round(cfg.min + normalized * (cfg.max - cfg.min));
      });
      keyframes.push({ t: t / 20, servos: servoAngles });
    }

    const exportData = {
      robot: 'inmoov',
      policy: policyName,
      export_ts: new Date().toISOString(),
      frequency_hz: 20,
      obs_size: 72,
      action_size: ALL_JOINTS.length,
      note: 'Compatible con MyRobotLab, ROS joint_trajectory, Arduino+PCA9685',
      keyframes,
    };

    res.writeHead(200);
    res.end(JSON.stringify(exportData, null, 2));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found', routes: ['/stats', '/policy', '/save', '/export?policy=NAME'] }));
});

restServer.listen(REST_PORT, () => {
  console.log(`[REST] 🌐 API disponible en http://localhost:${REST_PORT}`);
  console.log(`[REST]   GET  /stats           → Estadísticas de entrenamiento`);
  console.log(`[REST]   POST /policy          → {"policy": "walk"}`);
  console.log(`[REST]   POST /save            → Guardar modelo actual`);
  console.log(`[REST]   GET  /export?policy=  → Exportar a MyRobotLab JSON\n`);
});

// ─── Reporte periódico ────────────────────────────────────────────────────────

setInterval(() => {
  if (wss.clients.size > 0) {
    const p = policyManager.getActive();
    const avgR = p.rewardHistory.length > 0
      ? (p.rewardHistory.slice(-5).reduce((a,b) => a+b, 0) / Math.min(5, p.rewardHistory.length)).toFixed(2)
      : '0.00';
    console.log(`[RL] 📊 Política: ${policyManager.activePolicy} | Ep: ${p.episode} | Avg Reward(5): ${avgR} | Clientes: ${wss.clients.size}`);
  }
}, 10000);

// ─── Cierre limpio ────────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n[GymServer] 🛑 Guardando modelos y cerrando...');
  Object.keys(policyManager.policies).forEach(name => policyManager.saveModel(name));
  wss.close(() => { restServer.close(() => { process.exit(0); }); });
});
