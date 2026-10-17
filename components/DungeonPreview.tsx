"use client";
import { useEffect, useRef } from "react";
import { Renderer, loadAtlas } from "@/lib/game/render";
import { World } from "@/lib/game/sim";
import type { Layout } from "@/lib/game/types";

/** Static (or gently animated) render of a layout. Cheap enough for lists. */
export function DungeonPreview({
  layout,
  deaths,
  animate = false,
  className = "",
}: {
  layout: Layout;
  deaths?: Array<[number, number]>;
  animate?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const r = new Renderer(canvas);
    const world = new World(layout);
    let raf = 0;
    let alive = true;
    const draw = (t = performance.now()) => r.render(world, 1, { time: t, deaths, follow: false });
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      if (!alive) return;
      const b = el.getBoundingClientRect();
      r.resize(b.width, b.height, Math.min(2, window.devicePixelRatio || 1));
      draw();
    });
    ro.observe(el);
    loadAtlas().then(() => {
      if (!alive) return;
      // the renderer's own atlas promise resolves in the same tick; draw on the next frame
      requestAnimationFrame(() => draw());
      if (animate) {
        const loop = (t: number) => {
          draw(t);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [layout, deaths, animate]);
  return (
    <div ref={wrap} className={`${/\b(absolute|fixed)\b/.test(className) ? "" : "relative"} overflow-hidden ${className}`}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
