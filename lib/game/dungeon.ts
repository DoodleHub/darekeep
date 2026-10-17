import { BUDGET, COST, GRID_H, GRID_W, LIMITS, SAFE_RADIUS, TOKENS_REQUIRED } from "./constants";
import {
  DECOR_KINDS,
  DIRS,
  ENEMY_KINDS,
  SOLID_KINDS,
  TRAP_KINDS,
  type Dir,
  type Kind,
  type Layout,
  type Placed,
} from "./types";

export const idx = (x: number, y: number) => y * GRID_W + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

export function costOf(layout: Layout) {
  let total = 0;
  const gatesPerLever = new Map<number, number>();
  for (const o of layout.objects) {
    switch (o.k) {
      case "wall":
        total += COST.wall;
        break;
      case "slime":
      case "skeleton":
      case "charger":
      case "spike":
      case "launcher":
        total += COST[o.k];
        break;
      case "lever":
        total += COST.lever;
        break;
      case "gate":
        gatesPerLever.set(o.l ?? 0, (gatesPerLever.get(o.l ?? 0) ?? 0) + 1);
        break;
    }
  }
  for (const n of gatesPerLever.values()) total += Math.max(0, n - 1) * COST.extraGate;
  return total;
}

export function counts(layout: Layout) {
  let enemies = 0,
    traps = 0,
    levers = 0,
    walls = 0;
  for (const o of layout.objects) {
    if (ENEMY_KINDS.has(o.k)) enemies++;
    else if (TRAP_KINDS.has(o.k)) traps++;
    else if (o.k === "lever") levers++;
    else if (o.k === "wall") walls++;
  }
  return { enemies, traps, levers, walls };
}

export interface Issue {
  msg: string;
  cells?: Array<[number, number]>;
}

/** Cells the dart from a launcher at (x,y) facing d passes through, ignoring gates (worst case). */
export function launcherPath(layout: Layout, x: number, y: number, d: Dir) {
  const solid = new Uint8Array(GRID_W * GRID_H);
  for (const o of layout.objects) if (o.k === "wall" || o.k === "launcher") solid[idx(o.x, o.y)] = 1;
  const out: Array<[number, number]> = [];
  let cx = x + DIRS[d][0],
    cy = y + DIRS[d][1];
  while (inBounds(cx, cy) && !solid[idx(cx, cy)]) {
    out.push([cx, cy]);
    cx += DIRS[d][0];
    cy += DIRS[d][1];
  }
  return out;
}

/**
 * Flood-fill from the start. Gates open once their lever's cell has been reached,
 * so lever puzzles are respected. Returns a mask of reachable cells.
 */
