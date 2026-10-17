// Headless smoke test: a BFS bot plays each curated dungeon; replays must reproduce exactly.
import { CURATED } from "../lib/game/levels";
import { World } from "../lib/game/sim";
import { AIM_NONE, decodeReplay, encodeReplay, pack, quantizeAim, unpack, type InputFrame } from "../lib/game/input";
import { GRID_W, GRID_H, ticksToMs } from "../lib/game/constants";

function bfs(w: World, sx: number, sy: number, tx: number, ty: number) {
  const prev = new Int32Array(GRID_W * GRID_H).fill(-2);
  const s = sy * GRID_W + sx, t = ty * GRID_W + tx;
  prev[s] = -1;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === t) break;
    const x = c % GRID_W, y = (c / GRID_W) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (w.isSolid(nx, ny)) continue;
      const n = ny * GRID_W + nx;
      if (prev[n] !== -2) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[t] === -2) return null;
  const path: number[] = [];
  for (let c = t; c !== -1; c = prev[c]) path.push(c);
  return path.reverse();
}

function botInput(w: World): InputFrame {
  const p = w.player;
  const targets: Array<[number, number]> = [];
  for (const l of w.levers) if (!l.on) targets.push([l.x, l.y]);
  for (const t of w.tokens) if (!t.taken) targets.push([Math.floor(t.x), Math.floor(t.y)]);
  if (!w.key.taken) targets.push([Math.floor(w.key.x), Math.floor(w.key.y)]);
  targets.push([w.exit.x, w.exit.y]);
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  let path: number[] | null = null;
  for (const [tx, ty] of targets) { path = bfs(w, cx, cy, tx, ty); if (path) break; }
  let mx = 0, my = 0;
  if (path) {
    const next = path.length > 1 ? path[1] : path[0];
    const nx = (next % GRID_W) + 0.5, ny = ((next / GRID_W) | 0) + 0.5;
    const dx = nx - p.x, dy = ny - p.y;
    mx = Math.abs(dx) > 0.08 ? Math.sign(dx) : 0;
    my = Math.abs(dy) > 0.08 ? Math.sign(dy) : 0;
  }
  // swing at the nearest enemy or lever in reach
  let aim = AIM_NONE, attack = false, best = 1.6;
  for (const e of w.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < best) { best = d; aim = quantizeAim(e.x - p.x, e.y - p.y); attack = true; }
  }
  for (const l of w.levers) {
    if (l.on) continue;
    const d = Math.hypot(l.x + 0.5 - p.x, l.y + 0.5 - p.y);
    if (d < 1.1) { aim = quantizeAim(l.x + 0.5 - p.x, l.y + 0.5 - p.y); attack = true; }
  }
  const dodge = w.projectiles.some((pr) => pr.alive && Math.hypot(pr.x - p.x, pr.y - p.y) < 1.2);
  return { mx: mx as -1|0|1, my: my as -1|0|1, attack, dodge, aim };
}

let fails = 0;
for (const d of CURATED) {
  const w = new World(d.layout);
  w.begin();
  const frames: number[] = [];
  while (!w.done) {
    const f = pack(botInput(w));
    frames.push(f);
    w.step(unpack(f));
  }
  const code = encodeReplay(frames);
  const decoded = decodeReplay(code);
  const r = new World(d.layout); r.begin();
  for (let i = 0; i < decoded.length && !r.done; i++) r.step(unpack(decoded[i]));
  const same = r.status === w.status && r.tick === w.tick && r.player.x === w.player.x && r.player.y === w.player.y;
  if (!same) fails++;
  console.log(`${d.id.padEnd(9)} ${w.status.padEnd(8)} ${String(ticksToMs(w.tick)).padStart(6)}ms tokens ${w.tokensTaken} dmg ${w.damageTaken} kills ${w.kills} replay ${code.length}B ${same ? "deterministic" : "MISMATCH"}${w.status === "dead" ? " died to " + w.deathCause : ""}`);
}
process.exit(fails ? 1 : 0);
