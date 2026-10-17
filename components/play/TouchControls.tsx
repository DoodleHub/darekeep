"use client";
import { useEffect, useRef } from "react";
import type { Controls } from "@/lib/game/controls";
import { Sprite } from "../ui";

/** Left: floating move stick. Right: attack button that doubles as an aim stick, plus dodge. */
export function TouchControls({ controls, cooldowns }: { controls: Controls; cooldowns: React.RefObject<{ atk: number; roll: number }> }) {
  const stickBase = useRef<HTMLDivElement>(null);
  const stickKnob = useRef<HTMLDivElement>(null);
  const aimKnob = useRef<HTMLDivElement>(null);
  const rollRing = useRef<HTMLDivElement>(null);
  const atkRing = useRef<HTMLDivElement>(null);
  const move = useRef<{ id: number; x: number; y: number } | null>(null);
  const aim = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    controls.setUsingTouch(true);
    let raf = 0;
    const tick = () => {
      const c = cooldowns.current;
      rollRing.current?.style.setProperty("--p", String(c?.roll ?? 0));
      atkRing.current?.style.setProperty("--p", String(c?.atk ?? 0));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      controls.setUsingTouch(false);
    };
  }, [controls, cooldowns]);

  const R = 52;

  const onMoveDown = (e: React.PointerEvent) => {
    if (move.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    move.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    const b = stickBase.current!;
    b.style.left = `${e.clientX}px`;
    b.style.top = `${e.clientY}px`;
    b.style.opacity = "1";
  };
  const onMoveMove = (e: React.PointerEvent) => {
    const m = move.current;
    if (!m || m.id !== e.pointerId) return;
    let dx = e.clientX - m.x,
      dy = e.clientY - m.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      // drag the base along so the stick never "runs out"
      const nm = { id: m.id, x: m.x + (dx / d) * (d - R), y: m.y + (dy / d) * (d - R) };
      move.current = nm;
      stickBase.current!.style.left = `${nm.x}px`;
      stickBase.current!.style.top = `${nm.y}px`;
      dx = e.clientX - nm.x;
      dy = e.clientY - nm.y;
    }
    controls.setTouchMove(dx / R, dy / R);
    stickKnob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onMoveUp = (e: React.PointerEvent) => {
    if (move.current?.id !== e.pointerId) return;
    move.current = null;
    controls.setTouchMove(0, 0);
    stickKnob.current!.style.transform = "";
    stickBase.current!.style.opacity = "0.35";
  };

  const onAimDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    aim.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    controls.setTouchAttack(true);
    navigator.vibrate?.(8);
  };
  const onAimMove = (e: React.PointerEvent) => {
    const a = aim.current;
    if (!a || a.id !== e.pointerId) return;
    const dx = e.clientX - a.x,
      dy = e.clientY - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 14) {
      controls.setTouchAim(dx, dy);
      const k = Math.min(1, 34 / d);
      aimKnob.current!.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
  };
  const onAimUp = (e: React.PointerEvent) => {
    if (aim.current?.id !== e.pointerId) return;
    aim.current = null;
    controls.setTouchAttack(false);
    aimKnob.current!.style.transform = "";
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none" style={{ touchAction: "none" }}>
      {/* move zone */}
      <div
        className="pointer-events-auto absolute bottom-0 left-0 h-[60%] w-[48%]"
        onPointerDown={onMoveDown}
        onPointerMove={onMoveMove}
        onPointerUp={onMoveUp}
        onPointerCancel={onMoveUp}
      />
      <div
        ref={stickBase}
        className="pointer-events-none absolute grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-white/5 opacity-35 transition-opacity"
        style={{ left: "18%", top: "78%" }}
      >
        <div ref={stickKnob} className="h-12 w-12 rounded-full border border-white/30 bg-white/20 shadow-lg backdrop-blur" />
      </div>

      {/* action cluster */}
      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1.25rem,env(safe-area-inset-bottom))] flex items-end gap-4">
        <button
          aria-label="Dodge roll"
          className="pointer-events-auto relative mb-16 grid h-16 w-16 place-items-center rounded-full border border-sky-400/40 bg-sky-400/15 active:scale-95"
          onPointerDown={(e) => {
            e.stopPropagation();
            controls.pressDodge();
            navigator.vibrate?.(12);
          }}
        >
          <CooldownRing ref={rollRing} color="#6ec8ff" />
          <Sprite name="fx_dust" size={34} />
        </button>
        <div
          aria-label="Attack — drag to aim"
          role="button"
          className="pointer-events-auto relative grid h-24 w-24 place-items-center rounded-full border border-gold-400/40 bg-gold-400/15 active:scale-95"
          onPointerDown={onAimDown}
          onPointerMove={onAimMove}
          onPointerUp={onAimUp}
          onPointerCancel={onAimUp}
        >
          <CooldownRing ref={atkRing} color="#ffd34a" />
          <div ref={aimKnob} className="pointer-events-none grid place-items-center">
            <Sprite name="sword" size={44} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CooldownRing({ ref, color }: { ref: React.Ref<HTMLDivElement>; color: string }) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{
        background: `conic-gradient(rgba(0,0,0,0.55) calc(var(--p, 0) * 360deg), transparent 0)`,
        boxShadow: `inset 0 0 0 2px ${color}55`,
      }}
    />
  );
}
