"use client";
import { useState } from "react";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { BADGES, levelFor, xpIntoLevel } from "@/lib/progression";
import { IconButton, Modal, Sprite } from "../ui";
import { VolumeSettings } from "../VolumeSettings";

export function TopBar({ title, back }: { title?: string; back?: string }) {
  const session = useSession();
  const save = useSave();
  const [settings, setSettings] = useState(false);
  const lvl = levelFor(session.xp);
  const badge = BADGES[save.settings.badge] ?? BADGES[0];
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/60 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        {back ? (
          <IconButton icon="ui_undo" label="Back" onClick={() => navigate(back)} size={38} />
        ) : null}
        <button onClick={() => navigate("/")} className="flex items-center gap-2" aria-label="Darekeep home">
          <Sprite name="key" size={26} />
          <span className="pixel-text hidden text-xl tracking-wider text-white sm:inline">DAREKEEP</span>
        </button>
        {title && <span className="pixel-text truncate text-lg text-ink-300">/ {title}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate("/me")}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1 pl-1.5 pr-3 transition hover:bg-white/[0.08]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-700">
              <Sprite name={badge.icon} size={22} />
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-[10rem] truncate text-sm font-semibold text-white">{session.profile?.display_name ?? "Adventurer"}</span>
              <span className="block text-[11px] text-ink-400">Explorer Lv {lvl}</span>
            </span>
            <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-black/40 sm:w-16">
              <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${xpIntoLevel(session.xp)}%` }} />
            </span>
          </button>
          <IconButton icon="ui_settings" label="Sound & settings" onClick={() => setSettings(true)} size={40} />
        </div>
      </div>
      <Modal open={settings} onClose={() => setSettings(false)} label="Settings">
        <div className="pixel-text mb-4 text-2xl">Settings</div>
        <VolumeSettings extended />
      </Modal>
    </header>
  );
}
