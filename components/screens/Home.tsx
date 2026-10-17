"use client";
import { useEffect, useState } from "react";
import { ADVENTURE, CURATED, dailyDungeon, msUntilNextDaily, utcDateString } from "@/lib/game/levels";
import { TAGLINE } from "@/lib/game/constants";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { Button, DIFF_TONE, Pill, Sprite, fmtTime } from "../ui";
import { DungeonPreview } from "../DungeonPreview";
import { TopBar } from "./TopBar";
import { Medals } from "../play/PlayScreen";
import type { SpriteName } from "@/lib/game/atlas";

const HERO = CURATED.find((d) => d.id === "c10")!;

export function Home() {
  const save = useSave();
  const session = useSession();
  const daily = dailyDungeon();
  const dailyRec = save.records[daily.versionId];
  const escaped = ADVENTURE.filter((d) => save.records[d.versionId]?.escaped).length;
  const next = ADVENTURE.find((d) => !save.records[d.versionId]?.escaped) ?? ADVENTURE[0];

  const play = () => navigate(save.tutorialDone ? `/d/${next.versionId}` : "/play/tutorial-v1");

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        {/* hero */}
        <section className="relative mt-4 overflow-hidden rounded-[28px] border border-white/10">
          <DungeonPreview layout={HERO.layout} animate className="absolute inset-0 opacity-60 blur-[1.5px] saturate-[1.1]" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-ink-950/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
          <div className="relative flex min-h-[420px] flex-col justify-end gap-5 p-6 sm:min-h-[460px] sm:p-10">
            <Sprite name="key" size={64} className="animate-float drop-shadow-[0_0_24px_rgba(255,210,80,0.55)]" />
            <div>
              <h1 className="pixel-text text-5xl leading-none text-white text-shadow-hard sm:text-7xl">
                DARE<span className="gold-text">KEEP</span>
              </h1>
              <p className="mt-3 max-w-md text-lg text-ink-200">Build tiny dungeons. Dare your friends. Escape in under a minute.</p>
            </div>
            <div className="pixel-text flex flex-wrap gap-2 text-sm text-ink-200">
              {TAGLINE.split(". ").map((t, i) => (
                <span key={t} className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 backdrop-blur" style={{ animationDelay: `${i * 0.1}s` }}>
                  {t.replace(/\.$/, "")}.
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" icon="ui_play" onClick={play}>
                {save.tutorialDone ? (escaped ? "Continue adventure" : "Start adventure") : "Play the tutorial"}
              </Button>
              <Button size="lg" icon="wall" onClick={() => navigate("/build")}>
                Build a dungeon
              </Button>
            </div>
          </div>
        </section>

        {/* daily + modes */}
        <section className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <DailyCard
            onPlay={() => navigate(`/d/${daily.versionId}?daily=1`)}
            title={daily.title}
            description={daily.description}
            difficulty={daily.difficulty ?? "Unrated"}
            layout={daily.layout}
            best={dailyRec?.bestMs ?? null}
            medals={dailyRec}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <ModeCard icon="medal_escape" title="Adventure" subtitle={`${escaped}/${ADVENTURE.length} dungeons escaped`} onClick={() => navigate("/adventure")} progress={escaped / ADVENTURE.length} />
            <ModeCard icon="ui_swap" title="Community" subtitle="Fresh dungeons from other players" onClick={() => navigate("/community")} />
            <ModeCard icon="wall" title="Workshop" subtitle={save.drafts.length ? `${save.drafts.length} dungeon${save.drafts.length > 1 ? "s" : ""} in progress` : "100-point budget. Make it clever."} onClick={() => navigate("/build")} />
          </div>
        </section>

        {!save.tutorialDone && (
          <section className="mt-6 flex items-center gap-4 rounded-2xl border border-gold-400/25 bg-gold-400/[0.06] p-4">
            <Sprite name="player_down_sword" size={48} />
            <div className="flex-1">
              <div className="pixel-text text-gold-300">New here?</div>
              <div className="text-sm text-ink-200">A 30-second tutorial teaches moving, fighting, rolling and escaping.</div>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate("/play/tutorial-v1")}>
              Start
            </Button>
          </section>
        )}

        <footer className="mt-12 flex flex-col items-center gap-2 text-center text-xs text-ink-400">
          <div className="flex items-center gap-2">
            <Sprite name="torch" size={18} /> <span className="pixel-text">{TAGLINE}</span> <Sprite name="torch" size={18} />
          </div>
          <div>Signed in as {session.profile?.display_name ?? "Adventurer"} · times sync to the leaderboards</div>
        </footer>
      </main>
    </div>
  );
}

function DailyCard({
  onPlay,
  title,
  description,
  difficulty,
  layout,
  best,
  medals,
}: {
  onPlay: () => void;
  title: string;
  description: string;
  difficulty: keyof typeof DIFF_TONE;
  layout: Parameters<typeof DungeonPreview>[0]["layout"];
  best: number | null;
  medals?: { escaped: boolean; treasure: boolean; flawless: boolean };
}) {
  const [left, setLeft] = useState(msUntilNextDaily());
  useEffect(() => {
    const t = setInterval(() => setLeft(msUntilNextDaily()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(left / 3_600_000),
    m = Math.floor((left % 3_600_000) / 60_000),
    s = Math.floor((left % 60_000) / 1000);
  return (
    <button onClick={onPlay} className="panel group relative overflow-hidden rounded-3xl text-left transition hover:-translate-y-0.5 hover:border-gold-400/40">
      <DungeonPreview layout={layout} className="h-44 w-full opacity-90 transition duration-500 group-hover:scale-[1.02] sm:h-52" />
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-transparent to-ink-900 sm:h-52" />
      <div className="relative -mt-14 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="gold">
            <Sprite name="ui_timer" size={14} /> Daily challenge · {utcDateString()}
          </Pill>
          <Pill tone={DIFF_TONE[difficulty]}>{difficulty}</Pill>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <div className="pixel-text text-3xl text-white">{title}</div>
            <div className="text-sm text-ink-300">{description}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-ink-400">New dungeon in</div>
            <div className="pixel-text tabular-nums text-xl text-gold-300">
              {h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-ink-300">
            <span>
              Your best <b className="pixel-text text-white">{fmtTime(best, true)}</b>
            </span>
            {medals && <Medals rec={medals} size={18} />}
          </div>
          <span className="pixel-text rounded-xl bg-gold-400 px-4 py-2 text-ink-950 shadow-[0_3px_0_#9a6608] transition group-hover:brightness-110">Play daily</span>
        </div>
      </div>
    </button>
  );
}

function ModeCard({ icon, title, subtitle, onClick, progress }: { icon: SpriteName; title: string; subtitle: string; onClick: () => void; progress?: number }) {
  return (
    <button onClick={onClick} className="panel group flex items-center gap-4 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-white/25">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink-700/80 transition group-hover:scale-105">
        <Sprite name={icon} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="pixel-text block text-xl text-white">{title}</span>
        <span className="block truncate text-sm text-ink-300">{subtitle}</span>
        {progress !== undefined && (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/40">
            <span className="block h-full rounded-full bg-gradient-to-r from-mint-500 to-mint-400 transition-all" style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </span>
      <span className="text-ink-400 transition group-hover:translate-x-1 group-hover:text-white">→</span>
    </button>
  );
}
