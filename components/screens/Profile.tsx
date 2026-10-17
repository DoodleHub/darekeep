"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { store } from "@/lib/store";
import { BADGES, CREATOR_MILESTONES, OUTFITS, SWORDS, levelFor, xpIntoLevel } from "@/lib/progression";
import { SWORD_STYLES } from "@/lib/game/render";
import { Button, Pill, Sprite, toast } from "../ui";
import { TopBar } from "./TopBar";
import { VolumeSettings } from "../VolumeSettings";

export function Profile() {
  const session = useSession();
  const save = useSave();

  const lvl = levelFor(session.xp);
  const p = session.progress;

  const choose = (k: "outfit" | "sword" | "badge", i: number) => {
    store.setting(k, i);
    const s = store.get().settings;
    void api.setCosmetics({ outfit: s.outfit, sword: s.sword, badge: s.badge });
  };


  return (
    <div className="min-h-dvh">
      <TopBar title="Profile" back="/" />
      <main className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 pt-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="grid content-start gap-5">
          <div className="panel rounded-3xl p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 place-items-center rounded-2xl bg-ink-700">
                <Sprite name="player_down_sword" size={64} style={{ filter: `hue-rotate(${OUTFITS[save.settings.outfit]?.hue ?? 0}deg)` }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Pill tone="gold">Explorer Lv {lvl}</Pill>
                  <Pill tone="mint">Signed in</Pill>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${xpIntoLevel(session.xp)}%` }} />
                </div>
                <div className="mt-1 text-xs text-ink-400">
                  {xpIntoLevel(session.xp)}/100 XP to level {lvl + 1}
                </div>
              </div>
            </div>
            <NameField key={session.profile?.display_name ?? ""} />
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="pixel-text text-mint-400">Signed in</div>
                  <p className="mt-1 text-sm text-ink-300">Your runs, dungeons and cosmetics follow you everywhere.</p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    await api.signOut();
                    session.refresh();
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>

          <div className="panel rounded-3xl p-5">
            <div className="pixel-text mb-3 text-xl">Stats</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon="medal_escape" label="Escapes" value={p?.escapes ?? Object.values(save.records).filter((r) => r.escaped).length} />
              <Stat icon="medal_treasure" label="Treasure" value={p?.treasures ?? Object.values(save.records).filter((r) => r.treasure).length} />
              <Stat icon="medal_flawless" label="Flawless" value={p?.flawless ?? Object.values(save.records).filter((r) => r.flawless).length} />
              <Stat icon="ui_timer" label="Dailies" value={p?.dailies ?? save.xpKeys.filter((k) => k.startsWith("day:")).length} />
            </div>
            <div className="pixel-text mb-2 mt-5">Creator milestones</div>
            <div className="grid gap-1.5">
              {CREATOR_MILESTONES.map((m) => {
                const have = p?.creator_completions ?? 0;
                const done = have >= m.need;
                return (
                  <div key={m.name} className="flex items-center gap-3 text-sm">
                    <span className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${done ? "border-mint-400 bg-mint-400 text-ink-950" : "border-white/20"}`}>{done ? "✓" : ""}</span>
                    <span className={done ? "text-white" : "text-ink-300"}>{m.name}</span>
                    <span className="ml-auto text-xs text-ink-400">
                      {Math.min(have, m.need)}/{m.need} players escaped your dungeons
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid content-start gap-5">
          <div className="panel rounded-3xl p-5">
            <div className="pixel-text text-xl">Cosmetics</div>
            <p className="text-sm text-ink-400">Unlocked by Explorer level. Purely cosmetic — everyone plays with the same stats.</p>
            <Group title="Outfit">
              {OUTFITS.map((o, i) => (
                <Choice key={o.name} active={save.settings.outfit === i} locked={lvl < o.level} level={o.level} onClick={() => choose("outfit", i)} label={o.name}>
                  <Sprite name="player_down_0" size={40} style={{ filter: `hue-rotate(${o.hue}deg)` }} />
                </Choice>
              ))}
            </Group>
            <Group title="Sword trail">
              {SWORDS.map((s, i) => (
                <Choice key={s.name} active={save.settings.sword === i} locked={lvl < s.level} level={s.level} onClick={() => choose("sword", i)} label={s.name}>
                  <span className="h-8 w-8 rounded-full" style={{ background: `radial-gradient(circle, ${SWORD_STYLES[i].core} 0%, ${SWORD_STYLES[i].glow} 45%, transparent 70%)` }} />
                </Choice>
              ))}
            </Group>
            <Group title="Badge">
              {BADGES.map((b, i) => (
                <Choice key={b.name} active={save.settings.badge === i} locked={lvl < b.level} level={b.level} onClick={() => choose("badge", i)} label={b.name}>
                  <Sprite name={b.icon} size={34} />
                </Choice>
              ))}
            </Group>
            <p className="mt-4 text-xs text-ink-400">Earn XP: first escape of a dungeon +20 · treasure medal +10 · flawless medal +10 · daily challenge +20.</p>
          </div>

          <div className="panel rounded-3xl p-5">
            <div className="pixel-text mb-3 text-xl">Settings</div>
            <VolumeSettings extended />
            <Button size="sm" variant="ghost" icon="ui_restart" className="mt-3" onClick={() => navigate("/play/tutorial-v1")}>
              Replay tutorial
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function NameField() {
  const session = useSession();
  const [name, setName] = useState(session.profile?.display_name ?? "");
  const saveName = async () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 20) return toast("Names are 2–20 characters", "rose");
    const ok = await api.setDisplayName(n);
    toast(ok ? "Name saved" : "Couldn't save — are you online?", ok ? "mint" : "rose");
    if (ok) session.refresh();
  };
  return (
    <>
      <label className="mt-5 block text-xs uppercase tracking-wider text-ink-400">Display name</label>
      <div className="mt-1 flex gap-2">
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          disabled={!session.online}
          className="pixel-text min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-gold-400/60 disabled:opacity-50"
        />
        <Button size="sm" onClick={saveName} disabled={!session.online || name.trim() === session.profile?.display_name}>
          Save
        </Button>
      </div>
    </>
  );
}

function Stat({ icon, label, value }: { icon: "medal_escape" | "medal_treasure" | "medal_flawless" | "ui_timer"; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-black/20 py-3">
      <Sprite name={icon} size={30} />
      <div className="pixel-text mt-1 text-2xl text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-ink-400">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Choice({ active, locked, level, onClick, label, children }: { active: boolean; locked: boolean; level: number; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      disabled={locked}
      onClick={onClick}
      title={locked ? `Unlocks at level ${level}` : label}
      className={`relative flex h-20 w-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border text-[10px] transition ${active ? "border-gold-400 bg-gold-400/10 text-gold-300" : "border-white/10 text-ink-300 hover:bg-white/5"} ${locked ? "opacity-40" : ""}`}
    >
      {children}
      {locked ? `Lv ${level}` : label}
    </button>
  );
}
