// Core tuning for Darekeep. All gameplay timings are expressed in simulation ticks.

export const GRID_W = 16;
export const GRID_H = 12;
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const sec = (s: number) => Math.round(s * TICK_RATE);
export const ticksToMs = (t: number) => Math.round((t * 1000) / TICK_RATE);

export const TIME_LIMIT = sec(180);

export const PLAYER = {
  hp: 3,
  speed: 5.2,
  half: 0.28,
  hurtProtect: sec(1),
  attackCooldown: sec(0.4),
  attackActiveFrom: 2,
  attackActiveTo: 9,
  attackRange: 1.2,
  attackCos: 0.34, // ~70° half-arc
  rollTime: sec(0.3),
  rollProtect: sec(0.2),
  rollCooldown: sec(1.2),
  rollSpeed: 11,
  pickupRadius: 0.55,
};

export const SLIME = { hp: 1, r: 0.32, speed: 2.3, detect: 5, forget: 8 };
export const SKELETON = { hp: 2, r: 0.34, detect: 8, aim: sec(0.7), lockAt: sec(0.5), recover: sec(1.5), arrowSpeed: 8.5 };
export const CHARGER = { hp: 2, r: 0.42, detect: 6, telegraph: sec(0.8), maxDist: 5, speed: 12, recover: sec(1) };

export const SPIKE = { period: sec(2.5), safe: sec(1), warn: sec(0.5), offsetStep: sec(0.5) };
export const LAUNCHER = { period: sec(2), warn: sec(0.5), dartSpeed: 8, offsetStep: sec(0.5) };

export const BUDGET = 100;
export const LIMITS = { enemies: 8, traps: 12, levers: 3, gatesPerLever: 3 };
export const COST = {
  wall: 1,
  slime: 5,
  skeleton: 8,
  charger: 10,
  spike: 4,
  launcher: 8,
  lever: 6,
  extraGate: 2,
} as const;

export const SAFE_RADIUS = 2;
export const TOKENS_REQUIRED = 3;

export const TAGLINE = "Get the key. Reach the exit. Beat your best.";
