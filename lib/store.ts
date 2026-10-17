// Local cache of the signed-in player's records, drafts and settings, scoped per account so
// people sharing a browser never see each other's progress. The server stays the source of truth.
import type { Layout } from "./game/types";

export interface LocalRecord {
  attempts: number;
  bestMs: number | null;
  bestFullMs: number | null;
  escaped: boolean;
  treasure: boolean;
  flawless: boolean;
  bestReplay?: string;
  deaths: Array<[number, number]>;
}

export interface Draft {
  id: string;
  dungeonId: string | null;
  title: string;
  description: string;
  layout: Layout;
  verified: { hash: string; timeMs: number; replay: string } | null;
  updatedAt: number;
  publishedVersionId?: string;
}

export interface Settings {
  reducedMotion: boolean;
  ghost: boolean;
  shake: boolean;
  outfit: number;
  sword: number;
  badge: number;
}

interface Shape {
  records: Record<string, LocalRecord>;
  ratings: Record<string, string>;
  rivals: Array<{ id: string; name: string }>;
  tutorialDone: boolean;
  buildTutorialDone: boolean;
  drafts: Draft[];
  settings: Settings;
  xpKeys: string[];
}

const PREFIX = "dk.save.v2:";
let owner: string | null = null;

const defaults = (): Shape => ({
  records: {},
  ratings: {},
  rivals: [],
  tutorialDone: false,
  buildTutorialDone: false,
  drafts: [],
  settings: { reducedMotion: false, ghost: true, shake: true, outfit: 0, sword: 0, badge: 0 },
  xpKeys: [],
});

let cache: Shape | null = null;
const listeners = new Set<() => void>();

function load(): Shape {
  if (cache) return cache;
  if (typeof window === "undefined" || !owner) return (cache = defaults());
  try {
    const raw = localStorage.getItem(PREFIX + owner);
    const parsed = raw ? (JSON.parse(raw) as Partial<Shape>) : {};
    const d = defaults();
    cache = { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings ?? {}) } };
  } catch {
    cache = defaults();
  }
  return cache;
}

function save() {
  if (!cache) return;
  try {
    if (owner) localStorage.setItem(PREFIX + owner, JSON.stringify(cache));
  } catch {}
  for (const l of listeners) l();
}

export const store = {
  get: load,
  /** Switch to the given account's save (null when signed out). */
  setOwner(id: string | null) {
    if (id === owner) return;
    owner = id;
    cache = null;
    try {
      localStorage.removeItem("dk.save.v1"); // pre-accounts guest save
    } catch {}
    load();
    for (const l of listeners) l();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  update(fn: (s: Shape) => void) {
    const s = load();
    fn(s);
    cache = { ...s };
    save();
  },
  record(versionId: string): LocalRecord {
    return (
      load().records[versionId] ?? {
        attempts: 0,
        bestMs: null,
        bestFullMs: null,
        escaped: false,
        treasure: false,
        flawless: false,
        deaths: [],
      }
    );
  },
  /** Applies a finished run. Returns which personal bests were beaten. */
  applyRun(
    versionId: string,
    dungeonId: string,
    r: { success: boolean; timeMs: number; tokens: number; damage: number; practice: boolean; replay?: string; death?: [number, number]; daily?: string | null },
  ) {
    const prev = store.record(versionId);
    const rec: LocalRecord = { ...prev, deaths: [...prev.deaths] };
    rec.attempts++;
    let newBest = false,
      newFull = false;
    const xp: string[] = [];
    if (r.success) {
      if (!r.practice && (rec.bestMs === null || r.timeMs < rec.bestMs)) {
        newBest = true;
        rec.bestMs = r.timeMs;
        if (r.replay) rec.bestReplay = r.replay;
      }
      if (!r.practice && r.tokens === 3 && (rec.bestFullMs === null || r.timeMs < rec.bestFullMs)) {
        newFull = true;
        rec.bestFullMs = r.timeMs;
      }
      rec.escaped = true;
      if (r.tokens === 3) rec.treasure = true;
      if (r.damage === 0) rec.flawless = true;
      xp.push(`esc:${dungeonId}`);
      if (r.tokens === 3) xp.push(`tre:${dungeonId}`);
      if (r.damage === 0) xp.push(`fla:${dungeonId}`);
      if (r.daily) xp.push(`day:${r.daily}`);
    } else if (r.death) {
      rec.deaths.push(r.death);
      if (rec.deaths.length > 60) rec.deaths.splice(0, rec.deaths.length - 60);
    }
    store.update((s) => {
      s.records = { ...s.records, [versionId]: rec };
      const keys = new Set(s.xpKeys);
      for (const k of xp) keys.add(k);
      s.xpKeys = [...keys];
    });
    return { newBest, firstEscape: !prev.escaped && rec.escaped, newFull, prev };
  },
  localXp() {
    let xp = 0;
    for (const k of load().xpKeys) xp += k.startsWith("esc:") || k.startsWith("day:") ? 20 : 10;
    return xp;
  },
  saveDraft(d: Draft) {
    store.update((s) => {
      const i = s.drafts.findIndex((x) => x.id === d.id);
      const next = [...s.drafts];
      if (i >= 0) next[i] = d;
      else next.unshift(d);
      s.drafts = next;
    });
  },
  deleteDraft(id: string) {
    store.update((s) => {
      s.drafts = s.drafts.filter((d) => d.id !== id);
    });
  },
  addRival(id: string, name: string) {
    store.update((s) => {
      if (!s.rivals.some((r) => r.id === id)) s.rivals = [{ id, name }, ...s.rivals].slice(0, 50);
    });
  },
  setting<K extends keyof Settings>(k: K, v: Settings[K]) {
    store.update((s) => {
      s.settings = { ...s.settings, [k]: v };
    });
  },
};

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
