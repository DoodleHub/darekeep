import { AIM_NONE, quantizeAim, type InputFrame } from "./input";

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function octant(x: number, y: number, dead = 0.3): [-1 | 0 | 1, -1 | 0 | 1] {
  if (x * x + y * y < dead * dead) return [0, 0];
  const a = Math.atan2(y, x);
  const o = Math.round(a / (Math.PI / 4));
  const dx = Math.round(Math.cos((o * Math.PI) / 4)) as -1 | 0 | 1;
  const dy = Math.round(Math.sin((o * Math.PI) / 4)) as -1 | 0 | 1;
  return [dx, dy];
}

/** Collects input from every device and produces one InputFrame per tick. */
export class Controls {
  private keys = new Set<string>();
  private dodgeEdge = false;
  private mouseDown = false;
  private keyAttack = false;
  mouse = { x: 0, y: 0, active: false };
  /** set by the on-screen touch controls */
  touch = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, attack: false };
  usingTouch = false;
  private padDodgePrev = false;
  enabled = true;
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (MOVE_KEYS[e.code] || e.code === "Space") e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyK") this.dodgeEdge = true;
    if (e.code === "KeyJ" || e.code === "Enter") {
      this.keyAttack = true;
      this.mouse.active = false;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "KeyJ" || e.code === "Enter") this.keyAttack = false;
  };
  private onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.keyAttack = false;
  };

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  pointerMove(x: number, y: number) {
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.active = true;
    this.usingTouch = false;
  }

  pointerDown(button: number) {
    if (button === 0) this.mouseDown = true;
    if (button === 2) this.dodgeEdge = true;
    this.mouse.active = true;
  }

  pointerUp(button: number) {
    if (button === 0) this.mouseDown = false;
  }

  pressDodge() {
    this.dodgeEdge = true;
  }

  setUsingTouch(on: boolean) {
    this.usingTouch = on;
  }

  setTouchMove(x: number, y: number) {
    this.touch.mx = x;
    this.touch.my = y;
  }

  setTouchAttack(on: boolean) {
    this.touch.attack = on;
    if (!on) this.touch.aiming = false;
  }

  setTouchAim(x: number, y: number) {
    this.touch.aiming = true;
    this.touch.ax = x;
    this.touch.ay = y;
  }

  reset() {
    this.keys.clear();
    this.mouseDown = false;
    this.keyAttack = false;
    this.dodgeEdge = false;
    this.touch = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, attack: false };
  }

  /** @param player player position in CSS px, for mouse aiming */
  frame(player: { x: number; y: number }): InputFrame {
    let mx = 0,
      my = 0;
    for (const k of this.keys) {
      const m = MOVE_KEYS[k];
      if (m) {
        mx += m[0];
        my += m[1];
      }
    }
    let attack = this.mouseDown || this.keyAttack;
    let dodge = this.dodgeEdge;
    this.dodgeEdge = false;
    let aim = AIM_NONE;
    if (this.mouse.active && !this.usingTouch) aim = quantizeAim(this.mouse.x - player.x, this.mouse.y - player.y);

    // touch sticks
    if (this.usingTouch) {
      const [tx, ty] = octant(this.touch.mx, this.touch.my, 0.25);
      if (tx || ty) {
        mx = tx;
        my = ty;
      }
      if (this.touch.aiming) {
        aim = quantizeAim(this.touch.ax, this.touch.ay);
        attack = true;
      }
      if (this.touch.attack) attack = true;
    }

    // gamepad
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const [gx, gy] = octant(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.35);
      const dpx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      const dpy = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      if (gx || gy) {
        mx = gx;
        my = gy;
      } else if (dpx || dpy) {
        mx = dpx;
        my = dpy;
      }
      const rx = pad.axes[2] ?? 0,
        ry = pad.axes[3] ?? 0;
      if (rx * rx + ry * ry > 0.25) {
        aim = quantizeAim(rx, ry);
        this.mouse.active = false;
      }
      if (pad.buttons[0]?.pressed || pad.buttons[7]?.pressed || pad.buttons[2]?.pressed) attack = true;
      const d = !!(pad.buttons[1]?.pressed || pad.buttons[6]?.pressed || pad.buttons[5]?.pressed);
      if (d && !this.padDodgePrev) dodge = true;
      this.padDodgePrev = d;
    }

    return {
      mx: Math.max(-1, Math.min(1, mx)) as -1 | 0 | 1,
      my: Math.max(-1, Math.min(1, my)) as -1 | 0 | 1,
      attack,
      dodge,
      aim,
    };
  }

  isDown(code: string) {
    return this.keys.has(code);
  }
}
