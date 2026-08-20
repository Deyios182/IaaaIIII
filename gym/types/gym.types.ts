/**
 * gym/types/gym.types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tipos centrales del Gimnasio de Robótica — InMoov Full Body (35 DOF)
 * Todos los módulos del Gym importan desde aquí.
 */

// ─── Articulaciones InMoov — 35 DOF ──────────────────────────────────────────

/**
 * Mapa completo de articulaciones del robot InMoov.
 * Cada nombre mapea a un RigidBody o Joint en RobotAvatar.tsx.
 *
 * CUELLO (2):   neck_yaw, neck_pitch
 * TORSO  (1):   torso_rotation
 * BRAZOS (8):   l/r_shoulder_pitch, l/r_shoulder_yaw, l/r_elbow, l/r_wrist
 * MANOS  (10):  l/r_thumb, l/r_index, l/r_middle, l/r_ring, l/r_pinky
 * PIERNAS(6):   left/right_hip, left/right_knee, left/right_ankle
 */
export type JointName =
  // ── Cuello ────────────────────────────────────────────────────────────────
  | 'neck_yaw'        // Giro horizontal (izq-der)
  | 'neck_pitch'      // Inclinación vertical (arriba-abajo)
  // ── Torso ─────────────────────────────────────────────────────────────────
  | 'torso_rotation'  // Giro de cintura
  // ── Brazo Izquierdo ───────────────────────────────────────────────────────
  | 'l_shoulder_pitch'  // Hombro: elevación frontal
  | 'l_shoulder_yaw'   // Hombro: abducción lateral
  | 'l_elbow'          // Codo: flexión
  | 'l_wrist'          // Muñeca: rotación
  // ── Mano Izquierda ────────────────────────────────────────────────────────
  | 'l_thumb'
  | 'l_index'
  | 'l_middle'
  | 'l_ring'
  | 'l_pinky'
  // ── Brazo Derecho ─────────────────────────────────────────────────────────
  | 'r_shoulder_pitch'
  | 'r_shoulder_yaw'
  | 'r_elbow'
  | 'r_wrist'
  // ── Mano Derecha ──────────────────────────────────────────────────────────
  | 'r_thumb'
  | 'r_index'
  | 'r_middle'
  | 'r_ring'
  | 'r_pinky'
  // ── Piernas (heredado del modelo bípedo) ──────────────────────────────────
  | 'left_hip'    | 'right_hip'
  | 'left_knee'   | 'right_knee'
  | 'left_ankle'  | 'right_ankle';

