"use client";
// Minimal client router over the History API. The whole game is one client app so the
// audio context, sprite atlas and game loop survive navigation.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") window.addEventListener("popstate", emit);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const url = new URL(to, window.location.origin);
  if (url.pathname + url.search === window.location.pathname + window.location.search) return;
  if (opts.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.scrollTo({ top: 0 });
  emit();
}

export function back(fallback = "/") {
  if (typeof window !== "undefined" && window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back();
  else navigate(fallback);
}

function snapshot() {
  return window.location.pathname + window.location.search;
}

export function useLocation() {
  const href = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => "",
  );
  const url = new URL(href || "/", "http://x");
  return { path: url.pathname, query: url.searchParams, ready: href !== "" };
}
