"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "@/lib/audio";
import { api } from "@/lib/api";
import { BUDGET, COST, GRID_H, GRID_W, LIMITS, SAFE_RADIUS } from "@/lib/game/constants";
import { costOf, counts, inBounds, launcherPath, layoutHash, validate } from "@/lib/game/dungeon";
import { Renderer, LINK_COLORS, THEMES, type EditorOverlay } from "@/lib/game/render";
import { World } from "@/lib/game/sim";
import { DECOR_KINDS, ENEMY_KINDS, TRAP_KINDS, type Dir, type Kind, type Layout, type Placed } from "@/lib/game/types";
import type { SpriteName } from "@/lib/game/atlas";
import { navigate } from "@/lib/router";
import { store, type Draft } from "@/lib/store";
import { useSession } from "@/lib/hooks";
import { THEME_UNLOCKS, levelFor } from "@/lib/progression";
import { Button, IconButton, Modal, Pill, Sprite, Spinner, fmtTime, toast } from "../ui";
import { PlayScreen } from "../play/PlayScreen";
import { ChallengeModal } from "../play/Results";

type Tool = Kind | "erase";

interface ToolDef {
  k: Tool;
  label: string;
  icon: SpriteName;
  cost: string;
  hint: string;
}

const GROUPS: Array<{ name: string; tools: ToolDef[] }> = [
  {
    name: "Required",
    tools: [
      { k: "start", label: "Start", icon: "ui_play", cost: "free", hint: "Where the hero spawns. Keep hazards 2+ tiles away." },
      { k: "key", label: "Key", icon: "key", cost: "free", hint: "Opens the exit." },
      { k: "exit", label: "Exit", icon: "exit_closed", cost: "free", hint: "Touch it with the key to escape." },
      { k: "token", label: "Token", icon: "token", cost: "free", hint: "Exactly 3 treasure tokens." },
    ],
  },
  {
    name: "Structure",
    tools: [
      { k: "wall", label: "Wall", icon: "wall", cost: `${COST.wall}`, hint: "Drag to paint walls." },
      { k: "lever", label: "Lever", icon: "lever_off", cost: `${COST.lever}`, hint: "Strike it to open its linked gates. Includes the first gate." },
      { k: "gate", label: "Gate", icon: "gate_closed", cost: `+${COST.extraGate}`, hint: "Blocks the way until its lever is hit. Uses the active link colour." },
    ],
  },
  {
    name: "Enemies",
    tools: [
      { k: "slime", label: "Slime", icon: "slime_0", cost: `${COST.slime}`, hint: "1 HP. Slowly chases within 5 tiles." },
      { k: "skeleton", label: "Skeleton", icon: "skel_idle", cost: `${COST.skeleton}`, hint: "2 HP. Aims, then fires arrows in line of sight." },
      { k: "charger", label: "Charger", icon: "charger_0", cost: `${COST.charger}`, hint: "2 HP. Telegraphs, then charges 5 tiles straight." },
    ],
  },
  {
    name: "Traps",
    tools: [
      { k: "spike", label: "Spikes", icon: "spike_on", cost: `${COST.spike}`, hint: "Safe 1s → warn 0.5s → up 1s. Click again to shift timing." },
      { k: "launcher", label: "Darts", icon: "launcher", cost: `${COST.launcher}`, hint: "Fires every 2s. Click again (or R) to rotate." },
    ],
  },
  {
    name: "Decor",
    tools: [
      { k: "torch", label: "Torch", icon: "torch", cost: "free", hint: "Warm light. No collision." },
      { k: "rubble", label: "Rubble", icon: "rubble", cost: "free", hint: "Decorative only." },
      { k: "chest", label: "Chest", icon: "chest", cost: "free", hint: "Decorative only." },
      { k: "moss", label: "Moss", icon: "floor_moss", cost: "free", hint: "Mossy floor tile." },
    ],
  },
];

const PAINTABLE = new Set<Tool>(["wall", "moss", "erase", "torch", "rubble"]);
const SINGLE = new Set<Kind>(["start", "key", "exit"]);

function cloneLayout(l: Layout): Layout {
  return { v: 1, theme: l.theme, objects: l.objects.map((o) => ({ ...o })) };
}

