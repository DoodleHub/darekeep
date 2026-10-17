import {
  CHARGER,
  DT,
  GRID_H,
  GRID_W,
  LAUNCHER,
  PLAYER,
  SKELETON,
  SLIME,
  SPIKE,
  TIME_LIMIT,
  TOKENS_REQUIRED,
} from "./constants";
import { AIM_NONE, AIM_TABLE, type InputFrame } from "./input";
import { DIRS, type Dir, type Layout } from "./types";

export type Status = "ready" | "playing" | "won" | "dead" | "timeout";

export type EventType =
  | "swing"
  | "hit"
  | "kill"
  | "hurt"
  | "roll"
  | "token"
  | "key"
  | "locked"
  | "win"
  | "die"
  | "arrow"
  | "dart"
  | "projHit"
  | "spike"
  | "lever"
  | "gate"
  | "telegraph"
  | "charge"
  | "slam"
  | "aim"
  | "step"
  | "timeout";

export interface GameEvent {
  t: EventType;
  x: number;
  y: number;
  /** extra info: enemy kind, cause, etc. */
  s?: string;
  dx?: number;
  dy?: number;
}

export type EnemyKind = "slime" | "skeleton" | "charger";
export type EnemyState = "idle" | "chase" | "aim" | "tele" | "charge" | "recover" | "stun" | "dead";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  r: number;
  state: EnemyState;
  t: number;
  dx: number;
  dy: number;
  kbx: number;
  kby: number;
  flash: number;
  lastSwing: number;
  face: 1 | -1;
  travelled: number;
  deadT: number;
  moving: boolean;
}

export interface Projectile {
  kind: "arrow" | "dart";
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  alive: boolean;
}

export interface Player {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  kbx: number;
  kby: number;
  fx: number;
  fy: number;
  hp: number;
  hurtT: number;
  rollT: number;
  rollCd: number;
  rollDx: number;
  rollDy: number;
  atkCd: number;
  atkT: number;
  atkDx: number;
  atkDy: number;
  swingId: number;
  moving: boolean;
  walk: number;
  dodgeBuf: number;
}

export interface Spike {
  x: number;
  y: number;
  o: number;
  raised: boolean;
  warn: boolean;
}

export interface Launcher {
  x: number;
  y: number;
  d: Dir;
  o: number;
  warn: boolean;
}

export interface Lever {
  x: number;
  y: number;
  l: number;
  on: boolean;
}

export interface Gate {
  x: number;
  y: number;
  l: number;
  open: boolean;
  openT: number;
}

export interface Pickup {
  x: number;
  y: number;
  taken: boolean;
  takenAt: number;
}

const SOLID_WALL = 1;
const SOLID_LAUNCHER = 2;
const SOLID_GATE = 3;

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

export class World {
  status: Status = "ready";
  tick = 0;
  solid = new Uint8Array(GRID_W * GRID_H);
  player: Player;
  start: { x: number; y: number };
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  spikes: Spike[] = [];
  launchers: Launcher[] = [];
  levers: Lever[] = [];
  gates: Gate[] = [];
  tokens: Pickup[] = [];
  key: Pickup;
  exit: { x: number; y: number };
  events: GameEvent[] = [];
  damageTaken = 0;
  kills = 0;
  deathX = 0;
  deathY = 0;
  deathCause = "";
  private flow = new Int16Array(GRID_W * GRID_H);
  private flowFrom = -1;
  private lockedCooldown = 0;

