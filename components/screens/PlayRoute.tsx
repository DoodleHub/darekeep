"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ADVENTURE, dailyDungeon, utcDateString } from "@/lib/game/levels";
import { navigate } from "@/lib/router";
import { Empty, Spinner, fmtTime } from "../ui";
import { PlayScreen, type PlayDungeon } from "../play/PlayScreen";

export function PlayRoute({ versionId, daily }: { versionId: string; daily: boolean }) {
  const [dungeon, setDungeon] = useState<PlayDungeon | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api.dungeon(versionId).then((d) => alive && setDungeon(d));
    return () => {
      alive = false;
    };
  }, [versionId]);

  if (dungeon === undefined) return <Loading />;
  if (dungeon === null) return <Missing />;

  const isDaily = daily && dailyDungeon().versionId === versionId;
  const idx = ADVENTURE.findIndex((d) => d.versionId === versionId);
  const next = dungeon.kind === "tutorial" ? ADVENTURE[0] : idx >= 0 ? ADVENTURE[idx + 1] : undefined;

  return (
    <PlayScreen
      key={versionId}
      dungeon={dungeon}
      mode={dungeon.kind === "tutorial" ? "tutorial" : "play"}
      daily={isDaily ? utcDateString() : null}
      onExit={() => navigate(dungeon.kind === "tutorial" ? "/" : `/d/${versionId}${isDaily ? "?daily=1" : ""}`)}
      onNext={next ? () => navigate(`/d/${next.versionId}`) : undefined}
    />
  );
}

export function ReplayRoute({ runId }: { runId: number }) {
  const [state, setState] = useState<{ dungeon: PlayDungeon; frames: string; label: string } | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      const run = await api.runReplay(runId);
      if (!run?.replay) return alive && setState(null);
      const dungeon = await api.dungeon(run.version_id);
      if (!dungeon) return alive && setState(null);
      if (alive) setState({ dungeon, frames: run.replay, label: `${run.user?.display_name ?? "Player"} · ${fmtTime(run.time_ms, true)}` });
    })();
    return () => {
      alive = false;
    };
  }, [runId]);
  if (state === undefined) return <Loading />;
  if (state === null) return <Missing what="Replay" />;
  return (
    <PlayScreen
      dungeon={state.dungeon}
      mode="replay"
      replay={{ frames: state.frames, label: state.label }}
      onExit={() => navigate(`/d/${state.dungeon.versionId}`)}
    />
  );
}

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

function Missing({ what = "Dungeon" }: { what?: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 pt-24">
      <Empty icon="rubble" title={`${what} not found`}>
        <button className="text-gold-300 hover:underline" onClick={() => navigate("/")}>
          Back to the entrance
        </button>
      </Empty>
    </main>
  );
}