export function reachable(layout: Layout, sx: number, sy: number) {
  const solid = new Uint8Array(GRID_W * GRID_H);
  const gatesBy = new Map<number, number[]>();
  const leverAt = new Map<number, number>();
  for (const o of layout.objects) {
    const i = idx(o.x, o.y);
    if (o.k === "wall" || o.k === "launcher") solid[i] = 1;
    else if (o.k === "gate") {
      solid[i] = 2;
      const arr = gatesBy.get(o.l ?? 0) ?? [];
      arr.push(i);
      gatesBy.set(o.l ?? 0, arr);
    } else if (o.k === "lever") leverAt.set(i, o.l ?? 0);
  }
  const seen = new Uint8Array(GRID_W * GRID_H);
  const q: number[] = [idx(sx, sy)];
  seen[q[0]] = 1;
  const opened = new Set<number>();
  // Gate cells we bumped into while still closed; revisit them once opened.
  const blocked: number[] = [];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const lever = leverAt.get(c);
    if (lever !== undefined && !opened.has(lever)) {
      opened.add(lever);
      for (const g of gatesBy.get(lever) ?? []) {
        solid[g] = 0;
        if (blocked.includes(g) && !seen[g]) {
          seen[g] = 1;
          q.push(g);
        }
      }
    }
    const x = c % GRID_W,
      y = (c / GRID_W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (seen[n]) continue;
      if (solid[n] === 2) {
        blocked.push(n);
        continue;
      }
      if (solid[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

export function validate(layout: Layout): Issue[] {
  const issues: Issue[] = [];
  const byKind = (k: Kind) => layout.objects.filter((o) => o.k === k);
  const one = (k: Kind, label: string) => {
    const n = byKind(k).length;
    if (n === 0) issues.push({ msg: `Place a ${label}.` });
    if (n > 1) issues.push({ msg: `Only one ${label} allowed.`, cells: byKind(k).map((o) => [o.x, o.y]) });
  };
  one("start", "starting tile");
  one("key", "key");
  one("exit", "exit");
  const tokens = byKind("token");
  if (tokens.length !== TOKENS_REQUIRED)
    issues.push({ msg: `Place exactly ${TOKENS_REQUIRED} treasure tokens (${tokens.length}/${TOKENS_REQUIRED}).` });

  // Overlap / bounds
  const seen = new Map<number, Placed>();
  for (const o of layout.objects) {
    if (!inBounds(o.x, o.y)) issues.push({ msg: "Object outside the room." });
    const i = idx(o.x, o.y);
    if (seen.has(i)) issues.push({ msg: "Two objects share a tile.", cells: [[o.x, o.y]] });
    seen.set(i, o);
  }

  const cost = costOf(layout);
  if (cost > BUDGET) issues.push({ msg: `Over budget: ${cost}/${BUDGET}.` });
  const c = counts(layout);
  if (c.enemies > LIMITS.enemies) issues.push({ msg: `Too many enemies (${c.enemies}/${LIMITS.enemies}).` });
  if (c.traps > LIMITS.traps) issues.push({ msg: `Too many traps (${c.traps}/${LIMITS.traps}).` });
  if (c.levers > LIMITS.levers) issues.push({ msg: `Too many levers (${c.levers}/${LIMITS.levers}).` });

  // Lever links
  const levers = byKind("lever");
  const gates = byKind("gate");
  const leverIds = new Set<number>();
  for (const l of levers) {
    const id = l.l ?? 0;
    if (leverIds.has(id)) issues.push({ msg: "Two levers share one link colour.", cells: [[l.x, l.y]] });
    leverIds.add(id);
    const n = gates.filter((g) => (g.l ?? 0) === id).length;
    if (n === 0) issues.push({ msg: "A lever has no gate linked to it.", cells: [[l.x, l.y]] });
    if (n > LIMITS.gatesPerLever)
      issues.push({ msg: `A lever opens at most ${LIMITS.gatesPerLever} gates.`, cells: [[l.x, l.y]] });
  }
  for (const g of gates)
    if (!leverIds.has(g.l ?? 0)) issues.push({ msg: "A gate has no matching lever.", cells: [[g.x, g.y]] });

  const start = byKind("start")[0];
  if (start) {
    const danger = layout.objects.filter(
      (o) =>
        (ENEMY_KINDS.has(o.k) || TRAP_KINDS.has(o.k)) &&
        Math.max(Math.abs(o.x - start.x), Math.abs(o.y - start.y)) <= SAFE_RADIUS,
    );
    if (danger.length)
      issues.push({
        msg: "Keep enemies and traps 2+ tiles from the start.",
        cells: danger.map((o) => [o.x, o.y]),
      });
    for (const l of byKind("launcher")) {
      const hits = launcherPath(layout, l.x, l.y, (l.d ?? 0) as Dir).some(
        ([x, y]) => Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) <= SAFE_RADIUS,
      );
      if (hits) issues.push({ msg: "A dart launcher fires into the start area.", cells: [[l.x, l.y]] });
    }
    const reach = reachable(layout, start.x, start.y);
    const need = [...byKind("key"), ...byKind("exit"), ...tokens];
    const stuck = need.filter((o) => !reach[idx(o.x, o.y)]);
    if (stuck.length)
      issues.push({ msg: "Key, exit and treasure must be reachable.", cells: stuck.map((o) => [o.x, o.y]) });
  }
  return issues;
}

/** Stable hash of gameplay-relevant content. Decorations and theme are excluded. */
export function layoutHash(layout: Layout) {
  const parts = layout.objects
    .filter((o) => !DECOR_KINDS.has(o.k))
    .map((o) => `${o.k}:${o.x},${o.y},${o.d ?? ""},${o.o ?? ""},${o.l ?? ""}`)
    .sort()
    .join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function objectAt(layout: Layout, x: number, y: number) {
  return layout.objects.find((o) => o.x === x && o.y === y);
}

export function isSolidKind(k: Kind) {
  return SOLID_KINDS.has(k);
}

// ----- ASCII level authoring -----
// .  floor     #  wall      S start   K key   E exit   T token
// s  slime     k  skeleton  c charger
// 0-3 spike with phase offset          > v < ^  dart launcher
// L M N lever (link 0,1,2)            l m n gate (link 0,1,2)
// t torch   r rubble   h chest   ,  moss
export function fromAscii(rows: string[], theme = 0, launcherOffsets: Record<string, number> = {}): Layout {
  const objects: Placed[] = [];
  const dirFor: Record<string, Dir> = { ">": 0, v: 1, "<": 2, "^": 3 };
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const at = { x, y };
      switch (ch) {
        case "#": objects.push({ k: "wall", ...at }); break;
        case "S": objects.push({ k: "start", ...at }); break;
        case "K": objects.push({ k: "key", ...at }); break;
        case "E": objects.push({ k: "exit", ...at }); break;
        case "T": objects.push({ k: "token", ...at }); break;
        case "s": objects.push({ k: "slime", ...at }); break;
        case "k": objects.push({ k: "skeleton", ...at }); break;
        case "c": objects.push({ k: "charger", ...at }); break;
        case "0": case "1": case "2": case "3":
          objects.push({ k: "spike", o: Number(ch), ...at }); break;
        case ">": case "v": case "<": case "^":
          objects.push({ k: "launcher", d: dirFor[ch], o: launcherOffsets[`${x},${y}`] ?? 0, ...at }); break;
        case "L": case "M": case "N":
          objects.push({ k: "lever", l: "LMN".indexOf(ch), ...at }); break;
        case "l": case "m": case "n":
          objects.push({ k: "gate", l: "lmn".indexOf(ch), ...at }); break;
        case "t": objects.push({ k: "torch", ...at }); break;
        case "r": objects.push({ k: "rubble", ...at }); break;
        case "h": objects.push({ k: "chest", ...at }); break;
        case ",": objects.push({ k: "moss", ...at }); break;
      }
    }
  });
  return { v: 1, theme, objects };
}

export function emptyLayout(): Layout {
  return {
    v: 1,
    theme: 0,
    objects: [
      { k: "start", x: 1, y: 6 },
      { k: "exit", x: 14, y: 6 },
    ],
  };
}
