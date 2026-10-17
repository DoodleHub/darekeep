export type Kind =
  | "start"
  | "key"
  | "exit"
  | "token"
  | "wall"
  | "slime"
  | "skeleton"
  | "charger"
  | "spike"
  | "launcher"
  | "lever"
  | "gate"
  | "torch"
  | "rubble"
  | "chest"
  | "moss";

/** 0 = right, 1 = down, 2 = left, 3 = up */
export type Dir = 0 | 1 | 2 | 3;

export interface Placed {
  k: Kind;
  x: number;
  y: number;
  /** launcher direction */
  d?: Dir;
  /** spike / launcher phase offset (0..3) */
  o?: number;
  /** lever system id (0..2) for levers and gates */
  l?: number;
}

export interface Layout {
  v: 1;
  theme: number;
  objects: Placed[];
}

export interface DungeonMeta {
  id: string;
  versionId: string;
  title: string;
  description: string;
  creator: string;
  kind: "curated" | "daily" | "tutorial" | "community";
  difficulty?: Difficulty;
}

export type Difficulty = "Unrated" | "Easy" | "Medium" | "Hard" | "Expert";

export interface Dungeon extends DungeonMeta {
  layout: Layout;
}

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export const DECOR_KINDS: ReadonlySet<Kind> = new Set(["torch", "rubble", "chest", "moss"]);
export const ENEMY_KINDS: ReadonlySet<Kind> = new Set(["slime", "skeleton", "charger"]);
export const TRAP_KINDS: ReadonlySet<Kind> = new Set(["spike", "launcher"]);
export const SOLID_KINDS: ReadonlySet<Kind> = new Set(["wall", "gate", "launcher"]);
