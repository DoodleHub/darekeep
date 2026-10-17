"use client";
import { ADVENTURE, TUTORIAL } from "@/lib/game/levels";
import { useSave } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { Button, Sprite } from "../ui";
import { TopBar } from "./TopBar";
import { DungeonCard } from "./DungeonCard";

export function Adventure() {
  const save = useSave();
  const next = ADVENTURE.find((d) => !save.records[d.versionId]?.escaped);
  const medals = ADVENTURE.reduce((n, d) => {
    const r = save.records[d.versionId];
    return n + (r ? Number(r.escaped) + Number(r.treasure) + Number(r.flawless) : 0);
  }, 0);
  return (
    <div className="min-h-dvh">
      <TopBar title="Adventure" back="/" />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="pixel-text text-4xl text-white">Adventure</h1>
            <p className="mt-1 text-ink-300">Ten hand-built dungeons. Every one is beatable — the question is how fast.</p>
          </div>
          <div className="panel flex items-center gap-3 rounded-2xl px-4 py-2">
            <Sprite name="medal_treasure" size={30} />
            <div>
              <div className="pixel-text text-2xl text-gold-300 tabular-nums">
                {medals}
                <span className="text-sm text-ink-400">/{ADVENTURE.length * 3}</span>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-ink-400">medals</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADVENTURE.map((d, i) => (
            <DungeonCard
              key={d.id}
              versionId={d.versionId}
              index={i + 1}
              title={d.title}
              description={d.description}
              creator={d.creator}
              difficulty={d.difficulty ?? "Unrated"}
              layout={d.layout}
              record={save.records[d.versionId]}
              highlight={next?.id === d.id}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-ink-300">
          <span>Need a refresher?</span>
          <Button size="sm" variant="secondary" icon="ui_restart" onClick={() => navigate(`/play/${TUTORIAL.versionId}`)}>
            Replay tutorial
          </Button>
        </div>
      </main>
    </div>
  );
}
