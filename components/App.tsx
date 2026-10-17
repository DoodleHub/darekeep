"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, currentUser } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { audio } from "@/lib/audio";
import { SessionContext, type Session } from "@/lib/hooks";
import { navigate, useLocation } from "@/lib/router";
import { store } from "@/lib/store";
import { loadAtlas } from "@/lib/game/render";
import { Sprite, Toasts } from "./ui";
import { Home } from "./screens/Home";
import { Adventure } from "./screens/Adventure";
import { Community } from "./screens/Community";
import { DungeonPage } from "./screens/DungeonPage";
import { ChallengePage } from "./screens/ChallengePage";
import { BuildHome } from "./screens/BuildHome";
import { Profile } from "./screens/Profile";
import { PlayRoute, ReplayRoute } from "./screens/PlayRoute";
import { Editor } from "./build/Editor";
import { AuthScreen } from "./screens/Account";

export function App() {
  const loc = useLocation();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [state, setState] = useState<Omit<Session, "refresh">>({
    online: false,
    signedIn: false,
    loading: true,
    userId: null,
    profile: null,
    xp: 0,
    progress: null,
  });

  const refresh = useCallback(async () => {
    const user = await currentUser();
    store.setOwner(user?.id ?? null);
    if (!user) {
      setState({ online: !!supabase(), signedIn: false, loading: false, userId: null, profile: null, xp: 0, progress: null });
      return;
    }
    const [profile, progress] = await Promise.all([api.profile(), api.progress()]);
    // adopt cosmetics saved on the account (cross-device), otherwise keep local choices
    if (profile && profile.cosmetics && Object.keys(profile.cosmetics).length) {
      const c = profile.cosmetics;
      store.update((s) => {
        s.settings = { ...s.settings, outfit: c.outfit ?? s.settings.outfit, sword: c.sword ?? s.settings.sword, badge: c.badge ?? s.settings.badge };
      });
    }
    setState({
      online: true,
      signedIn: true,
      loading: false,
      userId: user.id,
      profile,
      xp: Math.max(progress?.xp ?? 0, store.localXp()),
      progress: progress ?? null,
    });
  }, []);

  useEffect(() => {
    // sprites first (they gate the first frame), then the session
    void loadAtlas()
      .catch(() => {})
      .then(() => refresh());
    const off = api.onAuth(() => void refresh());
    // unlock audio on the very first interaction anywhere
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      off();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [refresh]);

  const session = useMemo<Session>(() => ({ ...state, refresh: () => void refresh() }), [state, refresh]);

  // music follows the area of the app
  const path = loc.path;
  useEffect(() => {
    if (!mounted) return;
    if (!state.signedIn) return audio.setTrack("title");
    if (path.startsWith("/play") || path.startsWith("/c/") || path.startsWith("/replay")) return; // the play screen picks its own track
    audio.setTrack(path.startsWith("/build") ? "build" : "title");
  }, [path, mounted, state.signedIn]);

  if (!mounted || !loc.ready || state.loading) return <Splash />;
  if (!state.online) return <Unavailable />;
  // the whole app is behind sign-in; the URL is kept so the player lands where the link pointed
  if (!state.signedIn)
    return (
      <SessionContext.Provider value={session}>
        <AuthScreen path={path} />
        <Toasts />
      </SessionContext.Provider>
    );

  const seg = path.split("/").filter(Boolean);
  let screen: React.ReactNode;
  switch (seg[0]) {
    case undefined:
      screen = <Home />;
      break;
    case "adventure":
      screen = <Adventure />;
      break;
    case "community":
      screen = <Community />;
      break;
    case "d":
      screen = seg[1] ? <DungeonPage versionId={seg[1]} daily={loc.query.get("daily") === "1"} /> : null;
      break;
    case "play":
      screen = seg[1] ? <PlayRoute versionId={seg[1]} daily={loc.query.get("daily") === "1"} /> : null;
      break;
    case "c":
      screen = seg[1] ? <ChallengePage code={seg[1]} /> : null;
      break;
    case "replay":
      screen = seg[1] ? <ReplayRoute runId={Number(seg[1])} /> : null;
      break;
    case "build":
      screen = seg[1] ? <Editor key={seg[1]} draftId={seg[1]} /> : <BuildHome />;
      break;
    case "me":
      screen = <Profile />;
      break;
  }
  if (!screen) screen = <NotFound />;

  return (
    <SessionContext.Provider value={session}>
      <div key={seg.slice(0, 2).join("/")} className="min-h-dvh animate-rise">
        {screen}
      </div>
      <Toasts />
    </SessionContext.Provider>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4 animate-fade">
        <Sprite name="key" size={56} className="animate-float" />
        <div className="pixel-text text-2xl tracking-widest text-ink-300">DAREKEEP</div>
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <Sprite name="rubble" size={72} className="mx-auto" />
        <div className="pixel-text mt-4 text-3xl">Can&apos;t reach Darekeep</div>
        <p className="mt-2 text-ink-300">The game server isn&apos;t configured or reachable. Check your connection and try again.</p>
        <button className="pixel-text mt-6 text-gold-300 hover:underline" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <Sprite name="skel_dead" size={80} className="mx-auto" />
        <div className="pixel-text mt-4 text-3xl">Nothing down here</div>
        <p className="mt-2 text-ink-300">That passage collapsed. Let&apos;s get you back.</p>
        <button className="pixel-text mt-6 text-gold-300 hover:underline" onClick={() => navigate("/")}>
          Return to the entrance
        </button>
      </div>
    </div>
  );
}
