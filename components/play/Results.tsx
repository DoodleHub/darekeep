"use client";
import { useEffect, useState } from "react";
import { audio } from "@/lib/audio";
import { api } from "@/lib/api";
import { navigate } from "@/lib/router";
import { store } from "@/lib/store";
import type { SpriteName } from "@/lib/game/atlas";
import { Button, Modal, Pill, Sprite, Spinner, fmtTime, share, toast } from "../ui";
import { PlayScreen, type ChallengeCtx, type PlayDungeon, type PlayMode } from "./PlayScreen";

export interface RunResult {
  success: boolean;
  timeMs: number;
  tokens: number;
  damage: number;
  practice: boolean;
  cause: string;
  replay: string;
  medals: { escape: boolean; treasure: boolean; flawless: boolean };
  newMedals: { escape: boolean; treasure: boolean; flawless: boolean };
  newBest: boolean;
  prevBest: number | null;
  rank: number | null;
  fullRank: number | null;
  runId: number | null;
  challengeOutcome: "win" | "tie" | "lose" | "ineligible" | null;
  verified: boolean | null;
  pending: boolean;
}

const CAUSE: Record<string, string> = {
  slime: "a slime",
  skeleton: "a skeleton",
  charger: "a charger",
  spikes: "spikes",
  arrow: "an arrow",
  dart: "a dart",
  time: "the clock",
};

