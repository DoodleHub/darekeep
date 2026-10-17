// Thin, typed wrapper around Supabase. Every call degrades gracefully when offline.
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { CURATED, findCurated } from "./game/levels";
import type { Difficulty, Dungeon, Layout } from "./game/types";

export interface Profile {
  id: string;
  display_name: string;
  is_guest: boolean;
  cosmetics: Record<string, number>;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  kind: Dungeon["kind"];
  difficulty: Difficulty;
  theme: number;
  creator: string;
  owner_id: string | null;
  version_id: string;
  version: number;
  layout: Layout;
  created_at: string;
  creator_time_ms: number | null;
  players: number;
  escapers: number;
  median_ms: number | null;
  fun: number;
  clever: number;
  frustrating: number;
}

export interface Stats {
  players: number;
  escapers: number;
  attempts: number;
  median_ms: number | null;
  difficulty: Difficulty;
  deaths: Array<[number, number]>;
  ratings: { fun: number; clever: number; frustrating: number };
  fastest: { run_id: number; time_ms: number; name: string } | null;
}

export interface BoardRow {
  rank: number;
  user_id: string;
  display_name: string;
  time_ms: number;
  run_id: number;
}

export interface ChallengeInfo {
  id: string;
  goal: "escape" | "full";
  target_ms: number;
  user_id: string;
  challenger: string;
  replay: string | null;
  dungeon: Dungeon;
}

/** The signed-in user, or null when signed out / offline. Never creates an account. */
export async function currentUser(): Promise<User | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

/** Friendlier text for the auth errors players actually hit. */
function authMessage(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/already registered|already exists/i.test(msg)) return "That email already has an account — sign in instead.";
  if (/password should be at least/i.test(msg)) return msg.replace(/^.*?(Password)/, "$1");
  if (/password should contain/i.test(msg)) return "Use a mix of lowercase, uppercase, a number and a symbol.";
  if (/weak|pwned|leaked/i.test(msg)) return "That password is too easy to guess — try a stronger one.";
  if (/rate limit/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  return msg;
}

async function ready() {
  const sb = supabase();
  const user = await currentUser();
  return sb && user ? { sb, user } : null;
}