/** Lista ordenada de todos los joints — útil para loops en el servidor RL */
export const ALL_JOINTS: JointName[] = [
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

/** Grupos de joints para políticas específicas */
export const JOINT_GROUPS = {
  neck:      ['neck_yaw', 'neck_pitch'] as JointName[],
  torso:     ['torso_rotation'] as JointName[],
  left_arm:  ['l_shoulder_pitch', 'l_shoulder_yaw', 'l_elbow', 'l_wrist'] as JointName[],
  right_arm: ['r_shoulder_pitch', 'r_shoulder_yaw', 'r_elbow', 'r_wrist'] as JointName[],
  left_hand: ['l_thumb', 'l_index', 'l_middle', 'l_ring', 'l_pinky'] as JointName[],
  right_hand:['r_thumb', 'r_index', 'r_middle', 'r_ring', 'r_pinky'] as JointName[],
  legs:      ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'] as JointName[],
} as const;

// ─── Políticas disponibles ────────────────────────────────────────────────────

export type PolicyName =
  | 'random'         // Política aleatoria (debug)
  | 'stand'          // Mantenerse de pie
  | 'walk'           // Caminar hacia adelante
  | 'reach_left'     // Extender brazo izquierdo
  | 'reach_right'    // Extender brazo derecho
  | 'wave'           // Saludar con la mano
  | 'grasp'          // Cerrar/abrir mano
  | 'balance_push';  // Recuperarse de empujones

export const POLICY_DESCRIPTIONS: Record<PolicyName, { label: string; icon: string; desc: string; activeJoints: (keyof typeof JOINT_GROUPS)[] }> = {
  random:       { label: 'Random',        icon: '🎲', desc: 'Torques aleatorios (debug)',            activeJoints: ['legs', 'torso'] },
  stand:        { label: 'Equilibrio',    icon: '🧍', desc: 'Mantenerse de pie con balance',         activeJoints: ['legs', 'torso'] },
  walk:         { label: 'Caminar',       icon: '🚶', desc: 'Caminar recto hacia adelante',           activeJoints: ['legs', 'torso', 'left_arm', 'right_arm'] },
  reach_left:   { label: 'Alcanzar Izq.', icon: '👈', desc: 'Extender brazo izquierdo',             activeJoints: ['left_arm', 'torso'] },
  reach_right:  { label: 'Alcanzar Der.', icon: '👉', desc: 'Extender brazo derecho',               activeJoints: ['right_arm', 'torso'] },
  wave:         { label: 'Saludar',       icon: '👋', desc: 'Saludar con la mano derecha',           activeJoints: ['right_arm', 'right_hand', 'neck'] },
  grasp:        { label: 'Agarrar',       icon: '✊', desc: 'Cerrar y abrir la mano derecha',         activeJoints: ['right_hand', 'right_arm'] },
  balance_push: { label: 'Anti-Caída',    icon: '🤸', desc: 'Recuperarse de empujones externos',     activeJoints: ['legs', 'torso', 'left_arm', 'right_arm'] },
};

// ─── Comandos del Cerebro IA → Gym ────────────────────────────────────────────

/** Acciones que el cerebro IA puede enviar vía WebSocket */
export type GymActionType =
  | 'apply_torque'      // Aplica torque angular a una articulación
  | 'apply_impulse'     // Aplica impulso lineal puntual al torso
  | 'reset_robot'       // Reinicia el robot a posición inicial
  | 'set_angle'         // Establece ángulo directo de articulación (pose capture)
  | 'set_policy'        // Cambia la política activa en el servidor
  | 'request_telemetry' // Solicita un frame de telemetría inmediato
  | 'apply_push';       // Empujón externo (para policy balance_push)

/**
 * Comando JSON enviado por el servidor WebSocket al frontend.
 * Protocolo: {"action": "apply_torque", "joint": "l_elbow", "value": 5.0}
 */
export interface JointCommand {
  action: GymActionType;
  joint?: JointName;
  /** Magnitud de la fuerza/torque (N·m para torque, N para impulso) */
  value?: number;
  /** Vector 3D opcional para impulsos dirigidos [x, y, z] */
  vector?: [number, number, number];
  /** Política nueva (para set_policy) */
  policy?: PolicyName;
  /** Timestamp del servidor (ms epoch) — para medir latencia */
  serverTs?: number;
}

// ─── Telemetría: Gym → Cerebro IA ────────────────────────────────────────────

/** Estado instantáneo de una articulación */
export interface JointState {
  angle: number;       // Ángulo actual (radianes)
  velocity: number;    // Velocidad angular (rad/s)
  torque: number;      // Último torque aplicado (N·m)
}

/** Pose completa del torso en un instante */
export interface RobotPose {
  position: [number, number, number];            // Centroide del torso [x, y, z]
  orientation: [number, number, number, number]; // Cuaternión [x, y, z, w]
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number];
}

/**
 * Frame de telemetría enviado al servidor IA.
 * Se envía a 30 Hz (throttled). Contiene la observación completa de 72D.
 */
export interface TelemetryFrame {
  frameId: number;
  timestamp: number;          // ms epoch del cliente
  serverLatency?: number;     // ms de round-trip del último comando
  robot: RobotPose;
  joints: Partial<Record<JointName, JointState>>;
  /** Señal de recompensa calculada en el frontend */
  reward: number;
  /** true si el episodio terminó (robot cayó, out of bounds, tiempo agotado) */
  done: boolean;
  /** Política activa en este frame */
  activePolicy?: PolicyName;
  /** Info adicional libre para debugging */
  info?: Record<string, unknown>;
}

// ─── Configuración del Robot InMoov ──────────────────────────────────────────

export interface JointLimit {
  lower: number;  // Ángulo mínimo (radianes)
  upper: number;  // Ángulo máximo (radianes)
  servoPin?: number;       // Pin de servo en Arduino/PCA9685
  servoMin?: number;       // Posición mínima servo (0-180°)
  servoMax?: number;       // Posición máxima servo (0-180°)
}