export function Results({
  result: r,
  dungeon,
  mode,
  daily,
  challenge,
  online,
  onRetry,
  onExit,
  onNext,
}: {
  result: RunResult;
  dungeon: PlayDungeon;
  mode: PlayMode;
  daily: string | null;
  challenge: ChallengeCtx | null;
  online: boolean;
  onRetry: () => void;
  onExit: () => void;
  onNext?: () => void;
}) {
  const [watching, setWatching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [rating, setRating] = useState<string | null>(() => store.get().ratings[dungeon.id] ?? null);
  const timeout = r.cause === "time";
  const { runId, rank, fullRank } = r;

  useEffect(() => {
    if (r.success) {
      const n = [r.medals.escape, r.medals.treasure, r.medals.flawless].filter(Boolean).length;
      for (let i = 0; i < n; i++) setTimeout(() => audio.play("medal", i), 350 + i * 220);
    }
  }, [r.success, r.medals]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Enter" && onNext && r.success) onNext();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onNext, r.success]);

  if (watching) {
    return <ReplayOverlay dungeon={dungeon} frames={r.replay} label={`Your run · ${fmtTime(r.timeMs, true)}`} onExit={() => setWatching(false)} />;
  }

  const rate = async (v: "fun" | "clever" | "frustrating") => {
    setRating(v);
    store.update((s) => void (s.ratings = { ...s.ratings, [dungeon.id]: v }));
    const ok = await api.rate(dungeon.id, v);
    toast(ok ? "Thanks for rating!" : "Couldn't save your rating — try again.", ok ? "mint" : "rose");
  };

  const title = mode === "verify" ? (r.verified ? "Verified!" : r.success ? "Not quite" : "Test failed") : r.success ? "Escaped!" : timeout ? "Out of time" : "You fell";

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-black/55 backdrop-blur-[3px] animate-fade">
      <div className="flex min-h-full items-center justify-center p-4 py-[max(1rem,env(safe-area-inset-top))]">
        <div className="panel w-full max-w-lg rounded-3xl p-5 animate-pop sm:p-7">
          {/* banner */}
          <div className="text-center">
            {challenge && r.challengeOutcome && mode === "play" && (
              <div className="mb-3">
                {r.challengeOutcome === "win" && <Pill tone="mint">You beat {challenge.challenger}! 🏆</Pill>}
                {r.challengeOutcome === "tie" && <Pill tone="gold">Dead heat with {challenge.challenger}</Pill>}
                {r.challengeOutcome === "lose" && <Pill tone="rose">{fmtTime(r.timeMs - challenge.target, true)} behind {challenge.challenger}</Pill>}
                {r.challengeOutcome === "ineligible" && <Pill>{challenge.goal === "full" ? "Full clear needs all 3 tokens" : "Not eligible for this challenge"}</Pill>}
              </div>
            )}
            <h2 className={`pixel-text text-5xl text-shadow-hard ${r.success && (mode !== "verify" || r.verified) ? "gold-text" : "text-rose-400"}`}>{title}</h2>
            {!r.success && <p className="mt-1 text-ink-300">{timeout ? "The 3-minute limit ran out." : `Taken down by ${CAUSE[r.cause] ?? "the dungeon"}.`}</p>}
            {mode === "verify" && r.success && !r.verified && <p className="mt-1 text-ink-300">Collect the key and all 3 tokens without pausing to verify.</p>}
            {mode === "verify" && r.verified && <p className="mt-1 text-mint-400">Your dungeon is beatable. You can publish it now.</p>}
          </div>

          {/* time */}
          <div className="mt-5 flex flex-col items-center">
            <div className="pixel-text text-5xl tabular-nums text-white sm:text-6xl">{fmtTime(r.timeMs)}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Pill tone={r.tokens === 3 ? "gold" : "default"}>
                <Sprite name="ui_coin" size={14} /> {r.tokens}/3 treasure
              </Pill>
              <Pill tone={r.damage === 0 ? "mint" : "rose"}>
                <Sprite name="heart" size={14} /> {r.damage} damage
              </Pill>
              {r.practice && mode !== "verify" && <Pill tone="sky">Practice run</Pill>}
            </div>
            {r.newBest && <div className="pixel-text mt-3 animate-pop text-lg text-gold-300">★ New personal best! {r.prevBest !== null && <span className="text-mint-400">−{fmtTime(r.prevBest - r.timeMs, true)}</span>}</div>}
            {!r.newBest && r.success && r.prevBest !== null && mode === "play" && <div className="mt-3 text-sm text-ink-300">Best {fmtTime(r.prevBest, true)} · {r.timeMs >= r.prevBest ? `+${fmtTime(r.timeMs - r.prevBest, true)}` : ""}</div>}
          </div>

          {/* medals */}
          {mode !== "verify" && mode !== "replay" && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              <MedalSlot name="medal_escape" label="Escape" earned={r.medals.escape} isNew={r.newMedals.escape} delay={0} />
              <MedalSlot name="medal_treasure" label="Treasure" earned={r.medals.treasure} isNew={r.newMedals.treasure} delay={1} />
              <MedalSlot name="medal_flawless" label="Flawless" earned={r.medals.flawless} isNew={r.newMedals.flawless} delay={2} />
            </div>
          )}

          {/* rank */}
          {mode !== "verify" && mode !== "replay" && r.success && !r.practice && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              {r.pending ? (
                <>
                  <Spinner className="h-4 w-4" /> <span className="text-ink-300">Posting your time…</span>
                </>
              ) : rank ? (
                (
                  <span className="text-ink-200">
                    <b className="pixel-text text-gold-300">#{rank}</b> fastest escape{fullRank ? (
                      <>
                        {" · "}
                        <b className="pixel-text text-gold-300">#{fullRank}</b> full clear
                      </>
                    ) : null}
                    {daily ? " today" : ""}
                  </span>
                )
              ) : !online || !runId ? (
                <span className="text-ink-400">Couldn&apos;t post this time — check your connection.</span>
              ) : null}
            </div>
          )}

          {/* actions */}
          <div className="mt-6 grid gap-2">
            <div className="flex gap-2">
              <Button variant="primary" size="lg" className="flex-1" icon="ui_restart" onClick={onRetry}>
                {mode === "verify" && r.verified ? "Test again" : "Retry"}
              </Button>
              {onNext && r.success && mode !== "verify" && (
                <Button variant="mint" size="lg" className="flex-1" icon="ui_redo" onClick={onNext}>
                  Next
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mode === "play" && r.success && !r.practice && (
                <Button icon="ui_key" onClick={() => setSharing(true)} disabled={r.pending || !runId}>
                  Challenge
                </Button>
              )}
              {r.success && mode !== "replay" && (
                <Button icon="ui_play" onClick={() => setWatching(true)}>
                  Watch replay
                </Button>
              )}
              {mode === "play" && (
                <Button icon="medal_escape" onClick={() => navigate(`/d/${dungeon.versionId}${daily ? "?daily=1" : ""}`)}>
                  Leaderboard
                </Button>
              )}
              <Button variant="ghost" onClick={onExit} sound="back" className={mode === "play" && r.success && !r.practice ? "" : "col-span-2"}>
                {mode === "verify" ? "Back to editor" : "Back"}
              </Button>
            </div>
          </div>

          {/* rating */}
          {mode === "play" && dungeon.kind === "community" && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="text-center text-xs uppercase tracking-wider text-ink-400">How was this dungeon?</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["fun", "Fun", "token"],
                    ["clever", "Clever", "ui_key"],
                    ["frustrating", "Too frustrating", "spike_on"],
                  ] as const
                ).map(([v, label, icon]) => (
                  <button
                    key={v}
                    onClick={() => rate(v)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition hover:bg-white/5 ${rating === v ? "border-gold-400/60 bg-gold-400/10 text-gold-300" : "border-white/10 text-ink-300"}`}
                  >
                    <Sprite name={icon as SpriteName} size={22} />
                    {label}
                  </button>
                ))}
              </div>
              <button className="mx-auto mt-3 block text-xs text-ink-400 hover:text-ink-200" onClick={() => setReporting(true)}>
                Report this dungeon
              </button>
            </div>
          )}
        </div>
      </div>

      <ChallengeModal open={sharing} onClose={() => setSharing(false)} dungeon={dungeon} hasFull={r.tokens === 3 || (store.record(dungeon.versionId).bestFullMs ?? null) !== null} />
      <ReportModal open={reporting} onClose={() => setReporting(false)} dungeonId={dungeon.id} />
    </div>
  );
}

function MedalSlot({ name, label, earned, isNew, delay }: { name: SpriteName; label: string; earned: boolean; isNew: boolean; delay: number }) {
  return (
    <div className={`relative flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 ${earned ? "border-gold-400/30 bg-gold-400/5" : "border-white/5 bg-black/20"}`}>
      <div className={earned ? "animate-medal" : ""} style={{ animationDelay: `${0.3 + delay * 0.22}s` }}>
        <Sprite name={name} size={46} className={earned ? "" : "opacity-20 grayscale"} />
      </div>
      <div className={`text-xs font-medium ${earned ? "text-gold-300" : "text-ink-400"}`}>{label}</div>
      {isNew && <span className="pixel-text absolute -top-2 right-2 rounded-md bg-mint-500 px-1.5 text-[10px] text-ink-950 animate-pop">NEW</span>}
    </div>
  );
}

export function ChallengeModal({ open, onClose, dungeon, hasFull }: { open: boolean; onClose: () => void; dungeon: PlayDungeon; hasFull: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (goal: "escape" | "full") => {
    setBusy(goal);
    const c = await api.createChallenge(dungeon.versionId, goal);
    setBusy(null);
    if (!c) {
      toast(goal === "full" ? "Record a full-clear run first (no pausing)." : "Record an escape first (no pausing).", "rose");
      return;
    }
    const url = `${window.location.origin}/c/${c.code}`;
    await share(url, `I escaped "${dungeon.title}" in ${fmtTime(c.target, true)}${goal === "full" ? " with every token" : ""}. Can you beat me?`);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} label="Challenge a friend">
      <div className="pixel-text text-center text-2xl">Challenge a friend</div>
      <p className="mt-2 text-center text-sm text-ink-300">They&apos;ll race your ghost on this exact dungeon version. No sign-up needed.</p>
      <div className="mt-5 grid gap-2">
        <Button variant="primary" icon="medal_escape" onClick={() => go("escape")} disabled={!!busy}>
          {busy === "escape" ? <Spinner /> : "Beat my escape time"}
        </Button>
        <Button icon="medal_treasure" onClick={() => go("full")} disabled={!!busy || !hasFull}>
          {busy === "full" ? <Spinner /> : "Beat my full-clear time"}
        </Button>
        {!hasFull && <p className="text-center text-xs text-ink-400">Escape with all 3 tokens to unlock full-clear challenges.</p>}
      </div>
    </Modal>
  );
}

export function ReportModal({ open, onClose, dungeonId }: { open: boolean; onClose: () => void; dungeonId: string }) {
  const [reason, setReason] = useState<"name" | "exploit" | "misleading" | "other">("misleading");
  const [note, setNote] = useState("");
  return (
    <Modal open={open} onClose={onClose} label="Report dungeon">
      <div className="pixel-text text-xl">Report this dungeon</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(
          [
            ["name", "Inappropriate name"],
            ["exploit", "Exploit / bug"],
            ["misleading", "Misleading visuals"],
            ["other", "Something else"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} onClick={() => setReason(v)} className={`rounded-xl border px-3 py-2 text-sm ${reason === v ? "border-gold-400/60 bg-gold-400/10 text-gold-300" : "border-white/10 text-ink-300"}`}>
            {l}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 200))}
        placeholder="Optional details"
        className="mt-3 h-20 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-gold-400/50"
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={onClose} sound="back">
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await api.report(dungeonId, reason, note);
            toast(ok ? "Report sent. Thank you." : "Couldn't send — are you online?", ok ? "mint" : "rose");
            onClose();
          }}
        >
          Send report
        </Button>
      </div>
    </Modal>
  );
}


function ReplayOverlay({ dungeon, frames, label, onExit }: { dungeon: PlayDungeon; frames: string; label: string; onExit: () => void }) {
  return (
    <div className="fixed inset-0 z-[60]">
      <PlayScreen dungeon={dungeon} mode="replay" replay={{ frames, label }} onExit={onExit} />
    </div>
  );
}
