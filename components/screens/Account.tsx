"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { audio } from "@/lib/audio";
import { useSession } from "@/lib/hooks";
import { Button, Sprite, Spinner, toast } from "../ui";
import { DungeonPreview } from "../DungeonPreview";
import { CURATED } from "@/lib/game/levels";
import { TAGLINE } from "@/lib/game/constants";

type Mode = "signin" | "signup";

// Mirrors the project's password policy (lower, upper, digit, symbol) so players see it before submitting.
const RULES: Array<{ label: string; test: (p: string) => boolean }> = [
  { label: "6+ characters", test: (p) => p.length >= 6 },
  { label: "lowercase", test: (p) => /[a-z]/.test(p) },
  { label: "uppercase", test: (p) => /[A-Z]/.test(p) },
  { label: "number", test: (p) => /\d/.test(p) },
  { label: "symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const HERO = CURATED.find((d) => d.id === "c10")!;

/** The front door: nothing in Darekeep is reachable without an account. */
export function AuthScreen({ path }: { path: string }) {
  const challenge = path.startsWith("/c/");
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <DungeonPreview layout={HERO.layout} animate className="fixed inset-0 opacity-40 blur-[2px]" />
      <div className="fixed inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="text-center animate-rise">
          <Sprite name="key" size={56} className="mx-auto animate-float drop-shadow-[0_0_24px_rgba(255,210,80,0.55)]" />
          <h1 className="pixel-text mt-3 text-5xl text-white text-shadow-hard">
            DARE<span className="gold-text">KEEP</span>
          </h1>
          <p className="mt-2 text-ink-200">{challenge ? "A friend dared you to beat their time. Sign in to accept." : TAGLINE}</p>
        </div>
        <div className="panel rounded-3xl p-6 animate-pop">
          <AuthForm />
        </div>
      </main>
    </div>
  );
}

function AuthForm() {
  const session = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passOk = mode === "signin" ? password.length > 0 : RULES.every((r) => r.test(password));
  const nameOk = mode === "signin" || (name.trim().length >= 2 && name.trim().length <= 20);
  const canSubmit = emailOk && passOk && nameOk && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    const error = mode === "signin" ? await api.signIn(email.trim(), password) : await api.signUp(email.trim(), password, name);
    setBusy(false);
    if (error) {
      audio.play("invalid");
      setErr(error);
      return;
    }
    audio.play("medal");
    toast(mode === "signin" ? "Welcome back!" : "Welcome to Darekeep!", "mint", "medal_escape");
    session.refresh();
  };

  const field = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none transition focus:border-gold-400/60";

  return (
    <>
      <div className="flex rounded-xl bg-black/30 p-1">
        {(
          [
            ["signin", "Sign in"],
            ["signup", "Create account"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErr(null);
            }}
            className={`pixel-text flex-1 rounded-lg py-2 text-sm transition ${mode === m ? "bg-white/10 text-white" : "text-ink-400 hover:text-ink-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-ink-300">
        {mode === "signin" ? "Welcome back, adventurer." : "Create an account to play, race your friends and build your own dungeons."}
      </p>

      {!session.online ? (
        <p className="mt-4 text-sm text-rose-400">Accounts need a connection to the server.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          {mode === "signup" && (
            <label className="grid gap-1">
              <span className="text-xs uppercase tracking-wider text-ink-400">Display name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="Shown on leaderboards"
                autoComplete="nickname"
                className={`pixel-text ${field}`}
              />
            </label>
          )}
          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-ink-400">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={field} autoFocus />
          </label>
          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-ink-400">Password</span>
            <span className="relative">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Create a strong password" : ""}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className={`${field} pr-16`}
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs text-ink-300 hover:bg-white/10">
                {show ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {mode === "signup" && (
            <ul className="-mt-1 flex flex-wrap gap-1.5" aria-label="Password requirements">
              {RULES.map((r) => {
                const ok = r.test(password);
                return (
                  <li key={r.label} className={`rounded-full border px-2 py-0.5 text-[11px] transition ${ok ? "border-mint-400/40 bg-mint-400/10 text-mint-400" : "border-white/10 text-ink-400"}`}>
                    {ok ? "✓ " : ""}
                    {r.label}
                  </li>
                );
              })}
            </ul>
          )}
          {err && (
            <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
              {err}
            </p>
          )}
          <Button type="submit" variant="primary" className="mt-1 w-full" disabled={!canSubmit}>
            {busy ? <Spinner /> : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
      )}
    </>
  );
}
