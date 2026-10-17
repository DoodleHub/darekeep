import { ATLAS, ATLAS_URL, type SpriteName } from "./atlas";
import { CHARGER, GRID_H, GRID_W, LAUNCHER, PLAYER, SKELETON, SPIKE } from "./constants";
import type { GameEvent, World } from "./sim";
import { DIRS, type Placed } from "./types";

// ---------- atlas loading ----------
let atlasPromise: Promise<HTMLImageElement> | null = null;
export function loadAtlas() {
  if (!atlasPromise)
    atlasPromise = new Promise((res, rej) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = ATLAS_URL;
    });
  return atlasPromise;
}

const BASE_SHEET = new Set<string>([
  "player_down_sword", "player_up_sword", "player_side_sword", "player_side_attack", "player_slash", "player_dash",
  "slime_big", "slime_flat", "skel_front", "skel_aim", "charger_front", "charger_dash",
  "key", "token", "heart", "heart_empty", "sword", "arrow", "fx_spark", "fx_dust", "chest", "chest_open",
]);
const PPT_BASE = 140;
const PPT_SUP = 112;

export const THEMES = [
  { name: "Slate", tint: null, ambient: "rgba(20,24,48,0.0)", fog: [12, 14, 28] },
  { name: "Mossy", tint: "rgba(60,140,80,0.22)", ambient: "rgba(10,40,20,0.0)", fog: [8, 22, 14] },
  { name: "Ember", tint: "rgba(190,110,40,0.22)", ambient: "rgba(40,20,0,0.0)", fog: [26, 14, 6] },
  { name: "Crimson", tint: "rgba(170,40,60,0.24)", ambient: "rgba(40,0,10,0.0)", fog: [26, 6, 12] },
] as const;

export const LINK_COLORS = ["#4fd1ff", "#ff7ad9", "#ffd84f"];

export interface SwordStyle {
  core: string;
  glow: string;
}
export const SWORD_STYLES: SwordStyle[] = [
  { core: "#ffffff", glow: "rgba(150,210,255,0.9)" },
  { core: "#fff4c2", glow: "rgba(255,190,60,0.95)" },
  { core: "#e8fff1", glow: "rgba(60,240,150,0.9)" },
  { core: "#ffe1f4", glow: "rgba(255,80,180,0.9)" },
  { core: "#f1e6ff", glow: "rgba(150,90,255,0.95)" },
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  shape: 0 | 1;
}

