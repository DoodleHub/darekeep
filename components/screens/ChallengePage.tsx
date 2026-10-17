"use client";
import { useEffect, useState } from "react";
import { api, type ChallengeInfo } from "@/lib/api";
import { useSave, useSession } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { store } from "@/lib/store";
import { Button, DIFF_TONE, Empty, Pill, Sprite, Spinner, fmtTime, share } from "../ui";
import { DungeonPreview } from "../DungeonPreview";
import { PlayScreen } from "../play/PlayScreen";
import { TopBar } from "./TopBar";

export function ChallengePage({ code }: { code: string }) {
  const session = useSession();
  const save = useSave();
  const [info, setInfo] = useState<ChallengeInfo | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    api.challenge(code).then((c) => {
      if (!alive) return;
      setInfo(c);
      if (c && c.user_id !== session.userId) store.addRival(c.user_id, c.challenger);
    });
    return () => {
      alive = false;
    };
  }, [code, session.userId]);

  if (info === undefined)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  if (info === null)
    return (
      <div className="min-h-dvh">
        <TopBar back="/" />
        <main className="mx-auto max-w-xl px-4 pt-16">
          <Empty icon="rubble" title="Challenge not found">
            This link may be broken or expired.
          </Empty>
        </main>
      </div>
    );

  const d = info.dungeon;
  const rec = save.records[d.versionId];
  const mine = info.user_id === session.userId;
  const myBest = info.goal === "full" ? rec?.bestFullMs ?? null : rec?.bestMs ?? null;
  const beaten = myBest !== null && myBest < info.target_ms;

  if (playing)
    return (
      <PlayScreen
        dungeon={d}
        mode="play"
        challenge={{ code, goal: info.goal, target: info.target_ms, challenger: info.challenger, userId: info.user_id, replay: info.replay }}
        onExit={() => setPlaying(false)}
      />
    );

  return (
    <div className="min-h-dvh">
      <TopBar back="/" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <div className="panel overflow-hidden rounded-3xl">
          <div className="relative">
            <DungeonPreview layout={d.layout} animate className="aspect-[18/10] w-full sm:aspect-[18/9]" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <Pill tone="rose">
                <Sprite name="ui_key" size={14} /> Challenge
              </Pill>
              <h1 className="pixel-text mt-2 text-3xl text-white text-shadow-hard sm:text-5xl">
                {mine ? "Your challenge" : `${info.challenger} dares you`}
              </h1>
              <p className="mt-1 text-ink-200">
                {info.goal === "full" ? "Escape with all 3 treasure tokens" : "Escape"} from <b className="text-white">{d.title}</b> faster than{" "}
                <b className="pixel-text text-rose-400">{fmtTime(info.target_ms, true)}</b>.
              </p>
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Box label="Target" value={fmtTime(info.target_ms, true)} tone="rose" />
              <Box label="Your best" value={fmtTime(myBest, true)} tone={beaten ? "mint" : undefined} />
              <Box label="Difficulty" value={<span className={`text-base ${DIFF_TONE[d.difficulty ?? "Unrated"] === "rose" ? "text-rose-400" : ""}`}>{d.difficulty ?? "Unrated"}</span>} />
            </div>
            {beaten && !mine && <p className="mt-3 text-center text-sm text-mint-400">You&apos;ve already beaten this time. Send one back!</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" size="lg" icon="ui_play" className="flex-1" onClick={() => setPlaying(true)}>
                {mine ? "Practice it" : "Play challenge"}
              </Button>
              {mine ? (
                <Button size="lg" icon="ui_swap" onClick={() => share(window.location.href, `Can you beat my ${fmtTime(info.target_ms, true)} on "${d.title}"?`)}>
                  Share again
                </Button>
              ) : (
                <Button size="lg" icon="wall" onClick={() => navigate("/build")}>
                  Build your own
                </Button>
              )}
            </div>
            <p className="mt-4 text-center text-xs text-ink-400">
              {info.replay ? `You'll race ${mine ? "your" : `${info.challenger}'s`} ghost. ` : ""}No sign-up needed — unlimited attempts.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "rose" | "mint" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-2 py-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`pixel-text mt-1 text-xl ${tone === "rose" ? "text-rose-400" : tone === "mint" ? "text-mint-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