/** Try to apply a tool at a cell. Returns the new layout, or an error message. */
function applyTool(layout: Layout, tool: Tool, x: number, y: number, opt: { dir: Dir; offset: number; link: number }, dragging: boolean): Layout | string {
  if (!inBounds(x, y)) return "Outside the room";
  const objs = layout.objects;
  const existing = objs.find((o) => o.x === x && o.y === y);
  if (tool === "erase") {
    if (!existing) return "";
    return { ...layout, objects: objs.filter((o) => o !== existing) };
  }
  if (existing && existing.k === tool) {
    if (dragging) return "";
    const next = cloneLayout(layout);
    const t = next.objects.find((o) => o.x === x && o.y === y)!;
    if (tool === "launcher") t.d = (((t.d ?? 0) + 1) % 4) as Dir;
    else if (tool === "spike") t.o = ((t.o ?? 0) + 1) % 4;
    else if (tool === "lever" || tool === "gate") t.l = opt.link;
    else return "";
    return next;
  }
  if (existing && dragging) return "";
  let base = existing ? objs.filter((o) => o !== existing) : objs;
  if (SINGLE.has(tool)) base = base.filter((o) => o.k !== tool);
  if (tool === "lever") base = base.filter((o) => !(o.k === "lever" && (o.l ?? 0) === opt.link));
  const placed: Placed = { k: tool, x, y };
  if (tool === "launcher") {
    placed.d = opt.dir;
    placed.o = opt.offset;
  }
  if (tool === "spike") placed.o = opt.offset;
  if (tool === "lever" || tool === "gate") placed.l = opt.link;
  const next: Layout = { ...layout, objects: [...base, placed] };

  const c = counts(next);
  if (tool === "token" && next.objects.filter((o) => o.k === "token").length > 3) return "A dungeon has exactly 3 tokens";
  if (ENEMY_KINDS.has(tool) && c.enemies > LIMITS.enemies) return `Max ${LIMITS.enemies} enemies`;
  if (TRAP_KINDS.has(tool) && c.traps > LIMITS.traps) return `Max ${LIMITS.traps} traps`;
  if (tool === "gate" && next.objects.filter((o) => o.k === "gate" && (o.l ?? 0) === opt.link).length > LIMITS.gatesPerLever)
    return `A lever opens at most ${LIMITS.gatesPerLever} gates`;
  if (costOf(next) > BUDGET) return `Over budget (${costOf(next)}/${BUDGET})`;
  const start = next.objects.find((o) => o.k === "start");
  if (start) {
    const near = (o: Placed) => Math.max(Math.abs(o.x - start.x), Math.abs(o.y - start.y)) <= SAFE_RADIUS;
    if ((ENEMY_KINDS.has(tool) || TRAP_KINDS.has(tool)) && near(placed)) return "Too close to the start";
    if (tool === "start" && next.objects.some((o) => (ENEMY_KINDS.has(o.k) || TRAP_KINDS.has(o.k)) && near(o))) return "Hazards too close to that spot";
  }
  return next;
}

