"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type BoardRow, type Stats } from "@/lib/api";
import { dailyDungeon, utcDateString } from "@/lib/game/levels";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { store } from "@/lib/store";
import { Button, DIFF_TONE, Empty, Pill, Sprite, Spinner, fmtTime, share } from "../ui";
import { DungeonPreview } from "../DungeonPreview";
import { TopBar } from "./TopBar";
import { Medals, type PlayDungeon } from "../play/PlayScreen";
import { ChallengeModal, ReportModal } from "../play/Results";
import { newDraft } from "../build/Editor";

export function DungeonPage({ versionId, daily }: { versionId: string; daily: boolean }) {
  const session = useSession();
  const save = useSave();
  const [dungeon, setDungeon] = useState<PlayDungeon | null | undefined>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<"escape" | "full">("escape");
  const [loadedRows, setLoadedRows] = useState<{ key: string; rows: BoardRow[] } | null>(null);
  const [friends, setFriends] = useState<Array<{ user_id: string; display_name: string; best_ms: number | null; best_full_ms: number | null }>>([]);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [showDeaths, setShowDeaths] = useState(true);

  const isDaily = daily && dailyDungeon().versionId === versionId;
  const dailyDate = isDaily ? utcDateString() : null;

  useEffect(() => {
    let alive = true;
    api.dungeon(versionId).then((d) => alive && setDungeon(d));
    api.stats(versionId).then((s) => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, [versionId, session.online]);

  const rowsKey = `${versionId}|${board}|${dailyDate}|${session.online}`;
  useEffect(() => {
    let alive = true;
    api.leaderboard(versionId, board, dailyDate).then((r) => alive && setLoadedRows({ key: rowsKey, rows: r ?? [] }));
    return () => {
      alive = false;
    };
  }, [versionId, board, dailyDate, rowsKey]);
  const rows = loadedRows?.key === rowsKey ? loadedRows.rows : null;

  useEffect(() => {
    const ids = save.rivals.map((r) => r.id);
    api.playerBests(versionId, ids).then(setFriends);
  }, [versionId, save.rivals]);

  const rec = save.records[versionId];
  const isOwner = !!dungeon?.ownerId && dungeon.ownerId === session.userId;
  const deaths = useMemo(() => (isOwner && showDeaths ? stats?.deaths ?? [] : undefined), [isOwner, showDeaths, stats]);

  if (dungeon === undefined)
    return (
      <div className="min-h-dvh">
        <TopBar back="/" />
        <div className="grid h-[60vh] place-items-center">
          <Spinner className="h-8 w-8" />
        </div>
      </div>
    );
  if (dungeon === null)
    return (
      <div className="min-h-dvh">
        <TopBar back="/" />
        <main className="mx-auto max-w-xl px-4 pt-16">
          <Empty icon="rubble" title="Dungeon not found">
            It may have been removed, or the connection dropped.
          </Empty>
        </main>
      </div>
    );

  const backTo = dungeon.kind === "curated" ? "/adventure" : dungeon.kind === "community" ? "/community" : "/";
  const rate = stats && stats.players ? Math.round((stats.escapers / stats.players) * 100) : null;
  const difficulty = stats?.difficulty ?? dungeon.difficulty ?? "Unrated";
  const play = () => navigate(`/play/${versionId}${isDaily ? "?daily=1" : ""}`);

  return (
    <div className="min-h-dvh">
      <TopBar back={backTo} />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-6 lg:grid-cols-[1.4fr_1fr]">
        {/* left: card */}
        <section className="grid content-start gap-4">
          <div className="panel overflow-hidden rounded-3xl">
            <div className="relative">
              <DungeonPreview layout={dungeon.layout} deaths={deaths} animate className="aspect-[18/14] w-full" />
              {isOwner && stats && stats.deaths.length > 0 && (
                <button onClick={() => setShowDeaths((s) => !s)} className="absolute right-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur">
                  {showDeaths ? "Hide" : "Show"} death markers ({stats.deaths.length})
                </button>
              )}
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {isDaily && <Pill tone="gold">Daily · {dailyDate}</Pill>}
                <Pill tone={DIFF_TONE[difficulty]}>{difficulty}</Pill>
                {dungeon.kind === "community" && <Pill>Community</Pill>}
              </div>
              <h1 className="pixel-text mt-2 text-4xl text-white">{dungeon.title}</h1>
              <div className="text-sm text-ink-400">by {dungeon.creator}</div>
              {dungeon.description && <p className="mt-3 text-ink-200">{dungeon.description}</p>}

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Fact label="Escape rate" value={rate !== null ? `${rate}%` : "—"} sub={stats ? `${stats.players} players` : undefined} />
                <Fact label="Typical time" value={fmtTime(stats?.median_ms ?? null, true)} />
                <Fact label="Your best" value={fmtTime(rec?.bestMs ?? null, true)} sub={rec?.bestFullMs ? `full ${fmtTime(rec.bestFullMs, true)}` : undefined} />
                <Fact label="Medals" value={<Medals rec={rec ?? { escaped: false, treasure: false, flawless: false }} size={20} />} />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="primary" size="lg" icon="ui_play" onClick={play} className="flex-1 sm:flex-none">
                  {rec?.attempts ? "Play again" : "Play"}
                </Button>
                {rec?.escaped && (
                  <Button size="lg" icon="ui_key" onClick={() => setChallengeOpen(true)}>
                    Challenge
                  </Button>
                )}
                <Button size="lg" variant="ghost" icon="ui_swap" onClick={() => share(`${window.location.origin}/d/${versionId}`, `Try "${dungeon.title}" on Darekeep.`)}>
                  Share
                </Button>
              </div>
            </div>
          </div>

          {isOwner && stats && (
            <div className="panel rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="pixel-text text-xl">Creator insights</h2>
                <Button
                  size="sm"
                  icon="wall"
                  onClick={() => {
                    const existing = store.get().drafts.find((d) => d.dungeonId === dungeon.id);
                    const d = existing ?? newDraft({ layout: dungeon.layout, title: dungeon.title, description: dungeon.description, dungeonId: dungeon.id });
                    if (!existing) store.saveDraft({ ...d, publishedVersionId: versionId });
                    navigate(`/build/${d.id}`);
                  }}
                >
                  Edit / new version
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Fact label="Players" value={String(stats.players)} />
                <Fact label="Escaped" value={String(stats.escapers)} />
                <Fact label="Attempts" value={String(stats.attempts)} />
                <Fact label="Ratings" value={`${stats.ratings.fun + stats.ratings.clever}♥`} sub={`${stats.ratings.frustrating} frustrated`} />
              </div>
              {stats.fastest && (
                <button onClick={() => navigate(`/replay/${stats.fastest!.run_id}`)} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:bg-white/5">
                  <Sprite name="ui_play" size={26} />
                  <span className="flex-1 text-sm">
                    Watch the fastest run by <b>{stats.fastest.name}</b>
                  </span>
                  <span className="pixel-text text-gold-300">{fmtTime(stats.fastest.time_ms, true)}</span>
                </button>
              )}
              <p className="mt-3 text-xs text-ink-400">Your own runs don&apos;t count. Red marks show where challengers fell.</p>
            </div>
          )}
        </section>

        {/* right: leaderboards */}
        <section className="grid content-start gap-4">
          <div className="panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="pixel-text text-xl">{isDaily ? "Today's board" : "Leaderboard"}</h2>
              <div className="flex rounded-xl bg-black/30 p-1 text-sm">
                {(["escape", "full"] as const).map((b) => (
                  <button key={b} onClick={() => setBoard(b)} className={`pixel-text rounded-lg px-3 py-1 transition ${board === b ? "bg-white/10 text-white" : "text-ink-400"}`}>
                    {b === "escape" ? "Fastest escape" : "Full clear"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              {rows === null ? (
                <div className="grid gap-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="shimmer h-10 rounded-xl" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="py-8 text-center text-sm text-ink-400">No times yet. Claim the top spot!</div>
              ) : (
                <ol className="grid gap-1">
                  {rows.map((r) => (
                    <li key={r.user_id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.user_id === session.userId ? "bg-gold-400/10 ring-1 ring-gold-400/30" : "odd:bg-white/[0.03]"}`}>
                      <span className={`pixel-text w-7 text-center ${r.rank <= 3 ? "text-gold-300" : "text-ink-400"}`}>{r.rank}</span>
                      <span className="min-w-0 flex-1 truncate">{r.display_name}</span>
                      <span className="pixel-text tabular-nums text-white">{fmtTime(r.time_ms, true)}</span>
                      <button onClick={() => navigate(`/replay/${r.run_id}`)} aria-label={`Watch ${r.display_name}'s run`} className="rounded-lg p-1 transition hover:bg-white/10">
                        <Sprite name="ui_play" size={18} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {friends.length > 0 && (
            <div className="panel rounded-3xl p-5">
              <h2 className="pixel-text text-xl">Friends</h2>
              <ul className="mt-3 grid gap-1">
                {friends.map((f) => (
                  <li key={f.user_id} className="flex items-center justify-between rounded-xl px-3 py-2 odd:bg-white/[0.03]">
                    <span className="truncate">{f.display_name}</span>
                    <span className="pixel-text tabular-nums">{fmtTime(board === "full" ? f.best_full_ms : f.best_ms, true)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-center">
            <button className="text-xs text-ink-400 hover:text-ink-200" onClick={() => setReportOpen(true)}>
              Report this dungeon
            </button>
          </div>
        </section>
      </main>
      <ChallengeModal open={challengeOpen} onClose={() => setChallengeOpen(false)} dungeon={dungeon} hasFull={!!rec?.bestFullMs} />
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} dungeonId={dungeon.id} />
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="pixel-text mt-0.5 flex text-lg text-white">{value}</div>
      {sub && <div className="text-[11px] text-ink-400">{sub}</div>}
    </div>
  );
}