/** Configuración física del InMoov completo con límites de servo reales */
export const INMOOV_JOINT_LIMITS: Record<JointName, JointLimit> = {
  // Cuello
  neck_yaw:          { lower: -0.87, upper: 0.87,  servoPin: 0,  servoMin: 40, servoMax: 140 },  // ±50°
  neck_pitch:        { lower: -0.52, upper: 0.52,  servoPin: 1,  servoMin: 60, servoMax: 120 },  // ±30°
  // Torso
  torso_rotation:    { lower: -0.79, upper: 0.79,  servoPin: 2,  servoMin: 35, servoMax: 145 },  // ±45°
  // Brazo Izquierdo
  l_shoulder_pitch:  { lower: -1.57, upper: 1.57,  servoPin: 3,  servoMin: 0,  servoMax: 180 },  // ±90°
  l_shoulder_yaw:    { lower: -1.22, upper: 0.17,  servoPin: 4,  servoMin: 10, servoMax: 80  },  // -70° a +10°
  l_elbow:           { lower: 0,     upper: 2.62,  servoPin: 5,  servoMin: 0,  servoMax: 150 },  // 0° a 150°
  l_wrist:           { lower: -1.57, upper: 1.57,  servoPin: 6,  servoMin: 0,  servoMax: 180 },
  // Mano Izquierda
  l_thumb:           { lower: 0,     upper: 1.57,  servoPin: 7,  servoMin: 0,  servoMax: 90  },
  l_index:           { lower: 0,     upper: 1.57,  servoPin: 8,  servoMin: 0,  servoMax: 90  },
  l_middle:          { lower: 0,     upper: 1.57,  servoPin: 9,  servoMin: 0,  servoMax: 90  },
  l_ring:            { lower: 0,     upper: 1.57,  servoPin: 10, servoMin: 0,  servoMax: 90  },
  l_pinky:           { lower: 0,     upper: 1.57,  servoPin: 11, servoMin: 0,  servoMax: 90  },
  // Brazo Derecho
  r_shoulder_pitch:  { lower: -1.57, upper: 1.57,  servoPin: 12, servoMin: 0,  servoMax: 180 },
  r_shoulder_yaw:    { lower: -0.17, upper: 1.22,  servoPin: 13, servoMin: 100,servoMax: 170 },
  r_elbow:           { lower: 0,     upper: 2.62,  servoPin: 14, servoMin: 0,  servoMax: 150 },
  r_wrist:           { lower: -1.57, upper: 1.57,  servoPin: 15, servoMin: 0,  servoMax: 180 },
  // Mano Derecha
  r_thumb:           { lower: 0,     upper: 1.57,  servoPin: 16, servoMin: 0,  servoMax: 90  },
  r_index:           { lower: 0,     upper: 1.57,  servoPin: 17, servoMin: 0,  servoMax: 90  },
  r_middle:          { lower: 0,     upper: 1.57,  servoPin: 18, servoMin: 0,  servoMax: 90  },
  r_ring:            { lower: 0,     upper: 1.57,  servoPin: 19, servoMin: 0,  servoMax: 90  },
  r_pinky:           { lower: 0,     upper: 1.57,  servoPin: 20, servoMin: 0,  servoMax: 90  },
  // Piernas
  left_hip:          { lower: -0.5,  upper: 1.2,   servoPin: 21, servoMin: 20, servoMax: 160 },
  right_hip:         { lower: -0.5,  upper: 1.2,   servoPin: 22, servoMin: 20, servoMax: 160 },
  left_knee:         { lower: -2.1,  upper: 0.05,  servoPin: 23, servoMin: 0,  servoMax: 120 },
  right_knee:        { lower: -2.1,  upper: 0.05,  servoPin: 24, servoMin: 0,  servoMax: 120 },
  left_ankle:        { lower: -0.5,  upper: 0.5,   servoPin: 25, servoMin: 60, servoMax: 120 },
  right_ankle:       { lower: -0.5,  upper: 0.5,   servoPin: 26, servoMin: 60, servoMax: 120 },
};

// ─── Estado de Conexión WebSocket ─────────────────────────────────────────────

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface GymControllerState {
  status: WsStatus;
  lastCommand: JointCommand | null;
  framesSent: number;
  commandsReceived: number;
  latencyMs: number;
  activePolicy: PolicyName;
  episode: number;
  totalReward: number;
}
