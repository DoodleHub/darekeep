"use client";
import { useEffect, useState } from "react";
import { api, type Card } from "@/lib/api";
import { BUDGET } from "@/lib/game/constants";
import { costOf, layoutHash } from "@/lib/game/dungeon";
import { ADVENTURE } from "@/lib/game/levels";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { store } from "@/lib/store";
import { Button, Empty, Modal, Pill, Sprite } from "../ui";
import { DungeonPreview } from "../DungeonPreview";
import { TopBar } from "./TopBar";
import { newDraft } from "../build/Editor";

export function BuildHome() {
  const save = useSave();
  const session = useSession();
  const [published, setPublished] = useState<Card[] | null>(null);
  const [remix, setRemix] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canList = !!session.userId;
  useEffect(() => {
    if (!canList || !session.userId) return;
    let alive = true;
    api.browse("community", "new", session.userId).then((c) => alive && setPublished(c ?? []));
    return () => {
      alive = false;
    };
  }, [canList, session.userId]);

  const create = (from?: Parameters<typeof newDraft>[0]) => {
    const d = newDraft(from);
    store.saveDraft(d);
    navigate(`/build/${d.id}`);
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Workshop" back="/" />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="pixel-text text-4xl text-white">Workshop</h1>
            <p className="mt-1 max-w-xl text-ink-300">
              16×12 tiles, {BUDGET} points, one rule: you have to beat it yourself before anyone else can try.
            </p>
          </div>
          <div className="flex gap-2">
            <Button icon="ui_swap" onClick={() => setRemix(true)}>
              Remix a starter
            </Button>
            <Button variant="primary" icon="wall" onClick={() => create()}>
              New dungeon
            </Button>
          </div>
        </div>

        {!save.buildTutorialDone && (
          <section className="mt-6 grid gap-4 rounded-3xl border border-gold-400/20 bg-gold-400/[0.05] p-5 sm:grid-cols-4">
            {[
              { icon: "ui_play", title: "1. Required", text: "Start, key, exit and exactly 3 treasure tokens. All free." },
              { icon: "slime_0", title: "2. Hazards", text: "Walls, enemies, spikes, darts and levers cost points from your 100 budget." },
              { icon: "ui_timer", title: "3. Prove it", text: "Beat it yourself with the key and all treasure, no pausing, under 3 minutes." },
              { icon: "ui_key", title: "4. Dare", text: "Publish, share the link and watch where your friends fall." },
            ].map((s) => (
              <div key={s.title} className="flex gap-3">
                <Sprite name={s.icon as "ui_play"} size={34} />
                <div>
                  <div className="pixel-text text-gold-300">{s.title}</div>
                  <div className="text-sm text-ink-200">{s.text}</div>
                </div>
              </div>
            ))}
          </section>
        )}

        <h2 className="pixel-text mt-8 text-2xl">Drafts</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {save.drafts.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Empty icon="wall" title="No drafts yet">
                Start from an empty room or remix one of the starter dungeons.
              </Empty>
            </div>
          ) : (
            save.drafts.map((d) => {
              const verified = d.verified?.hash === layoutHash(d.layout);
              const live = !!d.publishedVersionId;
              return (
                <div key={d.id} className="panel group overflow-hidden rounded-2xl">
                  <button onClick={() => navigate(`/build/${d.id}`)} className="block w-full text-left">
                    <DungeonPreview layout={d.layout} className="aspect-[18/14] w-full" />
                  </button>
                  <div className="flex items-center gap-2 p-4">
                    <button onClick={() => navigate(`/build/${d.id}`)} className="min-w-0 flex-1 text-left">
                      <div className="pixel-text truncate text-lg text-white">{d.title || "Untitled dungeon"}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Pill>{costOf(d.layout)}/{BUDGET} pts</Pill>
                        {verified ? <Pill tone="mint">Verified</Pill> : <Pill tone="gold">Untested</Pill>}
                        {live && <Pill tone="sky">Published</Pill>}
                      </div>
                    </button>
                    {live && (
                      <button onClick={() => navigate(`/d/${d.publishedVersionId}`)} className="rounded-lg p-2 hover:bg-white/10" aria-label="View published page">
                        <Sprite name="medal_escape" size={22} />
                      </button>
                    )}
                    <button onClick={() => setConfirmDelete(d.id)} className="rounded-lg p-2 opacity-60 hover:bg-white/10 hover:opacity-100" aria-label="Delete draft">
                      <Sprite name="ui_trash" size={20} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {canList && published && published.length > 0 && (
          <>
            <h2 className="pixel-text mt-10 text-2xl">Published</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {published.map((c) => (
                <button key={c.id} onClick={() => navigate(`/d/${c.version_id}`)} className="panel flex items-center gap-3 rounded-2xl p-3 text-left transition hover:border-white/25">
                  <DungeonPreview layout={c.layout} className="h-16 w-20 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="pixel-text truncate text-white">{c.title}</div>
                    <div className="text-xs text-ink-400">
                      v{c.version} · {c.players} players · {c.players ? Math.round((c.escapers / c.players) * 100) : 0}% escape
                    </div>
                  </div>
                  <span className="text-ink-400">→</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <Modal open={remix} onClose={() => setRemix(false)} label="Remix a starter" className="max-w-2xl">
        <div className="pixel-text text-2xl">Remix a starter</div>
        <p className="mt-1 text-sm text-ink-300">Copy a curated dungeon into a new draft and make it yours.</p>
        <div className="scroll-thin mt-4 grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {ADVENTURE.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setRemix(false);
                create({ layout: d.layout, title: `${d.title} Remix`.slice(0, 32) });
              }}
              className="flex items-center gap-3 rounded-xl border border-white/10 p-2 text-left hover:bg-white/5"
            >
              <DungeonPreview layout={d.layout} className="h-14 w-18 w-[72px] shrink-0 rounded-md" />
              <div className="min-w-0">
                <div className="pixel-text truncate">{d.title}</div>
                <div className="text-xs text-ink-400">{costOf(d.layout)} pts</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} label="Delete draft">
        <div className="pixel-text text-xl">Delete this draft?</div>
        <p className="mt-2 text-sm text-ink-300">The draft is removed from this device. A published dungeon stays live.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={() => setConfirmDelete(null)}>Keep</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDelete) store.deleteDraft(confirmDelete);
              setConfirmDelete(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