export function Editor({ draftId }: { draftId: string }) {
  const session = useSession();
  const initial = useMemo(() => store.get().drafts.find((d) => d.id === draftId) ?? null, [draftId]);
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [tool, setTool] = useState<Tool>("wall");
  const [dir, setDir] = useState<Dir>(0);
  const [offset, setOffset] = useState(0);
  const [link, setLink] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number; ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ versionId: string; newVersion: boolean } | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [highlight, setHighlight] = useState<Array<[number, number]> | null>(null);
  const [panel, setPanel] = useState<"tools" | "info">("tools");
  const undo = useRef<Layout[]>([]);
  const redo = useRef<Layout[]>([]);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: undo.current.length, redo: redo.current.length });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const painting = useRef<{ last: string; strokeStart: Layout } | null>(null);
  const level = levelFor(session.xp);

  useEffect(() => {
    if (!initial) navigate("/build", { replace: true });
  }, [initial]);

  const layout = draft?.layout ?? null;
  const issues = useMemo(() => (layout ? validate(layout) : []), [layout]);
  const hash = useMemo(() => (layout ? layoutHash(layout) : ""), [layout]);
  const verified = !!draft?.verified && draft.verified.hash === hash;
  const cost = layout ? costOf(layout) : 0;
  const cnt = layout ? counts(layout) : { enemies: 0, traps: 0, levers: 0, walls: 0 };
  const tokenCount = layout?.objects.filter((o) => o.k === "token").length ?? 0;

  // latest draft, updated synchronously so fast drag strokes never read a stale layout
  const latest = useRef<Draft | null>(initial);
  const updateDraft = useCallback((nd: Draft) => {
    latest.current = nd;
    setDraft(nd);
    store.saveDraft(nd);
  }, []);

  const commit = useCallback(
    (next: Layout, pushUndo = true) => {
      const d = latest.current;
      if (!d) return;
      if (pushUndo) {
        undo.current.push(d.layout);
        if (undo.current.length > 100) undo.current.shift();
        redo.current = [];
      }
      updateDraft({ ...d, layout: next, updatedAt: Date.now() });
      setHist({ undo: undo.current.length, redo: redo.current.length });
    },
    [updateDraft],
  );

  const doUndo = useCallback(() => {
    const d = latest.current;
    const prev = undo.current.pop();
    if (!prev || !d) return;
    redo.current.push(d.layout);
    audio.play("erase");
    commit(prev, false);
  }, [commit]);

  const doRedo = useCallback(() => {
    const d = latest.current;
    const next = redo.current.pop();
    if (!next || !d) return;
    undo.current.push(d.layout);
    audio.play("place");
    commit(next, false);
  }, [commit]);

  const startTest = () => {
    if (!latest.current) return;
    const problems = validate(latest.current.layout);
    if (problems.length) {
      audio.play("invalid");
      toast(problems[0].msg, "rose");
      setHighlight(problems.flatMap((i) => i.cells ?? []));
      return;
    }
    setTesting(true);
  };

  // ---------- canvas ----------
  const world = useMemo(() => (layout ? new World(layout) : null), [layout]);
  const overlay = useMemo<EditorOverlay | null>(() => {
    if (!layout) return null;
    const start = layout.objects.find((o) => o.k === "start");
    const levers = layout.objects.filter((o) => o.k === "lever");
    const links: EditorOverlay["links"] = [];
    for (const g of layout.objects.filter((o) => o.k === "gate")) {
      const lv = levers.find((l) => (l.l ?? 0) === (g.l ?? 0));
      if (lv) links.push({ from: [lv.x, lv.y], to: [g.x, g.y], l: g.l ?? 0 });
    }
    const bad = highlight ?? issues.flatMap((i) => i.cells ?? []);
    return {
      showGrid: true,
      hover,
      bad,
      safe: start ? { x: start.x, y: start.y } : null,
      launcherPaths: layout.objects.filter((o) => o.k === "launcher").map((o) => launcherPath(layout, o.x, o.y, (o.d ?? 0) as Dir)),
      links,
      selectedLink: tool === "lever" || tool === "gate" ? link : undefined,
    };
  }, [layout, hover, issues, highlight, tool, link]);

  const stateRef = useRef({ world, overlay });
  useEffect(() => {
    stateRef.current = { world, overlay };
  }, [world, overlay]);

  useEffect(() => {
    if (testing) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const r = new Renderer(canvas);
    rendererRef.current = r;
    const ro = new ResizeObserver(() => {
      const b = wrap.getBoundingClientRect();
      r.resize(b.width, b.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrap);
    let raf = 0;
    const loop = (t: number) => {
      const { world: w, overlay: o } = stateRef.current;
      if (w) r.render(w, 1, { overlay: o, time: t, follow: false });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    audio.setTrack("build");
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [testing]);

  // ---------- pointer ----------
  const cellFromEvent = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return rendererRef.current!.cellAt(e.clientX - rect.left, e.clientY - rect.top);
  };

  const tryApply = (x: number, y: number, dragging: boolean, t: Tool, pushUndo: boolean) => {
    const d = latest.current;
    if (!d) return;
    const res = applyTool(d.layout, t, x, y, { dir, offset, link }, dragging);
    if (typeof res === "string") {
      if (res && !dragging) {
        audio.play("invalid");
        toast(res, "rose");
      }
      return;
    }
    audio.play(t === "erase" ? "erase" : "place");
    setHighlight(null);
    commit(res, pushUndo);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    audio.unlock();
    const c = cellFromEvent(e);
    const d = latest.current;
    if (!inBounds(c.x, c.y) || !d) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const t: Tool = e.button === 2 ? "erase" : tool;
    if (PAINTABLE.has(t)) {
      // a whole drag stroke becomes one undo step (pushed on pointer up)
      painting.current = { last: `${c.x},${c.y}`, strokeStart: d.layout };
      tryApply(c.x, c.y, false, t, false);
    } else {
      painting.current = null;
      tryApply(c.x, c.y, false, t, true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = latest.current;
    if (!d || !rendererRef.current) return;
    const c = cellFromEvent(e);
    if (!inBounds(c.x, c.y)) {
      setHover(null);
      return;
    }
    const res = applyTool(d.layout, tool, c.x, c.y, { dir, offset, link }, false);
    setHover((h) => {
      const ok = typeof res !== "string" || res === "";
      return h && h.x === c.x && h.y === c.y && h.ok === ok ? h : { x: c.x, y: c.y, ok };
    });
    if (painting.current && e.buttons) {
      const key = `${c.x},${c.y}`;
      if (key !== painting.current.last) {
        painting.current.last = key;
        const t: Tool = e.buttons & 2 ? "erase" : tool;
        tryApply(c.x, c.y, true, t, false);
      }
    }
  };

  const onPointerUp = () => {
    const d = latest.current;
    if (painting.current && d && painting.current.strokeStart !== d.layout) {
      undo.current.push(painting.current.strokeStart);
      redo.current = [];
      syncHist();
    }
    painting.current = null;
  };

  // ---------- keyboard ----------
  useEffect(() => {
    if (testing) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyY") {
        e.preventDefault();
        doRedo();
      } else if (e.code === "KeyR") setDir((d) => (((d + 1) % 4) as Dir));
      else if (e.code === "KeyO") setOffset((o) => (o + 1) % 4);
      else if (e.code === "KeyL") setLink((l) => (l + 1) % 3);
      else if (e.code === "Delete" || e.code === "Backspace" || e.code === "KeyX") setTool("erase");
      else if (e.code === "KeyW") setTool("wall");
      else if (e.code === "KeyT" && !e.metaKey) {
        e.preventDefault();
        startTest();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!draft || !layout || !world) return null;

  if (testing) {
    return (
      <PlayScreen
        dungeon={{ id: draft.dungeonId ?? "draft", versionId: "draft", title: draft.title || "Untitled dungeon", description: "", creator: "You", kind: "community", layout }}
        mode="verify"
        onExit={() => setTesting(false)}
        onVerified={(r) => {
          updateDraft({ ...draft, verified: { hash, timeMs: r.timeMs, replay: r.replay } });
          if (!store.get().buildTutorialDone) store.update((s) => void (s.buildTutorialDone = true));
        }}
      />
    );
  }

  const selectedDef = GROUPS.flatMap((g) => g.tools).find((t) => t.k === tool);
  const checklist = [
    { done: layout.objects.some((o) => o.k === "start"), label: "Place a start" },
    { done: layout.objects.some((o) => o.k === "key") && layout.objects.some((o) => o.k === "exit"), label: "Place the key and exit" },
    { done: tokenCount === 3, label: "Hide 3 treasure tokens" },
    { done: cnt.enemies + cnt.traps > 0, label: "Add a few hazards" },
    { done: verified, label: "Beat it yourself (T)" },
    { done: !!draft.publishedVersionId && draft.verified?.hash === hash, label: "Publish & share" },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* top bar */}
      <header className="flex items-center gap-2 border-b border-white/5 bg-ink-900/70 px-3 py-2 backdrop-blur pt-[max(0.5rem,env(safe-area-inset-top))]">
        <IconButton icon="ui_undo" label="Back to my dungeons" onClick={() => navigate("/build")} size={38} />
        <input
          value={draft.title}
          placeholder="Untitled dungeon"
          maxLength={32}
          onChange={(e) => updateDraft({ ...draft, title: e.target.value })}
          className="pixel-text min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg text-white outline-none placeholder:text-ink-400 focus:bg-white/5"
        />
        <div className="hidden items-center gap-1 sm:flex">
          <IconButton icon="ui_undo" label="Undo (Ctrl+Z)" onClick={doUndo} size={36} disabled={!hist.undo} className="!bg-transparent" />
          <IconButton icon="ui_redo" label="Redo (Ctrl+Shift+Z)" onClick={doRedo} size={36} disabled={!hist.redo} className="!bg-transparent" />
        </div>
        <Button variant={verified ? "secondary" : "mint"} size="sm" icon="ui_play" onClick={startTest}>
          <span className="hidden sm:inline">{verified ? "Re-test" : "Test run"}</span>
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon="ui_key"
          disabled={!verified || issues.length > 0}
          onClick={() => {
            setPublishing(true);
          }}
        >
          Publish
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* palette (desktop) */}
        <aside className="scroll-thin hidden w-60 shrink-0 overflow-y-auto border-r border-white/5 bg-ink-900/40 p-3 lg:block">
          <Palette tool={tool} setTool={setTool} level={level} />
        </aside>

        {/* canvas */}
        <main className="relative min-h-0 flex-1">
          <div
            ref={wrapRef}
            className="absolute inset-0"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
            style={{ touchAction: "none", cursor: tool === "erase" ? "not-allowed" : "crosshair" }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />
          </div>
          {/* tool options strip */}
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2">
            <div className="panel pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl px-3 py-1.5 text-xs">
              {selectedDef && (
                <span className="flex items-center gap-1.5 whitespace-nowrap text-ink-200">
                  <Sprite name={selectedDef.icon} size={18} />
                  <b className="text-white">{selectedDef.label}</b>
                  <span className="hidden text-ink-400 md:inline">{selectedDef.hint}</span>
                </span>
              )}
              {tool === "erase" && <span className="whitespace-nowrap text-ink-200">Eraser — click or drag. Right-click erases with any tool.</span>}
              {tool === "launcher" && (
                <Seg label="Aim (R)" value={dir} options={["→", "↓", "←", "↑"]} onChange={(v) => setDir(v as Dir)} />
              )}
              {(tool === "spike" || tool === "launcher") && <Seg label="Timing (O)" value={offset} options={["0s", "+0.5", "+1", "+1.5"]} onChange={setOffset} />}
              {(tool === "lever" || tool === "gate") && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span className="text-ink-400">Link (L)</span>
                  {LINK_COLORS.map((c, i) => (
                    <button
                      key={c}
                      aria-label={`Link ${i + 1}`}
                      onClick={() => setLink(i)}
                      className={`h-5 w-5 rounded-full border-2 transition ${link === i ? "scale-110 border-white" : "border-transparent opacity-60"}`}
                      style={{ background: c }}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
        </main>

        {/* info panel (desktop) */}
        <aside className="scroll-thin hidden w-72 shrink-0 overflow-y-auto border-l border-white/5 bg-ink-900/40 p-4 lg:block">
          <InfoPanel
            {...{ cost, cnt, tokenCount, issues, verified, draft, checklist, level, layout }}
            onTheme={(t) => commit({ ...layout, theme: t })}
            onHighlight={setHighlight}
            onClear={() => {
              const keep = layout.objects.filter((o) => SINGLE.has(o.k));
              commit({ ...layout, objects: keep });
            }}
          />
        </aside>

        {/* mobile bottom sheet */}
        <div className="border-t border-white/5 bg-ink-900/80 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex items-center gap-1 px-2 pt-2">
            <button onClick={() => setPanel("tools")} className={`pixel-text rounded-lg px-3 py-1 text-sm ${panel === "tools" ? "bg-white/10 text-white" : "text-ink-400"}`}>
              Tools
            </button>
            <button onClick={() => setPanel("info")} className={`pixel-text flex items-center gap-1 rounded-lg px-3 py-1 text-sm ${panel === "info" ? "bg-white/10 text-white" : "text-ink-400"}`}>
              Budget {cost}/{BUDGET}
              {issues.length > 0 && <span className="h-2 w-2 rounded-full bg-rose-400" />}
            </button>
            <div className="ml-auto flex gap-1">
              <IconButton icon="ui_undo" label="Undo" onClick={doUndo} size={34} />
              <IconButton icon="ui_redo" label="Redo" onClick={doRedo} size={34} />
            </div>
          </div>
          <div className="scroll-thin max-h-[34dvh] overflow-y-auto p-2">
            {panel === "tools" ? (
              <Palette tool={tool} setTool={setTool} level={level} compact />
            ) : (
              <InfoPanel
                {...{ cost, cnt, tokenCount, issues, verified, draft, checklist, level, layout }}
                onTheme={(t) => commit({ ...layout, theme: t })}
                onHighlight={setHighlight}
                onClear={() => commit({ ...layout, objects: layout.objects.filter((o) => SINGLE.has(o.k)) })}
              />
            )}
          </div>
        </div>
      </div>

      <PublishModal
        key={publishing ? "open" : "closed"}
        open={publishing}
        draft={draft}
        hash={hash}
        onClose={() => setPublishing(false)}
        onDone={(nd, res) => {
          updateDraft(nd);
          setPublishing(false);
          setPublished(res);
        }}
      />
      <Modal open={!!published} onClose={() => setPublished(null)} label="Published">
        <div className="text-center">
          <Sprite name="exit_open" size={72} className="mx-auto animate-float" />
          <div className="pixel-text mt-2 text-3xl gold-text">{published?.newVersion ? "Published!" : "Updated!"}</div>
          <p className="mt-2 text-sm text-ink-300">
            {published?.newVersion
              ? "Your dungeon is live. Dare your friends to beat your time — they can play instantly, no sign-up."
              : "Cosmetic changes saved. Records and leaderboards were kept."}
          </p>
        </div>
        <div className="mt-5 grid gap-2">
          <Button variant="primary" icon="ui_key" onClick={() => setChallengeOpen(true)}>
            Challenge friends
          </Button>
          <Button icon="medal_escape" onClick={() => published && navigate(`/d/${published.versionId}`)}>
            View dungeon page
          </Button>
        </div>
      </Modal>
      {published && (
        <ChallengeModal
          open={challengeOpen}
          onClose={() => setChallengeOpen(false)}
          hasFull
          dungeon={{ id: draft.dungeonId ?? "", versionId: published.versionId, title: draft.title, description: draft.description, creator: "You", kind: "community", layout }}
        />
      )}
    </div>
  );
}

function Seg({ label, value, options, onChange }: { label: string; value: number; options: string[]; onChange: (v: number) => void }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="text-ink-400">{label}</span>
      <span className="flex rounded-lg bg-black/30 p-0.5">
        {options.map((o, i) => (
          <button
            key={o}
            onClick={() => {
              audio.play("click");
              onChange(i);
            }}
            className={`rounded-md px-2 py-0.5 tabular-nums transition ${value === i ? "bg-gold-400 text-ink-950" : "text-ink-300 hover:text-white"}`}
          >
            {o}
          </button>
        ))}
      </span>
    </span>
  );
}

function Palette({ tool, setTool, compact, level }: { tool: Tool; setTool: (t: Tool) => void; compact?: boolean; level: number }) {
  void level;
  return (
    <div className={compact ? "flex gap-3 overflow-x-auto pb-1" : "grid gap-4"}>
      {GROUPS.map((g) => (
        <div key={g.name} className={compact ? "shrink-0" : ""}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{g.name}</div>
          <div className={compact ? "flex gap-1.5" : "grid grid-cols-2 gap-1.5"}>
            {g.tools.map((t) => (
              <ToolButton key={t.k} t={t} active={tool === t.k} onClick={() => setTool(t.k)} compact={compact} />
            ))}
          </div>
        </div>
      ))}
      <div className={compact ? "shrink-0" : ""}>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Tools</div>
        <ToolButton t={{ k: "erase", label: "Eraser", icon: "ui_trash", cost: "", hint: "Click or drag to remove. Shortcut X." }} active={tool === "erase"} onClick={() => setTool("erase")} compact={compact} />
      </div>
    </div>
  );
}

function ToolButton({ t, active, onClick, compact }: { t: ToolDef; active: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      title={t.hint}
      onPointerEnter={() => audio.play("hover")}
      onClick={() => {
        audio.unlock();
        audio.play("click");
        onClick();
      }}
      className={`group relative flex items-center gap-2 rounded-xl border text-left transition ${compact ? "h-14 w-16 flex-col justify-center gap-0.5 px-1" : "px-2 py-1.5"} ${
        active ? "border-gold-400/70 bg-gold-400/10 shadow-[0_0_0_3px_rgba(255,211,74,0.12)]" : "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
      }`}
    >
      <Sprite name={t.icon} size={compact ? 26 : 28} className="transition group-hover:scale-110" />
      <span className={`min-w-0 ${compact ? "text-[10px]" : "text-xs"}`}>
        <span className="block truncate font-medium text-ink-200">{t.label}</span>
        {!compact && t.cost && <span className="block text-[10px] text-ink-400">{t.cost === "free" ? "free" : `${t.cost} pts`}</span>}
      </span>
    </button>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(1, value / max);
  const tone = value > max ? "bg-rose-400" : pct > 0.85 ? "bg-gold-400" : "bg-mint-400";
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-ink-300">{label}</span>
        <span className={`tabular-nums ${value > max ? "text-rose-400" : "text-ink-200"}`}>
          {value}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div className={`h-full rounded-full transition-all duration-300 ${tone}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function InfoPanel({
  cost,
  cnt,
  tokenCount,
  issues,
  verified,
  draft,
  checklist,
  level,
  layout,
  onTheme,
  onHighlight,
  onClear,
}: {
  cost: number;
  cnt: { enemies: number; traps: number; levers: number };
  tokenCount: number;
  issues: ReturnType<typeof validate>;
  verified: boolean;
  draft: Draft;
  checklist: Array<{ done: boolean; label: string }>;
  level: number;
  layout: Layout;
  onTheme: (t: number) => void;
  onHighlight: (c: Array<[number, number]> | null) => void;
  onClear: () => void;
}) {
  const showGuide = !store.get().buildTutorialDone;
  return (
    <div className="grid gap-5">
      <section className="grid gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="pixel-text text-lg">Budget</span>
          <span className="pixel-text text-2xl tabular-nums text-gold-300">
            {cost}
            <span className="text-sm text-ink-400">/{BUDGET}</span>
          </span>
        </div>
        <Meter label="Points" value={cost} max={BUDGET} />
        <Meter label="Enemies" value={cnt.enemies} max={LIMITS.enemies} />
        <Meter label="Traps" value={cnt.traps} max={LIMITS.traps} />
        <Meter label="Lever systems" value={cnt.levers} max={LIMITS.levers} />
        <Meter label="Treasure tokens" value={tokenCount} max={3} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="pixel-text">Status</span>
          {verified ? <Pill tone="mint">Verified {draft.verified && fmtTime(draft.verified.timeMs, true)}</Pill> : issues.length ? <Pill tone="rose">{issues.length} issue{issues.length > 1 ? "s" : ""}</Pill> : <Pill tone="gold">Needs a test run</Pill>}
        </div>
        {issues.length > 0 ? (
          <ul className="grid gap-1.5">
            {issues.map((i, n) => (
              <li key={n}>
                <button
                  onMouseEnter={() => onHighlight(i.cells ?? null)}
                  onMouseLeave={() => onHighlight(null)}
                  onClick={() => onHighlight(i.cells ?? null)}
                  className="w-full rounded-lg border border-rose-400/20 bg-rose-400/5 px-2.5 py-1.5 text-left text-xs text-rose-300 hover:bg-rose-400/10"
                >
                  {i.msg}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-300">
            {verified ? "Beaten with all treasure — ready to publish." : "Layout is valid. Beat it yourself (key + all 3 tokens, no pausing) to unlock publishing."}
          </p>
        )}
      </section>

      {showGuide && (
        <section className="rounded-2xl border border-gold-400/20 bg-gold-400/5 p-3">
          <div className="pixel-text mb-2 text-gold-300">Builder&apos;s guide</div>
          <ol className="grid gap-1 text-xs">
            {checklist.map((c) => (
              <li key={c.label} className={`flex items-center gap-2 ${c.done ? "text-mint-400" : "text-ink-200"}`}>
                <span className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] ${c.done ? "border-mint-400 bg-mint-400 text-ink-950" : "border-white/20"}`}>{c.done ? "✓" : ""}</span>
                {c.label}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <div className="pixel-text mb-2">Theme</div>
        <div className="grid grid-cols-4 gap-1.5">
          {THEMES.map((t, i) => {
            const locked = level < THEME_UNLOCKS[i];
            return (
              <button
                key={t.name}
                disabled={locked}
                onClick={() => onTheme(i)}
                title={locked ? `Unlocks at Explorer level ${THEME_UNLOCKS[i]}` : t.name}
                className={`relative h-12 rounded-xl border text-[10px] transition ${layout.theme === i ? "border-gold-400" : "border-white/10"} ${locked ? "opacity-40" : "hover:scale-105"}`}
                style={{ background: `linear-gradient(135deg, rgb(${t.fog.join(",")}), ${t.tint ?? "#2a3050"})` }}
              >
                <span className="absolute inset-x-0 bottom-1 text-center text-white/80">{locked ? `Lv ${THEME_UNLOCKS[i]}` : t.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-2 text-xs text-ink-400">
        <div>
          Shortcuts: <b className="text-ink-300">W</b> wall · <b className="text-ink-300">X</b> eraser · <b className="text-ink-300">R</b> rotate · <b className="text-ink-300">O</b> timing · <b className="text-ink-300">L</b> link · <b className="text-ink-300">T</b> test
        </div>
        <Button size="sm" variant="ghost" icon="ui_trash" onClick={onClear}>
          Clear everything but start/key/exit
        </Button>
        <div className="text-[10px]">
          Grid {GRID_W}×{GRID_H} · draft saved on this device
        </div>
      </section>
    </div>
  );
}

function PublishModal({
  open,
  draft,
  hash,
  onClose,
  onDone,
}: {
  open: boolean;
  draft: Draft;
  hash: string;
  onClose: () => void;
  onDone: (d: Draft, r: { versionId: string; newVersion: boolean }) => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [desc, setDesc] = useState(draft.description);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = title.trim().length >= 3 && title.trim().length <= 32;
  const submit = async () => {
    if (!valid || !draft.verified) return;
    setBusy(true);
    setErr(null);
    const res = await api.publish({
      dungeonId: draft.dungeonId,
      title: title.trim(),
      description: desc.trim(),
      layout: draft.layout,
      hash,
      timeMs: draft.verified.timeMs,
      replay: draft.verified.replay,
    });
    if ("error" in res) {
      setBusy(false);
      setErr(res.error ?? "Couldn't publish");
      audio.play("invalid");
      return;
    }
    const d = res.data;
    if (d.new_version) {
      // the creator's verified run becomes their first eligible run on this version
      await api.recordRun({ versionId: d.version_id, success: true, timeMs: draft.verified.timeMs, tokens: 3, damage: 0, practice: false, daily: null, replay: draft.verified.replay });
    }
    const nd: Draft = { ...draft, title: title.trim(), description: desc.trim(), dungeonId: d.dungeon_id, publishedVersionId: d.version_id, updatedAt: Date.now() };
    store.saveDraft(nd);
    audio.play("publish");
    setBusy(false);
    onDone(nd, { versionId: d.version_id, newVersion: d.new_version });
  };
  return (
    <Modal open={open} onClose={onClose} label="Publish dungeon">
      <div className="pixel-text text-2xl">{draft.dungeonId ? "Publish update" : "Publish dungeon"}</div>
      <p className="mt-1 text-sm text-ink-300">
        {draft.dungeonId ? "Gameplay changes create a new version with fresh leaderboards. Old challenge links keep their version." : "Give it a name players will remember."}
      </p>
      <label className="mt-4 block text-xs uppercase tracking-wider text-ink-400">Name</label>
      <input
        value={title}
        maxLength={32}
        onChange={(e) => setTitle(e.target.value)}
        className="pixel-text mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-lg outline-none focus:border-gold-400/60"
        placeholder="The Spiky Gauntlet"
        autoFocus
      />
      <label className="mt-3 block text-xs uppercase tracking-wider text-ink-400">Short description</label>
      <textarea
        value={desc}
        maxLength={140}
        onChange={(e) => setDesc(e.target.value)}
        className="mt-1 h-20 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
        placeholder="A hint, a taunt, or a warning…"
      />
      <div className="text-right text-[10px] text-ink-400">{desc.length}/140</div>
      {err && <p className="mt-2 text-sm text-rose-400">{err}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={onClose} sound="back">
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!valid || busy}>
          {busy ? <Spinner /> : "Publish"}
        </Button>
      </div>
    </Modal>
  );
}

export function newDraft(from?: { layout: Layout; title?: string; description?: string; dungeonId?: string | null }): Draft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    dungeonId: from?.dungeonId ?? null,
    title: from?.title ?? "",
    description: from?.description ?? "",
    layout: from ? cloneLayout(from.layout) : { v: 1, theme: 0, objects: [{ k: "start", x: 1, y: 6 }, { k: "exit", x: 14, y: 6 }] },
    verified: null,
    updatedAt: Date.now(),
  };
}

export { DECOR_KINDS };
