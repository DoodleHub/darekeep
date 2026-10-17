"use client";
import type { Difficulty, Layout } from "@/lib/game/types";
import type { LocalRecord } from "@/lib/store";
import { navigate } from "@/lib/router";
import { DIFF_TONE, Pill, Sprite, fmtTime } from "../ui";
import { DungeonPreview } from "../DungeonPreview";
import { Medals } from "../play/PlayScreen";

export function DungeonCard({
  versionId,
  index,
  title,
  description,
  creator,
  difficulty,
  layout,
  record,
  players,
  escapers,
  median,
  fun,
  clever,
  highlight,
}: {
  versionId: string;
  index?: number;
  title: string;
  description: string;
  creator: string;
  difficulty: Difficulty;
  layout: Layout;
  record?: LocalRecord;
  players?: number;
  escapers?: number;
  median?: number | null;
  fun?: number;
  clever?: number;
  highlight?: boolean;
}) {
  const rate = players ? Math.round(((escapers ?? 0) / players) * 100) : null;
  return (
    <button
      onClick={() => navigate(`/d/${versionId}`)}
      className={`panel group flex flex-col overflow-hidden rounded-2xl text-left transition duration-200 hover:-translate-y-1 hover:border-white/25 ${highlight ? "ring-2 ring-gold-400/50" : ""}`}
    >
      <div className="relative">
        <DungeonPreview layout={layout} className="aspect-[18/14] w-full transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-transparent to-transparent" />
        {index !== undefined && (
          <span className="pixel-text absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur">{index}</span>
        )}
        {record?.escaped && (
          <span className="absolute right-3 top-3 rounded-lg bg-black/50 px-1.5 py-1 backdrop-blur">
            <Medals rec={record} size={18} />
          </span>
        )}
        {highlight && (
          <span className="pixel-text absolute bottom-3 left-3 rounded-md bg-gold-400 px-2 py-0.5 text-xs text-ink-950 animate-pulse-soft">NEXT UP</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="pixel-text truncate text-xl text-white">{title}</div>
            <div className="truncate text-xs text-ink-400">by {creator}</div>
          </div>
          <Pill tone={DIFF_TONE[difficulty]}>{difficulty}</Pill>
        </div>
        {description && <p className="line-clamp-2 text-sm text-ink-300">{description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-ink-300">
          {record?.bestMs != null && (
            <span className="flex items-center gap-1">
              <Sprite name="ui_timer" size={14} /> <b className="text-white">{fmtTime(record.bestMs, true)}</b>
            </span>
          )}
          {players !== undefined && players > 0 && (
            <>
              <span>{players} players</span>
              <span>{rate}% escape</span>
              {median != null && <span>~{fmtTime(median, true)}</span>}
            </>
          )}
          {(fun ?? 0) + (clever ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Sprite name="token" size={12} /> {fun} · <Sprite name="ui_key" size={12} /> {clever}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
