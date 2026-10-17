"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import { store } from "./store";
import type { Profile } from "./api";

export function useSave() {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface Session {
  /** the backend is configured and reachable (leaderboards, community, challenges can load) */
  online: boolean;
  /** an email/password account is signed in (times post, challenges, publishing) */
  signedIn: boolean;
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  xp: number;
  progress: {
    escapes: number;
    treasures: number;
    flawless: number;
    dailies: number;
    creator_players: number;
    creator_completions: number;
    creator_likes: number;
  } | null;
  refresh: () => void;
}

export const SessionContext = createContext<Session>({
  online: false,
  signedIn: false,
  loading: true,
  userId: null,
  profile: null,
  xp: 0,
  progress: null,
  refresh: () => {},
});

export const useSession = () => useContext(SessionContext);

export function useIsTouch() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia("(pointer: coarse)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}