  constructor(public layout: Layout) {
    let s = { x: 0, y: 0 },
      k = { x: 0, y: 0 },
      e = { x: 0, y: 0 };
    let id = 0;
    for (const o of layout.objects) {
      const i = o.y * GRID_W + o.x;
      const cx = o.x + 0.5,
        cy = o.y + 0.5;
      switch (o.k) {
        case "wall":
          this.solid[i] = SOLID_WALL;
          break;
        case "launcher":
          this.solid[i] = SOLID_LAUNCHER;
          this.launchers.push({ x: o.x, y: o.y, d: (o.d ?? 0) as Dir, o: o.o ?? 0, warn: false });
          break;
        case "gate":
          this.solid[i] = SOLID_GATE;
          this.gates.push({ x: o.x, y: o.y, l: o.l ?? 0, open: false, openT: 0 });
          break;
        case "lever":
          this.levers.push({ x: o.x, y: o.y, l: o.l ?? 0, on: false });
          break;
        case "spike":
          this.spikes.push({ x: o.x, y: o.y, o: o.o ?? 0, raised: false, warn: false });
          break;
        case "start":
          s = { x: cx, y: cy };
          break;
        case "key":
          k = { x: cx, y: cy };
          break;
        case "exit":
          e = { x: o.x, y: o.y };
          break;
        case "token":
          this.tokens.push({ x: cx, y: cy, taken: false, takenAt: 0 });
          break;
        case "slime":
        case "skeleton":
        case "charger": {
          const def = o.k === "slime" ? SLIME : o.k === "skeleton" ? SKELETON : CHARGER;
          this.enemies.push({
            id: id++,
            kind: o.k,
            x: cx,
            y: cy,
            px: cx,
            py: cy,
            hp: def.hp,
            r: def.r,
            state: "idle",
            t: 0,
            dx: 1,
            dy: 0,
            kbx: 0,
            kby: 0,
            flash: 0,
            lastSwing: -1,
            face: 1,
            travelled: 0,
            deadT: 0,
            moving: false,
          });
          break;
        }
      }
    }
    this.start = s;
    this.key = { ...k, taken: false, takenAt: 0 };
    this.exit = e;
    this.player = {
      x: s.x,
      y: s.y,
      px: s.x,
      py: s.y,
      vx: 0,
      vy: 0,
      kbx: 0,
      kby: 0,
      fx: 0,
      fy: 1,
      hp: PLAYER.hp,
      hurtT: 0,
      rollT: 0,
      rollCd: 0,
      rollDx: 0,
      rollDy: 0,
      atkCd: 0,
      atkT: -1,
      atkDx: 0,
      atkDy: 1,
      swingId: 0,
      moving: false,
      walk: 0,
      dodgeBuf: 0,
    };
  }

  get tokensTaken() {
    let n = 0;
    for (const t of this.tokens) if (t.taken) n++;
    return n;
  }

  get done() {
    return this.status === "won" || this.status === "dead" || this.status === "timeout";
  }

  begin() {
    if (this.status === "ready") this.status = "playing";
  }

  isSolid(cx: number, cy: number) {
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return true;
    return this.solid[cy * GRID_W + cx] !== 0;
  }

  spikePhase(s: { o: number }, tick = this.tick) {
    return (tick + s.o * SPIKE.offsetStep) % SPIKE.period;
  }

  launcherPhase(l: { o: number }, tick = this.tick) {
    return (tick + l.o * LAUNCHER.offsetStep) % LAUNCHER.period;
  }

  get playerProtected() {
    const p = this.player;
    return p.hurtT > 0 || (p.rollT > 0 && PLAYER.rollTime - p.rollT < PLAYER.rollProtect);
  }

  // ---------- main step ----------
  step(input: InputFrame) {
    this.events.length = 0;
    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    for (const e of this.enemies) {
      e.px = e.x;
      e.py = e.y;
    }
    for (const pr of this.projectiles) {
      pr.px = pr.x;
      pr.py = pr.y;
    }
    if (this.status !== "playing") return;

    this.tick++;
    this.updateTraps();
    this.updatePlayer(input);
    this.updateEnemies();
    this.updateProjectiles();
    this.updatePickups();
    for (const g of this.gates) if (g.open) g.openT++;

    if (this.status === "playing" && this.tick >= TIME_LIMIT) {
      this.status = "timeout";
      this.deathX = p.x;
      this.deathY = p.y;
      this.deathCause = "time";
      this.emit("timeout", p.x, p.y);
    }
  }

  private emit(t: EventType, x: number, y: number, s?: string, dx?: number, dy?: number) {
    this.events.push({ t, x, y, s, dx, dy });
  }