interface FxSprite {
  name: SpriteName;
  x: number;
  y: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  flip: boolean;
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export interface EditorOverlay {
  hover?: { x: number; y: number; ok: boolean } | null;
  bad?: Array<[number, number]>;
  safe?: { x: number; y: number } | null;
  launcherPaths?: Array<Array<[number, number]>>;
  links?: Array<{ from: [number, number]; to: [number, number]; l: number }>;
  showGrid?: boolean;
  selectedLink?: number;
}

export interface RenderOptions {
  ghost?: World | null;
  overlay?: EditorOverlay | null;
  deaths?: Array<[number, number]>;
  follow?: boolean;
  time: number;
  reducedMotion?: boolean;
}

const BORDER = 1;
const VIEW_W = GRID_W + BORDER * 2;
const VIEW_H = GRID_H + BORDER * 2;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private white: HTMLCanvasElement | null = null;
  private outfit: HTMLCanvasElement | null = null;
  private outfitHue = 0;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticKey = "";
  private vignette: HTMLCanvasElement | null = null;
  private dpr = 1;
  cssW = 0;
  cssH = 0;
  /** device px per tile */
  T = 32;
  /** board origin in device px (top-left of the border) */
  ox = 0;
  oy = 0;
  private camX = VIEW_W / 2;
  private camY = VIEW_H / 2;
  private zoomed = false;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private hurtFlash = 0;
  private particles: Particle[] = [];
  private fx: FxSprite[] = [];
  private texts: FloatText[] = [];
  sword: SwordStyle = SWORD_STYLES[0];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    loadAtlas().then((img) => {
      this.img = img;
      this.white = this.makeWhite(img);
      this.staticKey = "";
      if (this.outfitHue) this.setOutfit(this.outfitHue);
    });
  }

  get ready() {
    return !!this.img;
  }

  setOutfit(hue: number) {
    this.outfitHue = hue;
    if (!this.img) return;
    if (!hue) {
      this.outfit = null;
      return;
    }
    const c = document.createElement("canvas");
    c.width = this.img.width;
    c.height = this.img.height;
    const g = c.getContext("2d")!;
    if ("filter" in g) {
      g.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
      g.drawImage(this.img, 0, 0);
      this.outfit = c;
    }
  }

  private makeWhite(img: HTMLImageElement) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = Math.min(dpr, 2.5);
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.staticKey = "";
    this.vignette = null;
  }

  private layout(follow: boolean, world: World | null, alpha: number) {
    const W = this.canvas.width,
      H = this.canvas.height;
    const fit = Math.min(W / VIEW_W, H / VIEW_H);
    const minTile = 30 * this.dpr;
    this.zoomed = follow && fit < minTile;
    const T = Math.floor(this.zoomed ? minTile : fit);
    if (T !== this.T) this.staticKey = "";
    this.T = T;
    if (!this.zoomed) {
      this.ox = Math.round((W - T * VIEW_W) / 2);
      this.oy = Math.round((H - T * VIEW_H) / 2);
      this.camX = VIEW_W / 2;
      this.camY = VIEW_H / 2;
      return;
    }
    const p = world!.player;
    const tx = p.px + (p.x - p.px) * alpha + BORDER;
    const ty = p.py + (p.y - p.py) * alpha + BORDER;
    this.camX += (tx - this.camX) * 0.12;
    this.camY += (ty - this.camY) * 0.12;
    const halfW = W / T / 2,
      halfH = H / T / 2;
    const cx = halfW * 2 >= VIEW_W ? VIEW_W / 2 : Math.min(Math.max(this.camX, halfW), VIEW_W - halfW);
    const cy = halfH * 2 >= VIEW_H ? VIEW_H / 2 : Math.min(Math.max(this.camY, halfH), VIEW_H - halfH);
    this.ox = Math.round(W / 2 - cx * T);
    this.oy = Math.round(H / 2 - cy * T);
  }

  snapCamera(world: World) {
    this.camX = world.player.x + BORDER;
    this.camY = world.player.y + BORDER;
  }

  /** Convert CSS pixel coords (relative to canvas) to a grid cell. */
  cellAt(cssX: number, cssY: number) {
    const x = (cssX * this.dpr - this.ox) / this.T - BORDER;
    const y = (cssY * this.dpr - this.oy) / this.T - BORDER;
    return { x: Math.floor(x), y: Math.floor(y), fx: x, fy: y };
  }

  /** World position → CSS px (for aiming with mouse). */
  toCss(wx: number, wy: number) {
    return { x: (this.ox + (wx + BORDER) * this.T) / this.dpr, y: (this.oy + (wy + BORDER) * this.T) / this.dpr };
  }

  // ---------- sprite helpers ----------
  private spr(
    name: SpriteName,
    wx: number,
    wy: number,
    o: { anchor?: "feet" | "center"; scale?: number; flip?: boolean; rot?: number; alpha?: number; white?: number; sx?: number; sy?: number; src?: CanvasImageSource | null; h?: number } = {},
  ) {
    const img = o.src ?? this.img;
    if (!img) return;
    const [x, y, w, h, , sh] = ATLAS[name];
    const ppt = BASE_SHEET.has(name) ? PPT_BASE : PPT_SUP;
    const T = this.T;
    const s = o.scale ?? 1;
    const dh = o.h ? o.h * T * s : (sh / ppt) * T * s;
    const dw = (dh * w) / h;
    const g = this.ctx;
    const px = this.ox + (wx + BORDER) * T;
    const py = this.oy + (wy + BORDER) * T;
    g.save();
    g.translate(px, py);
    if (o.rot) g.rotate(o.rot);
    g.scale((o.flip ? -1 : 1) * (o.sx ?? 1), o.sy ?? 1);
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    const ax = -dw / 2;
    const ay = o.anchor === "center" ? -dh / 2 : -dh;
    g.drawImage(img, x, y, w, h, ax, ay, dw, dh);
    if (o.white && this.white) {
      g.globalAlpha = (o.alpha ?? 1) * o.white;
      g.drawImage(this.white, x, y, w, h, ax, ay, dw, dh);
    }
    g.restore();
  }

  /** Draw a sprite stretched to exactly fill grid cell(s) in device space (used for tiles). */
  private tile(g: CanvasRenderingContext2D, name: SpriteName, cx: number, cy: number, ox: number, oy: number, T: number, pad = 0) {
    if (!this.img) return;
    const [x, y, w, h] = ATLAS[name];
    g.drawImage(this.img, x, y, w, h, ox + cx * T - pad, oy + cy * T - pad, T + pad * 2, T + pad * 2);
  }

  // ---------- static layer (floor + walls) ----------
  private buildStatic(world: World) {
    const T = this.T;
    const key = `${T}|${world.layout.theme}|${world.layout.objects.length}|${hashObjects(world.layout.objects)}`;
    if (key === this.staticKey && this.staticLayer) return;
    this.staticKey = key;
    const c = this.staticLayer ?? document.createElement("canvas");
    c.width = VIEW_W * T;
    c.height = VIEW_H * T;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const theme = THEMES[world.layout.theme % THEMES.length];
    g.fillStyle = `rgb(${theme.fog.join(",")})`;
    g.fillRect(0, 0, c.width, c.height);
    const moss = new Set(world.layout.objects.filter((o) => o.k === "moss").map((o) => o.y * GRID_W + o.x));
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        const h = hash2(x, y);
        this.tile(g, moss.has(y * GRID_W + x) || h % 11 === 0 ? "floor_moss" : "floor", x + BORDER, y + BORDER, 0, 0, T, 0.5);
        // subtle per-tile light variation
        g.fillStyle = `rgba(0,0,0,${(h % 7) * 0.018})`;
        g.fillRect((x + BORDER) * T, (y + BORDER) * T, T, T);
      }
    // floor sits in shadow so raised walls read clearly
    g.fillStyle = "rgba(6,4,16,0.34)";
    g.fillRect(BORDER * T, BORDER * T, GRID_W * T, GRID_H * T);

    const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= GRID_W || y >= GRID_H || world.solid[y * GRID_W + x] === 1;
    // contact shadows below walls
    g.fillStyle = "rgba(0,0,0,0.45)";
    for (let y = -1; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++)
        if (isWall(x, y) && !isWall(x, y + 1)) g.fillRect((x + BORDER) * T, (y + 1 + BORDER) * T, T, T * 0.28);

    // walls as raised 3/4 blocks: front face + lit top
    const lift = Math.round(T * 0.26);
    for (let y = -1; y <= GRID_H; y++)
      for (let x = -1; x <= GRID_W; x++) {
        if (!isWall(x, y)) continue;
        const px = (x + BORDER) * T,
          py = (y + BORDER) * T;
        const name = hash2(x + 3, y + 7) % 5 === 0 ? "wall_crack" : "wall";
        if (!isWall(x, y + 1)) {
          // visible front face
          this.tile(g, name, x + BORDER, y + BORDER, 0, lift * 0, T, 0);
          g.fillStyle = "rgba(10,8,24,0.55)";
          g.fillRect(px, py + T - lift, T, lift);
          g.fillStyle = "rgba(0,0,0,0.25)";
          g.fillRect(px, py + T - 2, T, 2);
        }
        // top face, drawn lifted
        if (this.img) {
          const [sx, sy, sw, sh] = ATLAS[name];
          g.drawImage(this.img, sx, sy, sw, sh, px - 0.5, py - lift - 0.5, T + 1, T + 1);
        }
        g.fillStyle = "rgba(190,200,255,0.10)";
        g.fillRect(px, py - lift, T, Math.max(1, T * 0.05));
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) {
          g.fillStyle = "rgba(0,0,0,0.3)";
          g.fillRect(px, py - lift, T, T);
        }
      }
    if (theme.tint) {
      g.globalCompositeOperation = "soft-light";
      g.fillStyle = theme.tint;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-over";
    }
    this.staticLayer = c;
  }

  private buildVignette() {
    const W = this.canvas.width,
      H = this.canvas.height;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const r = Math.max(W, H) * 0.75;
    const grad = g.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    this.vignette = c;
  }

  // ---------- events → juice ----------
  handleEvents(events: GameEvent[], reduced = false) {
    for (const e of events) {
      switch (e.t) {
        case "hit":
          this.burst(e.x, e.y, 8, e.s === "slime" ? "#7dff8a" : e.s === "charger" ? "#ff6a5a" : "#f4ecd8", 3.5, e.dx, e.dy);
          this.addFx("fx_spark", e.x, e.y - 0.3, 10, 0.7);
          this.kick(reduced ? 0 : 0.12);
          break;
        case "kill":
          this.burst(e.x, e.y, 22, e.s === "slime" ? "#5bff79" : e.s === "charger" ? "#ff4a3a" : "#efe6cf", 5, e.dx, e.dy);
          this.addFx(e.s === "charger" ? "fx_boom" : "fx_dust", e.x, e.y - 0.2, 22, e.s === "charger" ? 1.2 : 0.9);
          this.kick(reduced ? 0 : 0.25);
          break;
        case "hurt":
          this.burst(e.x, e.y - 0.3, 14, "#ff4060", 4);
          this.kick(reduced ? 0 : 0.35);
          this.hurtFlash = 1;
          break;
        case "die":
          this.burst(e.x, e.y - 0.3, 30, "#ff3050", 6);
          this.kick(reduced ? 0 : 0.6);
          this.hurtFlash = 1.4;
          break;
        case "roll":
          this.addFx("fx_dust", e.x - (e.dx ?? 0) * 0.3, e.y + 0.1, 18, 0.55, (e.dx ?? 0) > 0);
          break;
        case "token":
          this.burst(e.x, e.y, 16, "#ffd34a", 3.5);
          this.text(`${e.s}/3`, e.x, e.y - 0.6, "#ffd34a");
          break;
        case "key":
          this.burst(e.x, e.y, 26, "#ffe27a", 4.5);
          this.text("KEY", e.x, e.y - 0.6, "#ffe27a");
          break;
        case "locked":
          this.text("Need the key", e.x, e.y - 0.8, "#ff9b9b");
          break;
        case "win":
          this.burst(e.x, e.y, 40, "#6dffb0", 6);
          break;
        case "projHit":
          this.burst(e.x, e.y, 5, "#d8d0c0", 2);
          break;
        case "spike":
          break;
        case "lever":
          this.burst(e.x, e.y, 10, "#ffd27a", 3);
          break;
        case "gate":
          this.burst(e.x, e.y, 16, "#a8b4d8", 3);
          this.kick(reduced ? 0 : 0.15);
          break;
        case "slam":
          this.burst(e.x, e.y, 16, "#c8b8a0", 4);
          this.addFx("fx_dust", e.x, e.y, 20, 1);
          this.kick(reduced ? 0 : 0.4);
          break;
        case "charge":
          this.addFx("fx_dust", e.x, e.y + 0.2, 16, 0.7, (e.dx ?? 0) < 0);
          break;
      }
    }
  }

  private kick(n: number) {
    this.shake = Math.max(this.shake, n);
  }

  private burst(x: number, y: number, n: number, color: string, speed: number, dx = 0, dy = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const life = 18 + Math.random() * 22;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s + dx * speed * 0.6,
        vy: Math.sin(a) * s + dy * speed * 0.6 - 1,
        life,
        max: life,
        size: 0.05 + Math.random() * 0.07,
        color,
        grav: 6,
        shape: Math.random() < 0.5 ? 0 : 1,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  private addFx(name: SpriteName, x: number, y: number, life: number, size: number, flip = false) {
    this.fx.push({ name, x, y, life, max: life, size, rot: 0, flip });
  }

  private text(text: string, x: number, y: number, color: string) {
    this.texts.push({ text, x, y, life: 60, color });
  }

  clearFx() {
    this.particles.length = 0;
    this.fx.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.hurtFlash = 0;
  }

  // ---------- frame ----------
  render(world: World, alpha: number, opts: RenderOptions) {
    const g = this.ctx;
    const W = this.canvas.width,
      H = this.canvas.height;
    if (!this.cssW || !this.cssH || W < 2 || H < 2) return; // not laid out yet
    this.layout(!!opts.follow, world, alpha);
    if (this.T < 1) return;
    this.buildStatic(world);
    if (!this.vignette) this.buildVignette();
    const T = this.T;
    const t = opts.time;

    // shake
    this.shake *= 0.86;
    if (this.shake < 0.01) this.shake = 0;
    this.shakeX = (Math.random() - 0.5) * this.shake * T * 0.5;
    this.shakeY = (Math.random() - 0.5) * this.shake * T * 0.5;
    const ox0 = this.ox,
      oy0 = this.oy;
    this.ox += Math.round(this.shakeX);
    this.oy += Math.round(this.shakeY);

    const theme = THEMES[world.layout.theme % THEMES.length];
    g.fillStyle = `rgb(${theme.fog.map((v) => Math.max(0, v - 6)).join(",")})`;
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    if (this.staticLayer) g.drawImage(this.staticLayer, this.ox, this.oy);
    if (!this.img) {
      this.ox = ox0;
      this.oy = oy0;
      return;
    }

    // ---- floor-level objects ----
    const start = world.start;
    g.save();
    const sp = this.toDev(start.x, start.y);
    const sgrad = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, T * 0.6);
    sgrad.addColorStop(0, "rgba(120,200,255,0.28)");
    sgrad.addColorStop(1, "rgba(120,200,255,0)");
    g.fillStyle = sgrad;
    g.fillRect(sp.x - T, sp.y - T, T * 2, T * 2);
    g.strokeStyle = "rgba(140,210,255,0.45)";
    g.lineWidth = Math.max(1, T * 0.04);
    g.setLineDash([T * 0.12, T * 0.1]);
    g.lineDashOffset = -t * 0.02;
    g.beginPath();
    g.arc(sp.x, sp.y, T * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    for (const s of world.spikes) {
      const ph = world.spikePhase(s);
      let name: SpriteName = "spike_off";
      if (s.raised) name = "spike_on";
      else if (s.warn) name = Math.floor(ph / 4) % 2 ? "spike_warn" : "spike_off";
      const ts = this.toDev(s.x, s.y);
      g.drawImage(this.img, ...src(name), ts.x, ts.y, T, T);
      if (s.warn) {
        g.fillStyle = `rgba(255,200,40,${0.12 + 0.12 * Math.sin(t * 0.03)})`;
        g.fillRect(ts.x, ts.y, T, T);
      }
      if (s.raised && ph - SPIKE.safe - SPIKE.warn < 5) {
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.fillRect(ts.x, ts.y, T, T);
      }
    }

    // lever links glow under gates/levers
    for (const l of world.levers) {
      const c = this.toDev(l.x + 0.5, l.y + 0.7);
      this.ring(c.x, c.y, T * 0.42, LINK_COLORS[l.l % 3], l.on ? 0.25 : 0.55);
    }

    // exit
    {
      const e = world.exit;
      const open = world.key.taken;
      if (open) this.glow(e.x + 0.5, e.y + 0.5, 1.4 + 0.1 * Math.sin(t * 0.004), "rgba(80,255,160,0.35)");
      this.spr(open ? "exit_open" : "exit_closed", e.x + 0.5, e.y + 1, { h: 1.12 });
    }

    // ---- y-sorted entities ----
    type D = { y: number; draw: () => void };
    const list: D[] = [];

    for (const gt of world.gates) {
      list.push({
        y: gt.y + 1,
        draw: () => {
          if (gt.open && gt.openT > 20) this.spr("gate_open", gt.x + 0.5, gt.y + 1, { h: 1.05, alpha: 0.9 });
          else if (gt.open) {
            const k = gt.openT / 20;
            this.spr("gate_closed", gt.x + 0.5, gt.y + 1, { h: 1.05, alpha: 1 - k, white: 1 - k });
            this.spr("gate_open", gt.x + 0.5, gt.y + 1, { h: 1.05, alpha: k });
          } else this.spr("gate_closed", gt.x + 0.5, gt.y + 1, { h: 1.05 });
          const c = this.toDev(gt.x + 0.5, gt.y + 0.15);
          g.fillStyle = LINK_COLORS[gt.l % 3];
          g.globalAlpha = gt.open ? 0.3 : 0.95;
          g.beginPath();
          g.arc(c.x, c.y, T * 0.08, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        },
      });
    }

    for (const l of world.launchers) {
      list.push({
        y: l.y + 1,
        draw: () => {
          const ph = world.launcherPhase(l);
          const c = this.toDev(l.x + 0.5, l.y + 0.5);
          g.save();
          g.translate(c.x, c.y);
          g.rotate((l.d * Math.PI) / 2);
          const [sx, sy, sw, sh] = ATLAS.launcher;
          const dh = T * 1.0,
            dw = (dh * sw) / sh;
          g.drawImage(this.img!, sx, sy, sw, sh, -T / 2, -dh / 2, dw, dh);
          if (l.warn && this.white) {
            const k = (ph - (LAUNCHER.period - LAUNCHER.warn)) / LAUNCHER.warn;
            g.globalAlpha = 0.25 + 0.5 * k * (0.5 + 0.5 * Math.sin(t * 0.06));
            g.drawImage(this.white, sx, sy, sw, sh, -T / 2, -dh / 2, dw, dh);
          }
          g.restore();
        },
      });
    }

    for (const lv of world.levers)
      list.push({ y: lv.y + 0.9, draw: () => this.spr(lv.on ? "lever_on" : "lever_off", lv.x + 0.5, lv.y + 0.9, { h: 0.8 }) });

    for (const o of world.layout.objects) {
      if (o.k === "torch")
        list.push({
          y: o.y + 0.95,
          draw: () => this.spr("torch", o.x + 0.5, o.y + 0.95, { h: 1.05, sy: 1 + 0.03 * Math.sin(t * 0.02 + o.x) }),
        });
      else if (o.k === "rubble") list.push({ y: o.y + 0.85, draw: () => this.spr("rubble", o.x + 0.5, o.y + 0.85, { h: 0.7 }) });
      else if (o.k === "chest") list.push({ y: o.y + 0.9, draw: () => this.spr("chest", o.x + 0.5, o.y + 0.9, { h: 0.85 }) });
    }

    // pickups
    for (const tk of world.tokens) {
      if (tk.taken && world.tick - tk.takenAt > 24) continue;
      list.push({
        y: tk.y + 0.3,
        draw: () => {
          if (tk.taken) {
            const k = (world.tick - tk.takenAt) / 24;
            this.spr("token", tk.x, tk.y - k * 0.8, { anchor: "center", h: 0.6 * (1 + k * 0.4), alpha: 1 - k });
            return;
          }
          const bob = Math.sin(t * 0.005 + tk.x) * 0.06;
          this.shadow(tk.x, tk.y + 0.28, 0.22);
          this.glow(tk.x, tk.y + bob, 0.7, "rgba(255,200,60,0.22)");
          this.spr("token", tk.x, tk.y + bob, { anchor: "center", h: 0.58, sx: Math.cos(t * 0.004 + tk.y) * 0.25 + 0.75 });
        },
      });
    }
    if (!world.key.taken || world.tick - world.key.takenAt < 30) {
      const k = world.key;
      list.push({
        y: k.y + 0.3,
        draw: () => {
          if (k.taken) {
            const f = (world.tick - k.takenAt) / 30;
            this.spr("key", k.x, k.y - f, { anchor: "center", h: 0.7, alpha: 1 - f, rot: f * 2 });
            return;
          }
          const bob = Math.sin(t * 0.004) * 0.08;
          this.shadow(k.x, k.y + 0.3, 0.2);
          this.glow(k.x, k.y + bob, 1.0, "rgba(255,220,90,0.3)");
          this.spr("key", k.x, k.y + bob, { anchor: "center", h: 0.72, rot: Math.sin(t * 0.003) * 0.15 });
          if (Math.random() < 0.06) this.sparkle(k.x, k.y);
        },
      });
    }

    // enemies
    for (const e of world.enemies) {
      if (e.state === "dead" && e.deadT > 40) continue;
      const ex = e.px + (e.x - e.px) * alpha;
      const ey = e.py + (e.y - e.py) * alpha;
      list.push({ y: ey + 0.3, draw: () => this.drawEnemy(world, e, ex, ey, t) });
    }

    // player
    const p = world.player;
    const px = p.px + (p.x - p.px) * alpha;
    const py = p.py + (p.y - p.py) * alpha;
    list.push({ y: py + 0.3, draw: () => this.drawPlayer(world, px, py, t, false) });

    if (opts.ghost) {
      const gp = opts.ghost.player;
      const gx = gp.px + (gp.x - gp.px) * alpha;
      const gy = gp.py + (gp.y - gp.py) * alpha;
      if (!opts.ghost.done || opts.ghost.status === "won")
        list.push({ y: gy + 0.29, draw: () => this.drawPlayer(opts.ghost!, gx, gy, t, true) });
    }

    list.sort((a, b) => a.y - b.y);

    // telegraphs (under entities but over floor)
    for (const e of world.enemies) {
      if (e.kind === "skeleton" && e.state === "aim") this.aimLine(world, e.x, e.y, e.dx, e.dy, e.t, t);
      if (e.kind === "charger" && e.state === "tele") this.chargeLane(world, e.x, e.y, e.dx, e.dy, e.t);
    }

    for (const d of list) d.draw();

    // projectiles
    for (const pr of world.projectiles) {
      if (!pr.alive) continue;
      const x = pr.px + (pr.x - pr.px) * alpha,
        y = pr.py + (pr.y - pr.py) * alpha;
      const ang = Math.atan2(pr.vy, pr.vx);
      // motion trail
      const c = this.toDev(x, y);
      const grad = g.createLinearGradient(c.x, c.y, c.x - Math.cos(ang) * T * 0.9, c.y - Math.sin(ang) * T * 0.9);
      grad.addColorStop(0, pr.kind === "dart" ? "rgba(255,120,80,0.5)" : "rgba(255,255,255,0.45)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = grad;
      g.lineWidth = T * 0.08;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(c.x, c.y);
      g.lineTo(c.x - Math.cos(ang) * T * 0.9, c.y - Math.sin(ang) * T * 0.9);
      g.stroke();
      this.spr("arrow", x, y, { anchor: "center", rot: ang, h: pr.kind === "dart" ? 0.16 : 0.2 });
    }

    // fx sprites
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const k = 1 - f.life / f.max;
      this.spr(f.name, f.x, f.y, { anchor: "center", h: f.size * (0.8 + k * 0.5), alpha: 1 - k * k, flip: f.flip });
      if (--f.life <= 0) this.fx.splice(i, 1);
    }

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.vx *= 0.92;
      q.vy = q.vy * 0.92 + q.grav / 60;
      q.x += q.vx / 60;
      q.y += q.vy / 60;
      const k = q.life / q.max;
      const c = this.toDev(q.x, q.y);
      const s = q.size * T * (0.5 + k * 0.5);
      g.globalAlpha = Math.min(1, k * 1.5);
      g.fillStyle = q.color;
      if (q.shape) g.fillRect(c.x - s / 2, c.y - s / 2, s, s);
      else {
        g.beginPath();
        g.arc(c.x, c.y, s / 2, 0, Math.PI * 2);
        g.fill();
      }
      if (--q.life <= 0) this.particles.splice(i, 1);
    }
    g.globalAlpha = 1;

    // torch & ambient lights (additive)
    g.globalCompositeOperation = "lighter";
    for (const o of world.layout.objects)
      if (o.k === "torch") this.glow(o.x + 0.5, o.y + 0.2, 2.4 + Math.sin(t * 0.013 + o.x * 3) * 0.12, "rgba(255,150,60,0.16)");
    g.globalCompositeOperation = "source-over";

    // death markers / editor overlays
    if (opts.deaths?.length) this.drawDeaths(opts.deaths);
    if (opts.overlay) this.drawOverlay(world, opts.overlay, t);

    // floating texts
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      const k = f.life / 60;
      const c = this.toDev(f.x, f.y - (1 - k) * 0.6);
      g.globalAlpha = Math.min(1, k * 2);
      g.font = `700 ${Math.round(T * 0.32)}px var(--font-pixel), ui-sans-serif, system-ui`;
      g.lineWidth = T * 0.08;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.strokeText(f.text, c.x, c.y);
      g.fillStyle = f.color;
      g.fillText(f.text, c.x, c.y);
      if (--f.life <= 0) this.texts.splice(i, 1);
    }
    g.globalAlpha = 1;

    this.ox = ox0;
    this.oy = oy0;

    // vignette + hurt flash
    if (this.vignette) g.drawImage(this.vignette, 0, 0);
    if (world.player.hp === 1 && world.status === "playing") {
      const k = 0.18 + 0.1 * Math.sin(t * 0.008);
      const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, "rgba(255,0,40,0)");
      grd.addColorStop(1, `rgba(255,0,40,${k})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    if (this.hurtFlash > 0) {
      g.fillStyle = `rgba(255,40,70,${Math.min(0.35, this.hurtFlash * 0.3)})`;
      g.fillRect(0, 0, W, H);
      this.hurtFlash *= 0.85;
      if (this.hurtFlash < 0.02) this.hurtFlash = 0;
    }
  }

  private toDev(wx: number, wy: number) {
    return { x: this.ox + (wx + BORDER) * this.T, y: this.oy + (wy + BORDER) * this.T };
  }

  private shadow(wx: number, wy: number, r: number) {
    const c = this.toDev(wx, wy);
    const g = this.ctx;
    g.fillStyle = "rgba(0,0,0,0.32)";
    g.beginPath();
    g.ellipse(c.x, c.y, r * this.T, r * this.T * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }

  private glow(wx: number, wy: number, r: number, color: string) {
    const c = this.toDev(wx, wy);
    const g = this.ctx;
    const R = r * this.T;
    const grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(c.x - R, c.y - R, R * 2, R * 2);
  }

  private ring(x: number, y: number, r: number, color: string, a: number) {
    const g = this.ctx;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, this.T * 0.05);
    g.beginPath();
    g.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  private sparkle(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 0.6,
      y: y + (Math.random() - 0.5) * 0.6,
      vx: 0,
      vy: -0.6,
      life: 30,
      max: 30,
      size: 0.06,
      color: "#fff6c0",
      grav: 0,
      shape: 1,
    });
  }

  private aimLine(world: World, x: number, y: number, dx: number, dy: number, et: number, t: number) {
    const g = this.ctx;
    const locked = et >= SKELETON.lockAt;
    let len = 0;
    while (len < 9 && !world.isSolid(Math.floor(x + dx * len), Math.floor(y + dy * len))) len += 0.1;
    const a = this.toDev(x, y - 0.2),
      b = this.toDev(x + dx * len, y + dy * len - 0.2);
    const k = et / SKELETON.aim;
    g.save();
    g.lineCap = "round";
    g.strokeStyle = locked ? `rgba(255,60,60,${0.55 + 0.35 * Math.sin(t * 0.05)})` : `rgba(255,220,120,${0.25 + k * 0.35})`;
    g.lineWidth = this.T * (locked ? 0.07 : 0.04);
    g.setLineDash(locked ? [] : [this.T * 0.2, this.T * 0.14]);
    g.lineDashOffset = -t * 0.05;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.restore();
  }

  private chargeLane(world: World, x: number, y: number, dx: number, dy: number, et: number) {
    const g = this.ctx;
    let len = 0;
    while (len < CHARGER.maxDist && !world.isSolid(Math.floor(x + dx * (len + 0.35)), Math.floor(y + dy * (len + 0.35)))) len += 0.1;
    const k = et / CHARGER.telegraph;
    const a = this.toDev(x, y),
      b = this.toDev(x + dx * len, y + dy * len);
    g.save();
    g.lineCap = "round";
    g.strokeStyle = `rgba(255,50,40,${0.12 + k * 0.3})`;
    g.lineWidth = this.T * 0.8;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    // filling progress
    const m = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    g.strokeStyle = `rgba(255,90,60,${0.35 + k * 0.3})`;
    g.lineWidth = this.T * 0.18;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(m.x, m.y);
    g.stroke();
    // chevron at the end
    const ang = Math.atan2(dy, dx);
    g.translate(b.x, b.y);
    g.rotate(ang);
    g.fillStyle = `rgba(255,80,60,${0.4 + k * 0.5})`;
    g.beginPath();
    const s = this.T * 0.3;
    g.moveTo(s, 0);
    g.lineTo(-s * 0.6, -s);
    g.lineTo(-s * 0.6, s);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawEnemy(world: World, e: World["enemies"][number], x: number, y: number, t: number) {
    const flash = e.flash > 0 ? e.flash / 8 : 0;
    const dead = e.state === "dead";
    const fade = dead ? Math.max(0, 1 - e.deadT / 40) : 1;
    if (!dead) this.shadow(x, y + 0.3, e.r * 0.9);
    if (e.kind === "slime") {
      const hop = (e.t % 40) / 40;
      const moving = e.state === "chase";
      const sq = moving ? Math.sin(hop * Math.PI * 2) * 0.12 : Math.sin(t * 0.005 + e.id) * 0.05;
      const lift = moving ? Math.max(0, Math.sin(hop * Math.PI * 2)) * 0.12 : 0;
      if (dead) this.spr("slime_dead", x, y + 0.35, { h: 0.4, alpha: fade, flip: e.face < 0 });
      else
        this.spr(moving && hop < 0.4 ? "slime_1" : "slime_0", x, y + 0.35 - lift, {
          h: 0.68,
          sx: 1 + sq,
          sy: 1 - sq,
          white: flash,
          flip: e.face < 0,
        });
      return;
    }
    if (e.kind === "skeleton") {
      let name: SpriteName = "skel_idle";
      if (dead) name = "skel_dead";
      else if (e.flash > 0) name = "skel_hurt";
      else if (e.state === "aim") name = "skel_shoot";
      else if (e.state === "recover") name = e.t < 12 ? "skel_shoot" : "skel_walk";
      const face = e.state === "aim" ? (e.dx >= 0 ? 1 : -1) : e.face;
      this.spr(name, x, y + 0.42, {
        h: dead ? 0.55 : 1.12,
        flip: face < 0,
        white: flash,
        alpha: fade,
        sy: dead ? 1 : 1 + Math.sin(t * 0.004 + e.id) * 0.015,
      });
      return;
    }
    // charger
    let name: SpriteName = Math.floor(t / 300 + e.id) % 2 ? "charger_0" : "charger_1";
    let ox = 0;
    if (dead) name = "charger_dead";
    else if (e.flash > 0) name = "charger_hurt";
    else if (e.state === "tele") {
      name = "charger_alert";
      ox = Math.sin(t * 0.09) * 0.04;
    } else if (e.state === "charge") name = "charger_run";
    else if (e.state === "recover") name = "charger_hurt";
    this.spr(name, x + ox, y + 0.45, {
      h: dead ? 0.6 : name === "charger_alert" ? 1.35 : 1.0,
      flip: e.face < 0,
      white: flash,
      alpha: fade,
    });
    if (e.state === "recover" && !dead) {
      // dizzy stars
      for (let i = 0; i < 3; i++) {
        const a = t * 0.006 + (i * Math.PI * 2) / 3;
        const c = this.toDev(x + Math.cos(a) * 0.35, y - 0.55 + Math.sin(a) * 0.1);
        this.ctx.fillStyle = "#ffe36a";
        this.ctx.fillRect(c.x - this.T * 0.04, c.y - this.T * 0.04, this.T * 0.08, this.T * 0.08);
      }
    }
    if (e.state === "charge" && Math.random() < 0.5)
      this.particles.push({ x: x - e.dx * 0.3, y: y + 0.35, vx: -e.dx * 2, vy: -0.5, life: 20, max: 20, size: 0.12, color: "rgba(200,180,150,0.7)", grav: 0, shape: 0 });
    void world;
  }

  private drawPlayer(world: World, x: number, y: number, t: number, ghost: boolean) {
    const p = world.player;
    const src = !ghost && this.outfit ? this.outfit : null;
    const dead = world.status === "dead" && !ghost;
    const blink = p.hurtT > 0 && !dead && Math.floor(p.hurtT / 4) % 2 === 0;
    const alpha = ghost ? 0.38 : blink ? 0.45 : 1;
    if (!ghost) this.shadow(x, y + 0.3, 0.26);
    const H = 1.18;
    const base = { src, alpha, white: ghost ? 0.5 : 0 };
    if (dead) {
      this.spr("player_dead", x, y + 0.38, { ...base, h: 0.6 });
      return;
    }
    if (p.rollT > 0) {
      const k = 1 - p.rollT / PLAYER.rollTime;
      this.spr("player_roll", x, y + 0.35, { ...base, h: 0.88, flip: p.rollDx > 0, sx: 1 + Math.sin(k * Math.PI) * 0.1 });
      return;
    }
    if (p.hurtT > PLAYER.hurtProtect - 14) {
      this.spr("player_hurt", x, y + 0.38, { ...base, h: H, flip: p.fx < 0 });
      return;
    }
    if (p.atkT >= 0) {
      const dx = p.atkDx,
        dy = p.atkDy;
      const side = Math.abs(dx) >= Math.abs(dy) * 0.8;
      if (side) {
        const f = p.atkT < 3 ? "player_atk_0" : p.atkT < 9 ? "player_atk_2" : "player_atk_0";
        this.spr(f, x, y + 0.38, { ...base, h: H * 0.96, flip: dx < 0 });
      } else
        this.spr(dy > 0 ? "player_down_sword" : "player_up_sword", x, y + 0.38, {
          ...base,
          h: H * 1.04,
          sy: 1 - Math.sin((p.atkT / 14) * Math.PI) * 0.06,
        });
      if (!ghost) this.slash(x, y - 0.25, dx, dy, p.atkT);
      return;
    }
    const fx = p.fx,
      fy = p.fy;
    const side = Math.abs(fx) > Math.abs(fy) * 0.9;
    if (p.moving) {
      if (side) {
        const fr = Math.floor(p.walk * 2) % 8;
        this.spr(`player_side_${fr}` as SpriteName, x, y + 0.38, { ...base, h: H * 0.96, flip: fx > 0 });
      } else {
        const fr = Math.floor(p.walk * 1.4) % 4;
        this.spr(`player_${fy > 0 ? "down" : "up"}_${fr}` as SpriteName, x, y + 0.38, { ...base, h: H });
      }
      return;
    }
    const breathe = 1 + Math.sin(t * 0.004) * 0.018;
    if (side) this.spr("player_side_0", x, y + 0.38, { ...base, h: H * 0.96, flip: fx > 0, sy: breathe });
    else this.spr(fy < 0 ? "player_up_0" : "player_down_0", x, y + 0.38, { ...base, h: H, sy: breathe });
  }

  private slash(x: number, y: number, dx: number, dy: number, at: number) {
    const k = at / 12;
    if (k > 1) return;
    const g = this.ctx;
    const c = this.toDev(x, y + 0.1);
    const ang = Math.atan2(dy, dx);
    const R = this.T * PLAYER.attackRange * 0.85;
    const sweep = Math.min(1, at / 5);
    const a0 = ang - 1.15,
      a1 = ang - 1.15 + 2.3 * sweep;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.4) / 0.6);
    g.lineCap = "round";
    g.strokeStyle = this.sword.glow;
    g.lineWidth = this.T * 0.28 * (1 - k * 0.5);
    g.shadowColor = this.sword.glow;
    g.shadowBlur = this.T * 0.4;
    g.beginPath();
    g.arc(c.x, c.y, R * 0.8, a0, a1);
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = this.sword.core;
    g.lineWidth = this.T * 0.08;
    g.beginPath();
    g.arc(c.x, c.y, R * 0.86, a0 + 0.2, a1);
    g.stroke();
    g.restore();
  }

  private drawDeaths(deaths: Array<[number, number]>) {
    const g = this.ctx;
    const T = this.T;
    for (const [x, y] of deaths) {
      const c = this.toDev(x, y);
      g.save();
      g.translate(c.x, c.y);
      g.globalAlpha = 0.85;
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.lineWidth = T * 0.14;
      g.lineCap = "round";
      const s = T * 0.16;
      g.beginPath();
      g.moveTo(-s, -s);
      g.lineTo(s, s);
      g.moveTo(s, -s);
      g.lineTo(-s, s);
      g.stroke();
      g.strokeStyle = "#ff4d6d";
      g.lineWidth = T * 0.07;
      g.stroke();
      g.restore();
    }
  }

  private drawOverlay(world: World, o: EditorOverlay, t: number) {
    const g = this.ctx;
    const T = this.T;
    if (o.showGrid) {
      g.strokeStyle = "rgba(255,255,255,0.06)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= GRID_W; x++) {
        const a = this.toDev(x, 0);
        g.moveTo(Math.round(a.x) + 0.5, a.y);
        g.lineTo(Math.round(a.x) + 0.5, a.y + GRID_H * T);
      }
      for (let y = 0; y <= GRID_H; y++) {
        const a = this.toDev(0, y);
        g.moveTo(a.x, Math.round(a.y) + 0.5);
        g.lineTo(a.x + GRID_W * T, Math.round(a.y) + 0.5);
      }
      g.stroke();
    }
    if (o.safe) {
      const a = this.toDev(o.safe.x - 2, o.safe.y - 2);
      g.fillStyle = "rgba(90,220,140,0.07)";
      g.fillRect(a.x, a.y, T * 5, T * 5);
      g.strokeStyle = "rgba(90,220,140,0.35)";
      g.setLineDash([T * 0.15, T * 0.12]);
      g.lineWidth = Math.max(1, T * 0.03);
      g.strokeRect(a.x, a.y, T * 5, T * 5);
      g.setLineDash([]);
    }
    if (o.launcherPaths)
      for (const path of o.launcherPaths)
        for (const [x, y] of path) {
          const c = this.toDev(x + 0.5, y + 0.5);
          g.fillStyle = "rgba(255,120,80,0.45)";
          g.beginPath();
          g.arc(c.x, c.y, T * 0.06, 0, Math.PI * 2);
          g.fill();
        }
    if (o.links)
      for (const l of o.links) {
        const a = this.toDev(l.from[0] + 0.5, l.from[1] + 0.5),
          b = this.toDev(l.to[0] + 0.5, l.to[1] + 0.5);
        g.save();
        g.strokeStyle = LINK_COLORS[l.l % 3];
        g.globalAlpha = o.selectedLink === undefined || o.selectedLink === l.l ? 0.8 : 0.3;
        g.lineWidth = Math.max(1.5, T * 0.05);
        g.setLineDash([T * 0.12, T * 0.1]);
        g.lineDashOffset = -t * 0.03;
        g.beginPath();
        g.moveTo(a.x, a.y);
        const mx = (a.x + b.x) / 2,
          my = Math.min(a.y, b.y) - T * 0.8;
        g.quadraticCurveTo(mx, my, b.x, b.y);
        g.stroke();
        g.restore();
      }
    if (o.bad)
      for (const [x, y] of o.bad) {
        const a = this.toDev(x, y);
        g.fillStyle = `rgba(255,50,80,${0.25 + 0.15 * Math.sin(t * 0.01)})`;
        g.fillRect(a.x, a.y, T, T);
      }
    if (o.hover && this.img) {
      const a = this.toDev(o.hover.x, o.hover.y);
      const name: SpriteName = o.hover.ok ? "ui_sel_ok" : "ui_sel_bad";
      const pulse = 1 + Math.sin(t * 0.012) * 0.04;
      const s = T * 1.08 * pulse;
      g.drawImage(this.img, ...src(name), a.x + T / 2 - s / 2, a.y + T / 2 - s / 2, s, s);
    }
    void world;
  }
}

function src(name: SpriteName): [number, number, number, number] {
  const [x, y, w, h] = ATLAS[name];
  return [x, y, w, h];
}

function hash2(x: number, y: number) {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function hashObjects(objs: Placed[]) {
  let h = 0;
  for (const o of objs) if (o.k === "wall" || o.k === "moss") h = (Math.imul(h, 31) + o.y * GRID_W + o.x + (o.k === "moss" ? 999 : 0)) | 0;
  return h;
}

export { DIRS };
