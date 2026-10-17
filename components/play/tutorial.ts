import type { World } from "@/lib/game/sim";
import type { SpriteName } from "@/lib/game/atlas";

export interface Hint {
  id: string;
  icon: SpriteName;
  title: string;
  body: { keys: string; touch: string };
}

const HINTS: Record<string, Hint> = {
  move: {
    id: "move",
    icon: "token",
    title: "Grab the treasure",
    body: { keys: "Move with WASD or the arrow keys. Walk over gold tokens to collect them.", touch: "Drag anywhere on the left side to move. Walk over gold tokens to collect them." },
  },
  attack: {
    id: "attack",
    icon: "sword",
    title: "Slimes ahead — swing!",
    body: { keys: "Click (or press J) to swing toward the cursor. Hold to keep swinging.", touch: "Tap the sword to swing. Drag it to aim." },
  },
  dodge: {
    id: "dodge",
    icon: "spike_warn",
    title: "Roll through hazards",
    body: { keys: "Spikes flash yellow, then rise. Press Space to roll — you're protected for a split second.", touch: "Spikes flash yellow, then rise. Tap the roll button — you're protected for a split second." },
  },
  key: {
    id: "key",
    icon: "key",
    title: "Find the key",
    body: { keys: "The exit stays locked until you hold the key.", touch: "The exit stays locked until you hold the key." },
  },
  exit: {
    id: "exit",
    icon: "exit_open",
    title: "The exit is open — go!",
    body: { keys: "Reach the glowing door. Every run is timed: retry to beat your best.", touch: "Reach the glowing door. Every run is timed: retry to beat your best." },
  },
};

/** Picks the hint that matches what the player should learn right now. */
export function tutorialHint(w: World): Hint {
  const p = w.player;
  // bottom room: key on the left, a spike wall, then the exit
  if (p.y > 7.2) {
    if (!w.key.taken) return HINTS.key;
    return p.x < 12 ? HINTS.dodge : HINTS.exit;
  }
  if (w.key.taken) return HINTS.exit;
  const nearEnemy = w.enemies.some((e) => e.state !== "dead" && Math.hypot(e.x - p.x, e.y - p.y) < 4.5);
  if (nearEnemy || (p.y > 3.2 && w.kills < 2 && w.enemies.some((e) => e.state !== "dead"))) return HINTS.attack;
  return HINTS.move;
}