  // ---------- movement & collision ----------
  /** Axis-separated box move. Returns which axes were blocked. */
  private moveBox(o: { x: number; y: number }, half: number, dx: number, dy: number, nudge = false) {
    let bx = false,
      by = false;
    if (dx !== 0) {
      const nx = o.x + dx;
      const edge = dx > 0 ? nx + half : nx - half;
      const col = Math.floor(edge);
      const r0 = Math.floor(o.y - half),
        r1 = Math.floor(o.y + half - 1e-6);
      const s0 = this.isSolid(col, r0),
        s1 = this.isSolid(col, r1);
      if (s0 || s1) {
        bx = true;
        o.x = dx > 0 ? col - half - 1e-4 : col + 1 + half + 1e-4;
        if (nudge && r0 !== r1 && s0 !== s1 && dy === 0) {
          // slide around a corner the player only clipped slightly
          const overlap = s0 ? r1 - (o.y - half) : o.y + half - r1;
          if (overlap < 0.24) o.y += s0 ? Math.min(Math.abs(dx), overlap + 1e-3) : -Math.min(Math.abs(dx), overlap + 1e-3);
        }
      } else o.x = nx;
    }
    if (dy !== 0) {
      const ny = o.y + dy;
      const edge = dy > 0 ? ny + half : ny - half;
      const row = Math.floor(edge);
      const c0 = Math.floor(o.x - half),
        c1 = Math.floor(o.x + half - 1e-6);
      const s0 = this.isSolid(c0, row),
        s1 = this.isSolid(c1, row);
      if (s0 || s1) {
        by = true;
        o.y = dy > 0 ? row - half - 1e-4 : row + 1 + half + 1e-4;
        if (nudge && c0 !== c1 && s0 !== s1 && dx === 0) {
          const overlap = s0 ? c1 - (o.x - half) : o.x + half - c1;
          if (overlap < 0.24) o.x += s0 ? Math.min(Math.abs(dy), overlap + 1e-3) : -Math.min(Math.abs(dy), overlap + 1e-3);
        }
      } else o.y = ny;
    }
    return { bx, by };
  }

  lineOfSight(x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0,
      dy = y1 - y0;
    const d = len(dx, dy);
    const n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.isSolid(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
    }
    return true;
  }

