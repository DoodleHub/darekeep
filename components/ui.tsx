"use client";
import { createPortal } from "react-dom";
import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { ATLAS, ATLAS_SIZE, ATLAS_URL, type SpriteName } from "@/lib/game/atlas";
import { audio } from "@/lib/audio";

export function Sprite({
  name,
  size = 24,
  className = "",
  style,
  title,
}: {
  name: SpriteName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const [x, y, w, h] = ATLAS[name];
  const s = size / Math.max(w, h);
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
    >
      <span
        style={{
          width: w * s,
          height: h * s,
          backgroundImage: `url(${ATLAS_URL})`,
          backgroundPosition: `${-x * s}px ${-y * s}px`,
          backgroundSize: `${ATLAS_SIZE.w * s}px ${ATLAS_SIZE.h * s}px`,
          backgroundRepeat: "no-repeat",
          display: "block",
        }}
      />
    </span>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "mint";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-ink-950 bg-gradient-to-b from-gold-300 to-gold-500 shadow-[0_4px_0_#9a6608,0_10px_30px_-8px_rgba(255,200,60,0.55)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_#9a6608]",
  mint: "text-ink-950 bg-gradient-to-b from-[#9dffd0] to-mint-500 shadow-[0_4px_0_#13865a,0_10px_30px_-8px_rgba(60,240,160,0.5)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_#13865a]",
  secondary:
    "text-ink-200 bg-ink-700/80 border border-white/10 shadow-[0_3px_0_rgba(0,0,0,0.45)] hover:bg-ink-600/90 hover:text-white active:translate-y-[2px] active:shadow-none",
  ghost: "text-ink-300 hover:text-white hover:bg-white/5",
  danger:
    "text-white bg-gradient-to-b from-rose-400 to-rose-500 shadow-[0_4px_0_#8d1630] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_#8d1630]",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  sound = "click",
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: SpriteName;
  sound?: "click" | "back" | "none";
}) {
  const sz = size === "lg" ? "h-14 px-7 text-lg gap-3" : size === "sm" ? "h-9 px-3 text-sm gap-1.5" : "h-11 px-5 text-base gap-2";
  return (
    <button
      {...rest}
      onPointerEnter={() => audio.play("hover")}
      onClick={(e) => {
        audio.unlock();
        if (sound !== "none") audio.play(sound);
        onClick?.(e);
      }}
      className={`pixel-text inline-flex select-none items-center justify-center rounded-xl font-semibold transition-[transform,filter,background-color,box-shadow,color] duration-100 disabled:pointer-events-none disabled:opacity-40 ${sz} ${VARIANTS[variant]} ${className}`}
    >
      {icon && <Sprite name={icon} size={size === "lg" ? 26 : size === "sm" ? 16 : 20} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  className = "",
  size = 40,
  disabled,
}: {
  icon: SpriteName;
  label: string;
  onClick?: () => void;
  className?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerEnter={() => audio.play("hover")}
      onClick={() => {
        audio.unlock();
        audio.play("click");
        onClick?.();
      }}
      className={`grid place-items-center rounded-xl bg-ink-800/80 border border-white/10 transition hover:bg-ink-700 hover:scale-105 active:scale-95 disabled:opacity-40 ${className}`}
      style={{ width: size, height: size }}
    >
      <Sprite name={icon} size={size * 0.6} />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  children,
  className = "",
  label,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // portal to <body>: ancestors with backdrop-filter/transform would otherwise trap `fixed`
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[65] grid place-items-center overflow-y-auto p-4 animate-fade">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`panel relative w-full max-w-md rounded-2xl p-6 animate-pop ${className}`}>{children}</div>
    </div>,
    document.body,
  );
}

export function Pill({ children, className = "", tone = "default" }: { children: ReactNode; className?: string; tone?: "default" | "gold" | "mint" | "rose" | "sky" }) {
  const tones = {
    default: "bg-white/5 text-ink-200 border-white/10",
    gold: "bg-gold-400/10 text-gold-300 border-gold-400/25",
    mint: "bg-mint-400/10 text-mint-400 border-mint-400/25",
    rose: "bg-rose-400/10 text-rose-400 border-rose-400/25",
    sky: "bg-sky-400/10 text-sky-400 border-sky-400/25",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export const DIFF_TONE = { Easy: "mint", Medium: "sky", Hard: "gold", Expert: "rose", Unrated: "default" } as const;

export function fmtTime(ms: number | null | undefined, short = false) {
  if (ms === null || ms === undefined) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  if (short) return `${m ? m + ":" + String(s).padStart(2, "0") : s}.${String(Math.floor(r / 10)).padStart(2, "0")}s`;
  return `${m}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

// ---- toasts ----
type Toast = { id: number; text: string; tone: "default" | "gold" | "rose" | "mint"; icon?: SpriteName };
let toasts: Toast[] = [];
const toastListeners = new Set<(t: Toast[]) => void>();
export function toast(text: string, tone: Toast["tone"] = "default", icon?: SpriteName) {
  const t = { id: Date.now() + Math.random(), text, tone, icon };
  toasts = [...toasts, t].slice(-4);
  toastListeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l(toasts));
  }, 3200);
}

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    toastListeners.add(setList);
    return () => {
      toastListeners.delete(setList);
    };
  }, []);
  const tone = { default: "border-white/15", gold: "border-gold-400/50", rose: "border-rose-400/50", mint: "border-mint-400/50" };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`panel flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm animate-rise ${tone[t.tone]}`}>
          {t.icon && <Sprite name={t.icon} size={18} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export async function share(url: string, text: string) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ url, text, title: "Darekeep" });
      return;
    }
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast("Link copied — send it to a friend!", "gold", "ui_key");
  } catch {
    window.prompt("Copy this link:", url);
  }
}

export function useStore<T>(sel: () => T, subscribe: (fn: () => void) => () => void) {
  const [v, setV] = useState(sel);
  useEffect(() => subscribe(() => setV(sel())), [subscribe, sel]);
  return v;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-gold-400 ${className}`} />;
}

export function Empty({ icon, title, children }: { icon: SpriteName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <Sprite name={icon} size={44} className="opacity-80" />
      <div className="pixel-text text-lg text-ink-200">{title}</div>
      {children && <div className="max-w-sm text-sm text-ink-300">{children}</div>}
    </div>
  );
}
