"use client";
import { useState } from "react";
import { audio } from "@/lib/audio";
import { useSave } from "@/lib/hooks";
import { store } from "@/lib/store";

export function VolumeSettings({ extended = false }: { extended?: boolean }) {
  const [v, setV] = useState(audio.settings);
  const save = useSave();
  const set = (k: "music" | "sfx", n: number) => {
    const next = { ...v, [k]: n };
    setV(next);
    audio.setVolumes(next);
    if (k === "sfx") audio.play("click");
  };
  return (
    <div className="grid gap-3 text-sm">
      {(["music", "sfx"] as const).map((k) => (
        <label key={k} className="flex items-center gap-3">
          <span className="w-14 text-ink-300">{k === "music" ? "Music" : "Sound"}</span>
          <input type="range" min={0} max={1} step={0.05} value={v[k]} onChange={(e) => set(k, Number(e.target.value))} className="flex-1" />
          <span className="w-9 text-right tabular-nums text-ink-400">{Math.round(v[k] * 100)}</span>
        </label>
      ))}
      {extended && (
        <>
          <Toggle label="Race your best ghost" checked={save.settings.ghost} onChange={(b) => store.setting("ghost", b)} />
          <Toggle label="Screen shake" checked={save.settings.shake} onChange={(b) => store.setting("shake", b)} />
          <Toggle label="Reduced motion" checked={save.settings.reducedMotion} onChange={(b) => store.setting("reducedMotion", b)} />
        </>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => {
        audio.play("click");
        onChange(!checked);
      }}
      className="flex items-center justify-between rounded-xl px-1 py-1 text-left"
    >
      <span className="text-ink-200">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-mint-500" : "bg-ink-600"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