  // ---------- player ----------
  private updatePlayer(input: InputFrame) {
    const p = this.player;
    if (p.hurtT > 0) p.hurtT--;
    if (p.rollCd > 0) p.rollCd--;
    if (p.atkCd > 0) p.atkCd--;
    if (p.dodgeBuf > 0) p.dodgeBuf--;
    if (input.dodge) p.dodgeBuf = 6;

    let mx: number = input.mx,
      my: number = input.my;
    if (mx !== 0 && my !== 0) {
      const inv = 1 / Math.SQRT2;
      mx *= inv;
      my *= inv;
    }
    const moving = mx !== 0 || my !== 0;
    if (moving) {
      const l = len(mx, my);
      p.fx = mx / l;
      p.fy = my / l;
    }
    const hasAim = input.aim !== AIM_NONE;
    const ax = hasAim ? AIM_TABLE[input.aim][0] : p.fx;
    const ay = hasAim ? AIM_TABLE[input.aim][1] : p.fy;

    // start roll
    if (p.dodgeBuf > 0 && p.rollCd === 0 && p.rollT === 0) {
      p.dodgeBuf = 0;
      p.rollT = PLAYER.rollTime;
      p.rollCd = PLAYER.rollCooldown;
      if (moving) {
        p.rollDx = mx;
        p.rollDy = my;
      } else {
        const l = len(ax, ay) || 1;
        p.rollDx = ax / l;
        p.rollDy = ay / l;
      }
      p.atkT = -1;
      this.emit("roll", p.x, p.y, undefined, p.rollDx, p.rollDy);
    }

    // start attack
    if (input.attack && p.atkCd === 0 && p.rollT === 0) {
      const l = len(ax, ay) || 1;
      p.atkDx = ax / l;
      p.atkDy = ay / l;
      p.atkT = 0;
      p.atkCd = PLAYER.attackCooldown;
      p.swingId++;
      this.emit("swing", p.x, p.y, undefined, p.atkDx, p.atkDy);
    }

    let vx: number, vy: number;
    if (p.rollT > 0) {
      vx = p.rollDx * PLAYER.rollSpeed;
      vy = p.rollDy * PLAYER.rollSpeed;
      p.rollT--;
    } else {
      const tx = mx * PLAYER.speed,
        ty = my * PLAYER.speed;
      const k = moving ? 0.4 : 0.5;
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      if (Math.abs(p.vx) < 0.01) p.vx = 0;
      if (Math.abs(p.vy) < 0.01) p.vy = 0;
      vx = p.vx;
      vy = p.vy;
    }
    vx += p.kbx;
    vy += p.kby;
    p.kbx *= 0.8;
    p.kby *= 0.8;
    if (Math.abs(p.kbx) < 0.05) p.kbx = 0;
    if (Math.abs(p.kby) < 0.05) p.kby = 0;
    this.moveBox(p, PLAYER.half, vx * DT, vy * DT, true);
    p.moving = moving && p.rollT === 0;
    if (p.moving) {
      const before = p.walk;
      p.walk += len(vx, vy) * DT * 1.6;
      if (Math.floor(before) !== Math.floor(p.walk)) this.emit("step", p.x, p.y);
    }

    // attack hits
    if (p.atkT >= 0) {
      if (p.atkT >= PLAYER.attackActiveFrom && p.atkT <= PLAYER.attackActiveTo) this.resolveSwing();
      p.atkT++;
      if (p.atkT > 14) p.atkT = -1;
    }

    // spikes
    if (!this.playerProtected) {
      const h = 0.2;
      for (const s of this.spikes) {
        if (!s.raised) continue;
        if (p.x + h > s.x + 0.12 && p.x - h < s.x + 0.88 && p.y + h > s.y + 0.12 && p.y - h < s.y + 0.88) {
          this.damagePlayer(s.x + 0.5, s.y + 0.5, "spikes");
          break;
        }
      }
    }
  }

  private resolveSwing() {
    const p = this.player;
    const range = PLAYER.attackRange;
    for (const e of this.enemies) {
      if (e.state === "dead" || e.lastSwing === p.swingId) continue;
      const vx = e.x - p.x,
        vy = e.y - p.y;
      const d = len(vx, vy);
      if (d - e.r > range) continue;
      if (d > 0.45 && (vx * p.atkDx + vy * p.atkDy) / d < PLAYER.attackCos) continue;
      e.lastSwing = p.swingId;
      this.hitEnemy(e, p.atkDx, p.atkDy);
    }
    for (const l of this.levers) {
      if (l.on) continue;
      const vx = l.x + 0.5 - p.x,
        vy = l.y + 0.5 - p.y;
      const d = len(vx, vy);
      if (d > range + 0.25) continue;
      if (d > 0.6 && (vx * p.atkDx + vy * p.atkDy) / d < PLAYER.attackCos) continue;
      l.on = true;
      this.emit("lever", l.x + 0.5, l.y + 0.5);
      for (const g of this.gates) {
        if (g.l !== l.l || g.open) continue;
        g.open = true;
        this.solid[g.y * GRID_W + g.x] = 0;
        this.flowFrom = -1;
        this.emit("gate", g.x + 0.5, g.y + 0.5);
      }
    }
  }

  private hitEnemy(e: Enemy, dx: number, dy: number) {
    e.hp--;
    e.flash = 8;
    this.emit("hit", e.x, e.y, e.kind, dx, dy);
    if (e.hp <= 0) {
      e.state = "dead";
      e.deadT = 0;
      this.kills++;
      this.emit("kill", e.x, e.y, e.kind, dx, dy);
      return;
    }
    const heavy = e.kind === "charger" && (e.state === "tele" || e.state === "charge");
    if (!heavy) {
      const kb = e.kind === "charger" ? 4 : 7;
      e.kbx = dx * kb;
      e.kby = dy * kb;
      if (e.kind === "skeleton") {
        // interrupting the aim sends the skeleton into its recovery window
        e.state = "recover";
        e.t = SKELETON.recover - sec06;
      } else if (e.kind === "slime") {
        e.state = "stun";
        e.t = 0;
      }
    }
  }

