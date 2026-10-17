"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "@/lib/audio";
import { DT, PLAYER, TAGLINE, TIME_LIMIT } from "@/lib/game/constants";
import { Controls } from "@/lib/game/controls";
import { decodeReplay, encodeReplay, pack, unpack } from "@/lib/game/input";
import { Renderer, SWORD_STYLES } from "@/lib/game/render";
import { World, type GameEvent } from "@/lib/game/sim";
import type { Dungeon } from "@/lib/game/types";
import { api } from "@/lib/api";
import { store } from "@/lib/store";
import { useIsTouch, useSession } from "@/lib/hooks";
import { OUTFITS } from "@/lib/progression";
import { Button, DIFF_TONE, IconButton, Modal, Pill, Sprite, fmtTime } from "../ui";
import { TouchControls } from "./TouchControls";
import { Results, type RunResult } from "./Results";
import { tutorialHint, type Hint } from "./tutorial";
import { VolumeSettings } from "../VolumeSettings";

export interface PlayDungeon extends Dungeon {
  ownerId?: string | null;
  creatorTimeMs?: number | null;
}

export interface ChallengeCtx {
  code: string;
  goal: "escape" | "full";
  target: number;
  challenger: string;
  userId: string;
  replay: string | null;
}

export type PlayMode = "play" | "verify" | "replay" | "tutorial";

type Phase = "ready" | "playing" | "paused" | "done";

interface Engine {
  world: World;
  ghost: World | null;
  ghostFrames: Uint16Array | null;
  replayFrames: Uint16Array | null;
  frames: number[];
  acc: number;
  last: number;
  practice: boolean;
  speed: number;
  finished: boolean;
}

