"use client";
import { useEffect, useState } from "react";
import { api, type Card } from "@/lib/api";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { Button, Empty } from "../ui";
import { TopBar } from "./TopBar";
import { DungeonCard } from "./DungeonCard";

const SORTS = [
  { id: "new", label: "Fresh" },
  { id: "top", label: "Top rated" },
  { id: "popular", label: "Most played" },
] as const;

export function Community() {
  const session = useSession();
  const save = useSave();
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");
  const [loaded, setLoaded] = useState<{ key: string; cards: Card[] | null } | null>(null);
  const key = `${sort}|${session.online}`;

  useEffect(() => {
    let alive = true;
    api.browse("community", sort).then((c) => alive && setLoaded({ key, cards: c }));
    return () => {
      alive = false;
    };
  }, [sort, key]);

  const cards = loaded?.key === key ? loaded.cards ?? [] : null;
  const failed = loaded?.key === key && loaded.cards === null;

  return (
    <div className="min-h-dvh">
      <TopBar title="Community" back="/" />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="pixel-text text-4xl text-white">Community dungeons</h1>
            <p className="mt-1 text-ink-300">Every one was beaten by its creator before it went live.</p>
          </div>
          <div className="flex rounded-xl bg-black/30 p-1">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`pixel-text rounded-lg px-3 py-1.5 text-sm transition ${sort === s.id ? "bg-white/10 text-white" : "text-ink-400 hover:text-ink-200"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          {cards === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="shimmer aspect-[4/4] rounded-2xl border border-white/5" />
              ))}
            </div>
          ) : failed ? (
            <Empty icon="rubble" title="Can't reach the community right now">
              Check your connection and try again. Adventure and Daily dungeons still work.
            </Empty>
          ) : cards.length === 0 ? (
            <Empty icon="chest" title="No dungeons yet — be the first!">
              <Button variant="primary" className="mt-3" icon="wall" onClick={() => navigate("/build")}>
                Build one
              </Button>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <DungeonCard
                  key={c.id}
                  versionId={c.version_id}
                  title={c.title}
                  description={c.description}
                  creator={c.creator}
                  difficulty={c.difficulty}
                  layout={c.layout}
                  record={save.records[c.version_id]}
                  players={c.players}
                  escapers={c.escapers}
                  median={c.median_ms}
                  fun={c.fun}
                  clever={c.clever}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