  private damagePlayer(sx: number, sy: number, cause: string) {
    const p = this.player;
    if (this.playerProtected || this.status !== "playing") return;
    p.hp--;
    this.damageTaken++;
    p.hurtT = PLAYER.hurtProtect;
    const dx = p.x - sx,
      dy = p.y - sy;
    const d = len(dx, dy) || 1;
    p.kbx = (dx / d) * 7;
    p.kby = (dy / d) * 7;
    p.atkT = -1;
    this.emit("hurt", p.x, p.y, cause, dx / d, dy / d);
    if (p.hp <= 0) {
      this.status = "dead";
      this.deathX = p.x;
      this.deathY = p.y;
      this.deathCause = cause;
      this.emit("die", p.x, p.y, cause);
    }
  }

  // ---------- traps ----------
  private updateTraps() {
    for (const s of this.spikes) {
      const ph = this.spikePhase(s);
      const raised = ph >= SPIKE.safe + SPIKE.warn;
      s.warn = ph >= SPIKE.safe && !raised;
      if (raised && !s.raised) this.emit("spike", s.x + 0.5, s.y + 0.5);
      s.raised = raised;
    }
    for (const l of this.launchers) {
      const ph = this.launcherPhase(l);
      l.warn = ph >= LAUNCHER.period - LAUNCHER.warn;
      if (ph === LAUNCHER.period - 1) {
        const [dx, dy] = DIRS[l.d];
        const x = l.x + 0.5 + dx * 0.55,
          y = l.y + 0.5 + dy * 0.55;
        this.projectiles.push({
          kind: "dart",
          x,
          y,
          px: x,
          py: y,
          vx: dx * LAUNCHER.dartSpeed,
          vy: dy * LAUNCHER.dartSpeed,
          alive: true,
        });
        this.emit("dart", x, y, undefined, dx, dy);
      }
    }
  }

  // ---------- enemies ----------
  private computeFlow() {
    const p = this.player;
    const from = Math.floor(p.y) * GRID_W + Math.floor(p.x);
    if (from === this.flowFrom) return;
    this.flowFrom = from;
    const f = this.flow;
    f.fill(-1);
    if (from < 0 || from >= f.length) return;
    const q = [from];
    f[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const x = c % GRID_W,
        y = (c / GRID_W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (this.isSolid(nx, ny)) continue;
          if (dx && dy && (this.isSolid(x + dx, y) || this.isSolid(x, y + dy))) continue;
          const n = ny * GRID_W + nx;
          if (f[n] !== -1) continue;
          f[n] = f[c] + 1;
          q.push(n);
        }
    }
  }

