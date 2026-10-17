// One input frame per simulation tick, packed into 13 bits so replays stay tiny.

export const AIM_STEPS = 64;
export const AIM_NONE = 64;

export interface InputFrame {
  mx: -1 | 0 | 1;
  my: -1 | 0 | 1;
  attack: boolean;
  dodge: boolean;
  /** 0..63 quantised aim angle, or AIM_NONE to use facing */
  aim: number;
}

export const IDLE: InputFrame = { mx: 0, my: 0, attack: false, dodge: false, aim: AIM_NONE };

// Rounded so every browser produces bit-identical vectors (keeps replays deterministic).
export const AIM_TABLE: ReadonlyArray<readonly [number, number]> = Array.from({ length: AIM_STEPS }, (_, i) => {
  const a = (i / AIM_STEPS) * Math.PI * 2;
  return [Math.round(Math.cos(a) * 4096) / 4096, Math.round(Math.sin(a) * 4096) / 4096] as const;
});

export function quantizeAim(dx: number, dy: number) {
  if (dx === 0 && dy === 0) return AIM_NONE;
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI * 2;
  return Math.round((a / (Math.PI * 2)) * AIM_STEPS) % AIM_STEPS;
}

export function pack(f: InputFrame) {
  return (f.mx + 1) | ((f.my + 1) << 2) | ((f.attack ? 1 : 0) << 4) | ((f.dodge ? 1 : 0) << 5) | (f.aim << 6);
}

export function unpack(v: number): InputFrame {
  return {
    mx: ((v & 3) - 1) as -1 | 0 | 1,
    my: (((v >> 2) & 3) - 1) as -1 | 0 | 1,
    attack: ((v >> 4) & 1) === 1,
    dodge: ((v >> 5) & 1) === 1,
    aim: (v >> 6) & 127,
  };
}

// ---- replay codec: run-length pairs as LEB128 varints, base64url ----

function writeVar(out: number[], n: number) {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

export function encodeReplay(frames: ArrayLike<number>): string {
  const bytes: number[] = [];
  writeVar(bytes, 1); // format version
  let i = 0;
  while (i < frames.length) {
    const v = frames[i];
    let n = 1;
    while (i + n < frames.length && frames[i + n] === v) n++;
    writeVar(bytes, v);
    writeVar(bytes, n);
    i += n;
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeReplay(s: string): Uint16Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  let p = 0;
  const readVar = () => {
    let n = 0,
      shift = 0,
      b = 0;
    do {
      b = bin.charCodeAt(p++);
      n |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80 && p < bin.length);
    return n >>> 0;
  };
  readVar(); // version
  const out: number[] = [];
  while (p < bin.length) {
    const v = readVar();
    const n = readVar();
    for (let k = 0; k < n; k++) out.push(v);
  }
  return Uint16Array.from(out);
}