export function PlayScreen({
  dungeon,
  mode,
  daily = null,
  challenge = null,
  replay = null,
  onExit,
  onVerified,
  onNext,
}: {
  dungeon: PlayDungeon;
  mode: PlayMode;
  daily?: string | null;
  challenge?: ChallengeCtx | null;
  replay?: { frames: string; label: string; timeMs?: number } | null;
  onExit: () => void;
  onVerified?: (r: { timeMs: number; replay: string }) => void;
  onNext?: () => void;
}) {
  const session = useSession();
  const isTouch = useIsTouch();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [controls] = useState(() => new Controls());
  const eng = useRef<Engine | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const [phase, setPhaseState] = useState<Phase>("ready");
  const [hud, setHud] = useState({ hp: PLAYER.hp, tokens: 0, key: false });
  const [result, setResult] = useState<RunResult | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const [speed, setSpeed] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<HTMLSpanElement>(null);
  const atkCdRef = useRef<HTMLDivElement>(null);
  const rollCdRef = useRef<HTMLDivElement>(null);
  const cooldowns = useRef({ atk: 0, roll: 0 });
  const record = store.record(dungeon.versionId);
  const settings = store.get().settings;

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ---------- build a fresh attempt ----------
  const initEngine = useCallback(() => {
    const world = new World(dungeon.layout);
    let ghost: World | null = null;
    let ghostFrames: Uint16Array | null = null;
    const ghostCode = mode === "play" ? challenge?.replay ?? (settings.ghost ? record.bestReplay : undefined) : undefined;
    if (ghostCode) {
      try {
        ghostFrames = decodeReplay(ghostCode);
        ghost = new World(dungeon.layout);
      } catch {
        ghost = null;
      }
    }
    let replayFrames: Uint16Array | null = null;
    if (mode === "replay" && replay) replayFrames = decodeReplay(replay.frames);
    eng.current = { world, ghost, ghostFrames, replayFrames, frames: [], acc: 0, last: performance.now(), practice: false, speed: 1, finished: false };
    rendererRef.current?.clearFx();
    controls.reset();
    phaseRef.current = "ready";
    audio.intensity = 0;
    audio.duck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon, mode, challenge, replay]);

  const reset = useCallback(() => {
    initEngine();
    setHud({ hp: PLAYER.hp, tokens: 0, key: false });
    setResult(null);
    setConfirmRestart(false);
    setHint(null);
    if (timerRef.current) timerRef.current.textContent = fmtTime(0);
    setPhase("ready");
  }, [initEngine, setPhase]);

  const start = useCallback(() => {
    const e = eng.current;
    if (!e || phaseRef.current !== "ready") return;
    audio.unlock();
    audio.play("go");
    e.world.begin();
    e.ghost?.begin();
    e.last = performance.now();
    e.acc = 0;
    controls.reset();
    rendererRef.current?.snapCamera(e.world);
    audio.intensity = 0.7;
    setAttempt((a) => a + 1);
    setPhase("playing");
  }, [controls, setPhase]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (eng.current && mode !== "replay") eng.current.practice = true;
    audio.play("pause");
    audio.duck(true);
    setPhase("paused");
  }, [mode, setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused" || !eng.current) return;
    eng.current.last = performance.now();
    controls.reset();
    audio.duck(false);
    setPhase("playing");
  }, [controls, setPhase]);

  const restart = useCallback(() => {
    audio.play("back");
    reset();
  }, [reset]);

  // ---------- finishing ----------
  const finish = useCallback(async () => {
    const e = eng.current!;
    if (e.finished) return;
    e.finished = true;
    const w = e.world;
    const success = w.status === "won";
    const replayCode = mode !== "replay" ? encodeReplay(e.frames) : replay?.frames ?? "";
    audio.intensity = 0;
    const base: RunResult = {
      success,
      timeMs: w.timeMs,
      tokens: w.tokensTaken,
      damage: w.damageTaken,
      practice: e.practice,
      cause: w.deathCause,
      replay: replayCode,
      medals: { escape: success, treasure: success && w.allTokens, flawless: success && w.damageTaken === 0 },
      newMedals: { escape: false, treasure: false, flawless: false },
      newBest: false,
      prevBest: record.bestMs,
      rank: null,
      fullRank: null,
      runId: null,
      challengeOutcome: null,
      verified: null,
      pending: mode !== "replay" && mode !== "verify",
    };

    if (mode === "replay") {
      setTimeout(() => {
        setResult(base);
        setPhase("done");
      }, 700);
      return;
    }

    if (mode === "verify") {
      const ok = success && w.allTokens && !e.practice && w.tick <= TIME_LIMIT;
      base.verified = ok;
      if (ok) onVerified?.({ timeMs: w.timeMs, replay: replayCode });
      setTimeout(() => {
        audio.duck(true);
        setResult(base);
        setPhase("done");
      }, success ? 900 : 1100);
      return;
    }

    // local records first: instant feedback, works offline
    const prev = store.record(dungeon.versionId);
    const applied = store.applyRun(dungeon.versionId, dungeon.id, {
      success,
      timeMs: w.timeMs,
      tokens: w.tokensTaken,
      damage: w.damageTaken,
      practice: e.practice,
      replay: replayCode,
      death: success ? undefined : [w.deathX, w.deathY],
      daily,
    });
    base.newBest = success && !e.practice && applied.newBest && prev.bestMs !== null;
    base.newMedals = {
      escape: base.medals.escape && !prev.escaped,
      treasure: base.medals.treasure && !prev.treasure,
      flawless: base.medals.flawless && !prev.flawless,
    };
    if (challenge) {
      const eligible = success && !e.practice && (challenge.goal === "escape" || w.allTokens);
      base.challengeOutcome = !eligible ? "ineligible" : w.timeMs < challenge.target ? "win" : w.timeMs === challenge.target ? "tie" : "lose";
    }
    if (mode === "tutorial" && success) store.update((s) => void (s.tutorialDone = true));

    setTimeout(() => {
      audio.duck(true);
      setResult({ ...base });
      setPhase("done");
    }, success ? 900 : 1100);

    // server sync in the background
    const runId = await api.recordRun({
      versionId: dungeon.versionId,
      success,
      timeMs: w.timeMs,
      tokens: w.tokensTaken,
      damage: w.damageTaken,
      practice: e.practice,
      daily,
      death: success ? null : [w.deathX, w.deathY],
      cause: w.deathCause,
      replay: replayCode,
    });
    let rank: number | null = null,
      fullRank: number | null = null;
    if (success && !e.practice && session.online) {
      [rank, fullRank] = await Promise.all([
        api.rank(dungeon.versionId, "escape", w.timeMs, daily),
        w.allTokens ? api.rank(dungeon.versionId, "full", w.timeMs, daily) : Promise.resolve(null),
      ]);
    }
    session.refresh();
    setResult((r) => (r ? { ...r, runId, rank, fullRank, pending: false } : { ...base, runId, rank, fullRank, pending: false }));
  }, [mode, replay, record.bestMs, onVerified, dungeon, daily, challenge, setPhase, session]);

  // ---------- event → audio ----------
  const playEvents = useCallback((events: GameEvent[], w: World) => {
    for (const ev of events) {
      switch (ev.t) {
        case "token":
          audio.play("token", Number(ev.s ?? 1));
          navigator.vibrate?.(10);
          break;
        case "hurt":
          audio.play("hurt");
          navigator.vibrate?.(40);
          if (w.player.hp === 1) audio.intensity = 1;
          break;
        case "spike":
          if (Math.hypot(ev.x - w.player.x, ev.y - w.player.y) < 5) audio.play("spike");
          break;
        case "step":
          audio.play("step");
          break;
        case "dart":
        case "arrow":
          if (Math.hypot(ev.x - w.player.x, ev.y - w.player.y) < 9) audio.play(ev.t);
          break;
        default:
          audio.play(ev.t as Parameters<typeof audio.play>[0]);
      }
    }
  }, []);

  // ---------- main loop ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    const outfit = OUTFITS[settings.outfit] ?? OUTFITS[0];
    renderer.setOutfit(outfit.hue);
    renderer.sword = SWORD_STYLES[settings.sword] ?? SWORD_STYLES[0];
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrap);
    controls.attach();
    initEngine();
    audio.setTrack("dungeon");

    let raf = 0;
    let lastHud = { hp: -1, tokens: -1, key: false };
    let hintTick = 0;
    const loop = (now: number) => {
      const e = eng.current;
      if (e) {
        const dt = Math.min(0.1, (now - e.last) / 1000);
        e.last = now;
        const ph = phaseRef.current;
        if (ph === "playing" && !e.world.done) {
          e.acc += dt * e.speed;
          let steps = 0;
          while (e.acc >= DT && steps < 8) {
            e.acc -= DT;
            steps++;
            const w = e.world;
            let input;
            if (e.replayFrames) {
              input = unpack(e.replayFrames[w.tick] ?? 0);
              if (w.tick >= e.replayFrames.length) {
                e.finished = false;
                void finish();
                break;
              }
            } else {
              const pc = renderer.toCss(w.player.x, w.player.y);
              input = controls.frame(pc);
              e.frames.push(pack(input));
            }
            w.step(input);
            if (e.ghost && e.ghostFrames && !e.ghost.done) {
              const gi = e.ghostFrames[e.ghost.tick];
              if (gi !== undefined) e.ghost.step(unpack(gi));
            }
            renderer.handleEvents(w.events, settings.reducedMotion || !settings.shake);
            playEvents(w.events, w);
            if (w.done) {
              void finish();
              break;
            }
          }
        } else if (ph !== "playing") e.acc = 0;

        const w = e.world;
        renderer.render(w, ph === "playing" ? Math.min(1, e.acc / DT) : 1, {
          ghost: e.ghost,
          follow: ph !== "ready",
          time: now,
          deaths: ph === "ready" && mode !== "replay" ? record.deaths.slice(-12) : undefined,
          reducedMotion: settings.reducedMotion,
        });

        // HUD (direct DOM for per-frame values, React state only on change)
        if (timerRef.current && ph !== "ready") timerRef.current.textContent = fmtTime(w.timeMs);
        const p = w.player;
        const atk = p.atkCd / PLAYER.attackCooldown,
          roll = p.rollCd / PLAYER.rollCooldown;
        cooldowns.current.atk = atk;
        cooldowns.current.roll = roll;
        atkCdRef.current?.style.setProperty("--p", String(atk));
        rollCdRef.current?.style.setProperty("--p", String(roll));
        const tk = w.tokensTaken;
        if (p.hp !== lastHud.hp || tk !== lastHud.tokens || w.key.taken !== lastHud.key) {
          lastHud = { hp: p.hp, tokens: tk, key: w.key.taken };
          setHud(lastHud);
        }
        if (mode === "tutorial" && ++hintTick % 15 === 0) {
          const h = tutorialHint(w);
          setHint((old) => (old?.id === h.id ? old : h));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.detach();
      document.removeEventListener("visibilitychange", onVis);
      audio.intensity = 0;
      audio.duck(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon.versionId, mode]);

  useEffect(() => {
    if (eng.current) eng.current.speed = speed;
  }, [speed]);

  // ---------- meta keys ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const ph = phaseRef.current;
      if (e.code === "Escape") {
        if (ph === "playing") pause();
        else if (ph === "paused") resume();
        else if (confirmRestart) setConfirmRestart(false);
      } else if (e.code === "KeyR" && !e.repeat) {
        if (ph === "done" || ph === "ready") restart();
        else if (confirmRestart) restart();
        else {
          setConfirmRestart(true);
          if (ph === "playing") pause();
        }
      } else if ((e.code === "Space" || e.code === "Enter") && ph === "ready") {
        e.preventDefault();
        start();
      } else if (e.code === "Enter" && confirmRestart) restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, resume, restart, start, confirmRestart]);

  // ---------- pointer → aim/attack ----------
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = canvasRef.current!.getBoundingClientRect();
    controls.pointerMove(e.clientX - r.left, e.clientY - r.top);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (phaseRef.current === "playing") controls.pointerDown(e.button);
  };
  useEffect(() => {
    const up = (e: PointerEvent) => controls.pointerUp(e.button);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [controls]);

  const target = challenge?.target ?? null;
  const pb = mode === "verify" ? null : record.bestMs;

  return (
    <div className="fixed inset-0 z-30 select-none overflow-hidden bg-ink-950">
      <div
        ref={wrapRef}
        className="absolute inset-0"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: phase === "playing" && !isTouch ? "crosshair" : "default", touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* ---------- HUD ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-[max(0.75rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="panel pointer-events-auto flex items-center gap-1 rounded-2xl px-2.5 py-2">
          {Array.from({ length: PLAYER.hp }, (_, i) => (
            <Sprite key={i} name={i < hud.hp ? "heart" : "heart_empty"} size={isTouch ? 22 : 26} className={i === hud.hp - 1 && hud.hp === 1 ? "animate-pulse" : ""} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="panel flex items-center gap-2 rounded-2xl px-4 py-1.5">
            <Sprite name="ui_timer" size={20} />
            <span ref={timerRef} className="pixel-text min-w-[6.5ch] text-xl tabular-nums text-white">
              {fmtTime(0)}
            </span>
          </div>
          <div className="hidden text-[11px] font-medium tracking-wide text-ink-300/90 sm:block">{TAGLINE}</div>
          {(target !== null || pb !== null) && phase !== "ready" && (
            <div className="flex gap-1.5">
              {target !== null && (
                <Pill tone="rose">
                  Target {fmtTime(target, true)}
                </Pill>
              )}
              {pb !== null && <Pill tone="gold">Best {fmtTime(pb, true)}</Pill>}
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className="panel flex items-center gap-2 rounded-2xl px-3 py-2">
            <Sprite name="ui_coin" size={20} />
            <span className="pixel-text text-lg tabular-nums">{hud.tokens}/3</span>
            <span className={`ml-1 transition ${hud.key ? "scale-110" : "opacity-30 grayscale"}`}>
              <Sprite name="ui_key" size={22} title={hud.key ? "Key collected" : "Key not found yet"} />
            </span>
          </div>
          {mode !== "replay" && phase === "playing" && <IconButton icon="ui_pause" label="Pause (Esc)" onClick={pause} size={44} />}
        </div>
      </div>

      {/* desktop cooldowns */}
      {!isTouch && phase === "playing" && mode !== "replay" && (
        <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex gap-2">
          <Cooldown ref={atkCdRef} icon="sword" label="Click" />
          <Cooldown ref={rollCdRef} icon="fx_dust" label="Space" />
        </div>
      )}

      {isTouch && phase === "playing" && mode !== "replay" && <TouchControls controls={controls} cooldowns={cooldowns} />}

      {/* tutorial coach */}
      {hint && mode === "tutorial" && phase === "playing" && (
        <div key={hint.id} className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-4 animate-rise sm:top-28">
          <div className="panel flex max-w-md items-center gap-3 rounded-2xl border-gold-400/30 px-4 py-3">
            <Sprite name={hint.icon} size={36} className="animate-float" />
            <div>
              <div className="pixel-text text-gold-300">{hint.title}</div>
              <div className="text-sm text-ink-200">{isTouch ? hint.body.touch : hint.body.keys}</div>
            </div>
          </div>
        </div>
      )}

      {/* replay controls */}
      {mode === "replay" && phase !== "ready" && (
        <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex justify-center">
          <div className="panel flex items-center gap-2 rounded-2xl px-3 py-2">
            <Pill tone="sky">REPLAY</Pill>
            <span className="max-w-[40vw] truncate text-sm text-ink-200">{replay?.label}</span>
            {[0.5, 1, 2].map((s) => (
              <Button key={s} size="sm" variant={speed === s ? "primary" : "ghost"} onClick={() => setSpeed(s)}>
                {s}×
              </Button>
            ))}
            <IconButton icon="ui_restart" label="Restart replay" onClick={restart} size={36} />
            <Button size="sm" variant="secondary" onClick={onExit} sound="back">
              Exit
            </Button>
          </div>
        </div>
      )}

      {/* ---------- ready ---------- */}
      {phase === "ready" && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center sm:bg-black/35">
          <div className="panel w-full max-w-lg rounded-3xl p-5 animate-rise sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {mode === "verify" ? <Pill tone="sky">Completion test</Pill> : mode === "replay" ? <Pill tone="sky">Replay</Pill> : daily ? <Pill tone="gold">Daily · {daily}</Pill> : null}
                  {dungeon.difficulty && mode !== "verify" && <Pill tone={DIFF_TONE[dungeon.difficulty]}>{dungeon.difficulty}</Pill>}
                </div>
                <h1 className="pixel-text mt-2 truncate text-3xl text-white text-shadow-hard sm:text-4xl">{dungeon.title}</h1>
                <div className="mt-0.5 text-sm text-ink-300">by {dungeon.creator}</div>
              </div>
              <IconButton icon="ui_undo" label="Back" onClick={onExit} size={40} />
            </div>
            {mode === "verify" ? (
              <p className="mt-4 text-sm leading-relaxed text-ink-200">
                Prove it&apos;s beatable: grab the <b className="text-gold-300">key</b> and <b className="text-gold-300">all 3 tokens</b>, then escape within 3 minutes. Pausing voids the test.
              </p>
            ) : mode === "replay" ? (
              <p className="mt-4 text-sm text-ink-200">{replay?.label}</p>
            ) : (
              dungeon.description && <p className="mt-3 text-sm leading-relaxed text-ink-200">{dungeon.description}</p>
            )}
            {mode !== "replay" && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Your best" value={fmtTime(pb, true)} />
                <Stat label={challenge ? `${challenge.challenger}` : "Attempts"} value={challenge ? fmtTime(challenge.target, true) : String(record.attempts)} tone={challenge ? "rose" : undefined} />
                <Stat label="Medals" value={<Medals rec={record} />} />
              </div>
            )}
            <div className="mt-5 flex items-center gap-3">
              <Button variant="primary" size="lg" className="flex-1" icon="ui_play" onClick={start} sound="none">
                {mode === "replay" ? "Watch" : attempt ? "Go again" : "Start"}
              </Button>
            </div>
            <div className="mt-3 text-center text-xs text-ink-400">
              {isTouch ? "Left thumb moves · sword swings (drag to aim) · cloud rolls" : "WASD move · Click / J attack · Space roll · Esc pause · R restart"}
            </div>
            {!isTouch && challenge?.replay && <div className="mt-1 text-center text-xs text-sky-400">Racing {challenge.challenger}&apos;s ghost</div>}
          </div>
        </div>
      )}

      {/* ---------- paused ---------- */}
      <Modal open={phase === "paused" && !confirmRestart} onClose={resume} label="Paused">
        <div className="pixel-text text-center text-3xl">Paused</div>
        <p className="mt-2 text-center text-sm text-ink-300">
          {mode === "verify" ? "Pausing voids this completion test — restart to try again." : "Paused runs count as practice: medals still count, leaderboards don't."}
        </p>
        <div className="mt-5 grid gap-2">
          <Button variant="primary" icon="ui_play" onClick={resume}>
            Resume
          </Button>
          <Button icon="ui_restart" onClick={restart}>
            Restart
          </Button>
          <Button variant="ghost" onClick={onExit} sound="back">
            Quit
          </Button>
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <VolumeSettings />
        </div>
      </Modal>

      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} label="Restart?">
        <div className="pixel-text text-center text-2xl">Restart this run?</div>
        <p className="mt-2 text-center text-sm text-ink-300">Press R again or Enter to confirm.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={() => setConfirmRestart(false)}>Cancel</Button>
          <Button variant="primary" icon="ui_restart" onClick={restart}>
            Restart
          </Button>
        </div>
      </Modal>

      {/* ---------- results ---------- */}
      {phase === "done" && result && (
        <Results
          result={result}
          dungeon={dungeon}
          mode={mode}
          daily={daily}
          challenge={challenge}
          online={session.online}
          onRetry={restart}
          onExit={onExit}
          onNext={onNext}
        />
      )}

      {isTouch && phase === "playing" && mode !== "replay" && (
        <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-20 z-10">
          <IconButton icon="ui_restart" label="Restart" onClick={() => setConfirmRestart(true)} size={38} />
        </div>
      )}
    </div>
  );
}

function Cooldown({ ref, icon, label }: { ref: React.Ref<HTMLDivElement>; icon: "sword" | "fx_dust"; label: string }) {
  return (
    <div className="panel relative grid h-14 w-14 place-items-center overflow-hidden rounded-2xl">
      <Sprite name={icon} size={30} />
      <div
        ref={ref}
        className="absolute inset-0"
        style={{ background: "conic-gradient(rgba(0,0,0,0.6) calc(var(--p, 0) * 360deg), transparent 0)" }}
      />
      <span className="absolute bottom-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-300">{label}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "rose" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-2 py-2.5">
      <div className="truncate text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`pixel-text mt-0.5 flex justify-center text-lg ${tone === "rose" ? "text-rose-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

export function Medals({ rec, size = 22 }: { rec: { escaped: boolean; treasure: boolean; flawless: boolean }; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      <Sprite name="medal_escape" size={size} className={rec.escaped ? "" : "opacity-20 grayscale"} title="Escape" />
      <Sprite name="medal_treasure" size={size} className={rec.treasure ? "" : "opacity-20 grayscale"} title="Treasure" />
      <Sprite name="medal_flawless" size={size} className={rec.flawless ? "" : "opacity-20 grayscale"} title="Flawless" />
    </span>
  );
}