  private updateEnemies() {
    const p = this.player;
    let needFlow = false;
    for (const e of this.enemies) if (e.kind === "slime" && e.state === "chase") needFlow = true;
    if (needFlow) this.computeFlow();

    for (const e of this.enemies) {
      if (e.state === "dead") {
        e.deadT++;
        continue;
      }
      if (e.flash > 0) e.flash--;
      e.t++;
      e.moving = false;
      const vx = p.x - e.x,
        vy = p.y - e.y;
      const dist = len(vx, vy);
      if (Math.abs(vx) > 0.05) e.face = vx > 0 ? 1 : -1;

      if (e.kind === "slime") this.updateSlime(e, dist);
      else if (e.kind === "skeleton") this.updateSkeleton(e, vx, vy, dist);
      else this.updateCharger(e, vx, vy, dist);

      // knockback
      if (e.kbx || e.kby) {
        this.moveBox(e, e.r * 0.8, e.kbx * DT, e.kby * DT);
        e.kbx *= 0.78;
        e.kby *= 0.78;
        if (Math.abs(e.kbx) < 0.05) e.kbx = 0;
        if (Math.abs(e.kby) < 0.05) e.kby = 0;
      }

      // contact damage
      if (len(p.x - e.x, p.y - e.y) < e.r + 0.24) this.damagePlayer(e.x, e.y, e.kind);
    }

    // gentle separation so enemies don't stack into one blob
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.state === "dead" || a.state === "charge") continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.state === "dead" || b.state === "charge") continue;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d = len(dx, dy);
        const min = (a.r + b.r) * 0.9;
        if (d >= min || d === 0) continue;
        const push = (min - d) * 0.25;
        const nx = dx / d,
          ny = dy / d;
        if (a.kind !== "skeleton") this.moveBox(a, a.r * 0.8, -nx * push, -ny * push);
        if (b.kind !== "skeleton") this.moveBox(b, b.r * 0.8, nx * push, ny * push);
      }
    }
  }

  private updateSlime(e: Enemy, dist: number) {
    const p = this.player;
    if (e.state === "stun") {
      if (e.t > 16) {
        e.state = "chase";
        e.t = 0;
      }
      return;
    }
    if (e.state === "idle") {
      if (dist <= SLIME.detect) {
        e.state = "chase";
        e.t = 0;
        this.computeFlow();
      }
      return;
    }
    if (dist > SLIME.forget) {
      e.state = "idle";
      e.t = 0;
      return;
    }
    let tx = p.x,
      ty = p.y;
    const cx = Math.floor(e.x),
      cy = Math.floor(e.y);
    const here = this.flow[cy * GRID_W + cx];
    if (here > 1) {
      let best = here;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx,
            ny = cy + dy;
          if (this.isSolid(nx, ny)) continue;
          if (dx && dy && (this.isSolid(cx + dx, cy) || this.isSolid(cx, cy + dy))) continue;
          const v = this.flow[ny * GRID_W + nx];
          if (v >= 0 && v < best) {
            best = v;
            tx = nx + 0.5;
            ty = ny + 0.5;
          }
        }
    }
    const mx = tx - e.x,
      my = ty - e.y;
    const d = len(mx, my);
    if (d > 0.01) {
      // slimes move in little hops: fast then slow, giving them character
      const hop = 0.55 + 0.45 * hopCurve(e.t % 40);
      const sp = (SLIME.speed * hop * DT) / d;
      this.moveBox(e, e.r * 0.8, mx * sp, my * sp);
      e.dx = mx / d;
      e.dy = my / d;
      e.moving = true;
    }
  }

  private updateSkeleton(e: Enemy, vx: number, vy: number, dist: number) {
    const p = this.player;
    switch (e.state) {
      case "idle":
        if (dist <= SKELETON.detect && this.lineOfSight(e.x, e.y, p.x, p.y)) {
          e.state = "aim";
          e.t = 0;
          e.dx = vx / dist;
          e.dy = vy / dist;
          this.emit("aim", e.x, e.y);
        }
        break;
      case "aim":
        if (e.t < SKELETON.lockAt && dist > 0.01) {
          e.dx = vx / dist;
          e.dy = vy / dist;
        }
        if (e.t >= SKELETON.aim) {
          const x = e.x + e.dx * 0.45,
            y = e.y + e.dy * 0.45;
          this.projectiles.push({
            kind: "arrow",
            x,
            y,
            px: x,
            py: y,
            vx: e.dx * SKELETON.arrowSpeed,
            vy: e.dy * SKELETON.arrowSpeed,
            alive: true,
          });
          this.emit("arrow", x, y, undefined, e.dx, e.dy);
          e.state = "recover";
          e.t = 0;
        }
        break;
      case "recover":
        if (e.t >= SKELETON.recover) {
          e.state = "idle";
          e.t = 0;
        }
        break;
    }
  }

  private updateCharger(e: Enemy, vx: number, vy: number, dist: number) {
    const p = this.player;
    switch (e.state) {
      case "idle":
        if (dist <= CHARGER.detect && dist > 0.01 && this.lineOfSight(e.x, e.y, p.x, p.y)) {
          e.state = "tele";
          e.t = 0;
          e.dx = vx / dist;
          e.dy = vy / dist;
          e.face = e.dx >= 0 ? 1 : -1;
          this.emit("telegraph", e.x, e.y, undefined, e.dx, e.dy);
        }
        break;
      case "tele":
        e.face = e.dx >= 0 ? 1 : -1;
        if (e.t >= CHARGER.telegraph) {
          e.state = "charge";
          e.t = 0;
          e.travelled = 0;
          this.emit("charge", e.x, e.y, undefined, e.dx, e.dy);
        }
        break;
      case "charge": {
        e.face = e.dx >= 0 ? 1 : -1;
        const step = CHARGER.speed * DT;
        const ox = e.x,
          oy = e.y;
        const b = this.moveBox(e, e.r * 0.8, e.dx * step, e.dy * step);
        e.travelled += len(e.x - ox, e.y - oy);
        e.moving = true;
        const hitWall = (b.bx && Math.abs(e.dx) > 0.3) || (b.by && Math.abs(e.dy) > 0.3);
        if (hitWall || e.travelled >= CHARGER.maxDist) {
          e.state = "recover";
          e.t = 0;
          if (hitWall) this.emit("slam", e.x + e.dx * e.r, e.y + e.dy * e.r);
        }
        break;
      }
      case "recover":
        if (e.t >= CHARGER.recover) {
          e.state = "idle";
          e.t = 0;
        }
        break;
    }
  }

  // ---------- projectiles ----------
  private updateProjectiles() {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.x += pr.vx * DT;
      pr.y += pr.vy * DT;
      if (this.isSolid(Math.floor(pr.x), Math.floor(pr.y))) {
        pr.alive = false;
        this.emit("projHit", pr.x - pr.vx * DT * 0.5, pr.y - pr.vy * DT * 0.5, pr.kind);
        continue;
      }
      if (len(pr.x - p.x, pr.y - p.y) < 0.32 && !this.playerProtected) {
        pr.alive = false;
        this.damagePlayer(pr.x - pr.vx, pr.y - pr.vy, pr.kind);
      }
    }
    if (this.projectiles.length > 24) this.projectiles = this.projectiles.filter((q) => q.alive);
  }

  // ---------- pickups & exit ----------
  private updatePickups() {
    if (this.status !== "playing") return;
    const p = this.player;
    const r = PLAYER.pickupRadius;
    for (const t of this.tokens) {
      if (!t.taken && len(t.x - p.x, t.y - p.y) < r) {
        t.taken = true;
        t.takenAt = this.tick;
        this.emit("token", t.x, t.y, String(this.tokensTaken));
      }
    }
    if (!this.key.taken && len(this.key.x - p.x, this.key.y - p.y) < r) {
      this.key.taken = true;
      this.key.takenAt = this.tick;
      this.emit("key", this.key.x, this.key.y);
    }
    if (this.lockedCooldown > 0) this.lockedCooldown--;
    const ex = this.exit.x + 0.5,
      ey = this.exit.y + 0.5;
    if (Math.abs(p.x - ex) < 0.5 && Math.abs(p.y - ey) < 0.5) {
      if (this.key.taken) {
        this.status = "won";
        this.emit("win", ex, ey);
      } else if (this.lockedCooldown === 0) {
        this.lockedCooldown = 90;
        this.emit("locked", ex, ey);
      }
    }
  }

  get timeMs() {
    return Math.round((this.tick * 1000) / 60);
  }

  get allTokens() {
    return this.tokensTaken === TOKENS_REQUIRED;
  }
}

const sec06 = Math.round(0.6 * 60);

function hopCurve(t: number) {
  // 0..39 → burst at the start of each hop
  return t < 16 ? 1 : t < 28 ? 0.5 : 0.15;
}

/** Run a full replay headlessly; returns the finished world. */
export function simulate(layout: Layout, frames: ArrayLike<number>, unpack: (v: number) => InputFrame) {
  const w = new World(layout);
  w.begin();
  for (let i = 0; i < frames.length && !w.done; i++) w.step(unpack(frames[i]));
  return w;
}