export const api = {
  async profile(): Promise<Profile | null> {
    const c = await ready();
    if (!c) return null;
    const { data } = await c.sb.from("profiles").select("id, display_name, is_guest, cosmetics").eq("id", c.user.id).maybeSingle();
    return (data as Profile) ?? null;
  },

  async setDisplayName(name: string) {
    const c = await ready();
    if (!c) return false;
    const { error } = await c.sb.from("profiles").update({ display_name: name }).eq("id", c.user.id);
    return !error;
  },

  async setCosmetics(cosmetics: Record<string, number>) {
    const c = await ready();
    if (!c) return;
    await c.sb.from("profiles").update({ cosmetics }).eq("id", c.user.id);
  },

  async browse(kind: string, sort: string, owner?: string): Promise<Card[] | null> {
    const sb = supabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc("browse_dungeons", {
      p_kind: kind,
      p_sort: sort,
      p_limit: 40,
      p_owner: owner ?? null,
    });
    if (error) return null;
    return data as Card[];
  },

  /** Resolve a version id to a playable dungeon (curated ones resolve locally first). */
  async dungeon(versionId: string): Promise<(Dungeon & { creatorTimeMs?: number | null; ownerId?: string | null }) | null> {
    const local = findCurated(versionId);
    if (local) return local;
    const sb = supabase();
    if (!sb) return null;
    const { data } = await sb
      .from("dungeon_versions")
      .select("id, version, layout, creator_time_ms, dungeon:dungeons!dungeon_versions_dungeon_id_fkey(id, title, description, kind, difficulty, owner_id, owner:profiles(display_name))")
      .eq("id", versionId)
      .maybeSingle();
    if (!data) return null;
    const d = data as unknown as {
      id: string;
      layout: Layout;
      creator_time_ms: number | null;
      dungeon: { id: string; title: string; description: string; kind: Dungeon["kind"]; difficulty: Difficulty | null; owner_id: string | null; owner: { display_name: string } | null };
    };
    return {
      id: d.dungeon.id,
      versionId: d.id,
      title: d.dungeon.title,
      description: d.dungeon.description,
      creator: d.dungeon.owner?.display_name ?? "Darekeep",
      kind: d.dungeon.kind,
      difficulty: d.dungeon.difficulty ?? "Unrated",
      layout: d.layout,
      creatorTimeMs: d.creator_time_ms,
      ownerId: d.dungeon.owner_id,
    };
  },

  async recordRun(run: {
    versionId: string;
    success: boolean;
    timeMs: number;
    tokens: number;
    damage: number;
    practice: boolean;
    daily: string | null;
    death?: [number, number] | null;
    cause?: string;
    replay?: string | null;
  }): Promise<number | null> {
    const c = await ready();
    if (!c) return null;
    const { data, error } = await c.sb
      .from("runs")
      .insert({
        version_id: run.versionId,
        success: run.success,
        time_ms: Math.min(180000, Math.max(0, run.timeMs)),
        tokens: run.tokens,
        damage: Math.min(3, run.damage),
        practice: run.practice,
        daily_date: run.daily,
        death_x: run.death ? Math.min(16, Math.max(0, run.death[0])) : null,
        death_y: run.death ? Math.min(12, Math.max(0, run.death[1])) : null,
        death_cause: run.cause?.slice(0, 16) ?? null,
        replay: run.success && !run.practice ? run.replay ?? null : null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[darekeep] run not recorded", error.message);
      return null;
    }
    return (data as { id: number }).id;
  },

  async leaderboard(versionId: string, board: "escape" | "full", daily?: string | null): Promise<BoardRow[] | null> {
    const sb = supabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc("leaderboard", { p_version: versionId, p_board: board, p_daily: daily ?? null, p_limit: 20 });
    if (error) return null;
    return data as BoardRow[];
  },

  async rank(versionId: string, board: "escape" | "full", timeMs: number, daily?: string | null): Promise<number | null> {
    const sb = supabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc("leaderboard_rank", { p_version: versionId, p_board: board, p_time: timeMs, p_daily: daily ?? null });
    if (error) return null;
    return data as number;
  },

  async stats(versionId: string): Promise<Stats | null> {
    const sb = supabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc("dungeon_stats", { p_version: versionId });
    if (error || !data) return null;
    return data as Stats;
  },

  async myRecords() {
    const c = await ready();
    if (!c) return null;
    const { data } = await c.sb.rpc("my_records");
    return data as Array<{ version_id: string; attempts: number; best_ms: number | null; best_full_ms: number | null; escaped: boolean; treasure: boolean; flawless: boolean }> | null;
  },

  async progress() {
    const c = await ready();
    if (!c) return null;
    const { data } = await c.sb.rpc("my_progress");
    return data as {
      xp: number;
      escapes: number;
      treasures: number;
      flawless: number;
      dailies: number;
      creator_players: number;
      creator_completions: number;
      creator_likes: number;
    } | null;
  },

  async playerBests(versionId: string, users: string[]) {
    const sb = supabase();
    if (!sb || !users.length) return [];
    const { data } = await sb.rpc("player_bests", { p_version: versionId, p_users: users });
    return (data ?? []) as Array<{ user_id: string; display_name: string; best_ms: number | null; best_full_ms: number | null }>;
  },

  async rate(dungeonId: string, rating: "fun" | "clever" | "frustrating") {
    const c = await ready();
    if (!c) return false;
    const { error } = await c.sb.from("ratings").upsert({ dungeon_id: dungeonId, user_id: c.user.id, rating, created_at: new Date().toISOString() });
    return !error;
  },

  async report(dungeonId: string, reason: "name" | "exploit" | "misleading" | "other", note: string) {
    const c = await ready();
    if (!c) return false;
    const { error } = await c.sb.from("reports").insert({ dungeon_id: dungeonId, reason, note: note.slice(0, 200) });
    return !error;
  },

  async bestRun(versionId: string, goal: "escape" | "full") {
    const c = await ready();
    if (!c) return null;
    let q = c.sb
      .from("runs")
      .select("id, time_ms")
      .eq("user_id", c.user.id)
      .eq("version_id", versionId)
      .eq("success", true)
      .eq("practice", false);
    if (goal === "full") q = q.eq("tokens", 3);
    const { data } = await q.order("time_ms").limit(1).maybeSingle();
    return data as { id: number; time_ms: number } | null;
  },

  async createChallenge(versionId: string, goal: "escape" | "full") {
    const c = await ready();
    if (!c) return null;
    const best = await api.bestRun(versionId, goal);
    if (!best) return null;
    const { data, error } = await c.sb
      .from("challenges")
      .insert({ version_id: versionId, goal, target_ms: best.time_ms, run_id: best.id })
      .select("id")
      .single();
    if (error) return null;
    return { code: (data as { id: string }).id, target: best.time_ms };
  },

  async challenge(code: string): Promise<ChallengeInfo | null> {
    const sb = supabase();
    if (!sb) return null;
    const { data } = await sb
      .from("challenges")
      .select("id, goal, target_ms, user_id, version_id, challenger:profiles(display_name), run:runs(replay)")
      .eq("id", code)
      .maybeSingle();
    if (!data) return null;
    const c = data as unknown as {
      id: string;
      goal: "escape" | "full";
      target_ms: number;
      user_id: string;
      version_id: string;
      challenger: { display_name: string } | null;
      run: { replay: string | null } | null;
    };
    const dungeon = await api.dungeon(c.version_id);
    if (!dungeon) return null;
    return {
      id: c.id,
      goal: c.goal,
      target_ms: c.target_ms,
      user_id: c.user_id,
      challenger: c.challenger?.display_name ?? "A friend",
      replay: c.run?.replay ?? null,
      dungeon,
    };
  },

  async runReplay(runId: number) {
    const sb = supabase();
    if (!sb) return null;
    const { data } = await sb.from("runs").select("replay, time_ms, version_id, user:profiles(display_name)").eq("id", runId).maybeSingle();
    return data as unknown as { replay: string | null; time_ms: number; version_id: string; user: { display_name: string } | null } | null;
  },

  async publish(p: { dungeonId: string | null; title: string; description: string; layout: Layout; hash: string; timeMs: number | null; replay: string | null }) {
    const c = await ready();
    if (!c) return { error: "Your session ended — sign in again." } as const;
    const { data, error } = await c.sb.rpc("publish_dungeon", {
      p_dungeon_id: p.dungeonId,
      p_title: p.title,
      p_description: p.description,
      p_layout: p.layout,
      p_hash: p.hash,
      p_time_ms: p.timeMs,
      p_replay: p.replay,
    });
    if (error) return { error: error.message } as const;
    return { data: data as { dungeon_id: string; version_id: string; version: number; new_version: boolean } } as const;
  },

  async deleteDungeon(id: string) {
    const c = await ready();
    if (!c) return false;
    const { error } = await c.sb.from("dungeons").delete().eq("id", id);
    return !error;
  },

  // ---- accounts (email + password) ----
  async signUp(email: string, password: string, displayName: string): Promise<string | null> {
    const sb = supabase();
    if (!sb) return "Can't reach the server right now.";
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return authMessage(error.message);
    if (!data.session) return "Account created, but no session came back. Is email confirmation enabled?";
    // the profile row is created by a database trigger; give it the chosen name
    const name = displayName.trim();
    if (name.length >= 2) await sb.from("profiles").update({ display_name: name.slice(0, 20) }).eq("id", data.session.user.id);
    return null;
  },
  async signIn(email: string, password: string): Promise<string | null> {
    const sb = supabase();
    if (!sb) return "Can't reach the server right now.";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? authMessage(error.message) : null;
  },
  async signOut() {
    const sb = supabase();
    if (!sb) return;
    await sb.auth.signOut();
  },
  onAuth(fn: () => void) {
    const sb = supabase();
    if (!sb) return () => {};
    const { data } = sb.auth.onAuthStateChange(() => fn());
    return () => data.subscription.unsubscribe();
  },
};

export const curatedCards = (kind: Dungeon["kind"]) => CURATED.filter((d) => d.kind === kind);
