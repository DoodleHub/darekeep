<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Darekeep

A top-down 2D action game where players build tiny dungeons and challenge each other to escape them. Rule of the game, shown in the UI: **Get the key. Reach the exit. Beat your best.**

Stack: Next.js 16 (App Router, Turbopack, `cacheComponents` on), React 19, Tailwind v4, TypeScript, Supabase (Auth + Postgres). Game rendering is Canvas 2D; audio is synthesized with WebAudio. No other runtime dependencies.

## Commands

```bash
npm run dev                                   # http://localhost:3000
npx next build                                # production build
node_modules/.bin/tsc --noEmit -p .           # typecheck
npx eslint .                                  # lint (React Compiler rules are on — see Conventions)
node_modules/.bin/jiti scripts/check-levels.ts  # validate every curated dungeon against the editor rules
node_modules/.bin/jiti scripts/sim-bot.ts       # bot plays every curated dungeon; checks replays are deterministic
node_modules/.bin/jiti scripts/seed-sql.ts > supabase/seed.sql  # regenerate curated-dungeon seed
```

Run `check-levels` and `sim-bot` after touching `lib/game/sim.ts`, `lib/game/dungeon.ts`, `lib/game/constants.ts` or `lib/game/levels.ts`.

## Architecture

The whole app is **one client component** mounted by an optional catch-all route, with its own History-API router. This keeps the game loop, audio context and sprite atlas alive across navigation (Next's `<Activity>` would otherwise keep hidden routes mounted).

- `app/[[...path]]/page.tsx` renders `<App />`. Don't add more `app/` routes for game screens; add a case to the switch in `components/App.tsx`.
- `lib/router.ts`: `navigate(path)` and `useLocation()`. Use these, not `next/navigation`.
- `components/App.tsx`: session provider, auth gate, routing, music per area.

### Routes (client-side)

| Path | Screen |
|---|---|
| `/` | Home: hero, daily challenge with UTC countdown, mode cards |
| `/adventure` | 10 curated dungeons |
| `/community` | Published dungeons (Fresh / Top rated / Most played) |
| `/d/:versionId` | Dungeon card: stats, leaderboards, friends' times, creator insights; `?daily=1` for daily boards |
| `/play/:versionId` | Play (`tutorial-v1` runs in tutorial mode) |
| `/c/:code` | Challenge landing; play against the challenger's ghost |
| `/replay/:runId` | Watch a recorded run |
| `/build`, `/build/:draftId` | Workshop list and the editor |
| `/me` | Profile, cosmetics, settings, sign out |

### Layout

```
lib/game/           pure game code (no React)
  constants.ts      all tuning: grid, tick rate, stats, timings, budget costs, limits
  types.ts          Layout / Placed / Kind / Dungeon
  dungeon.ts        cost, validation, reachability, layoutHash, ASCII level parser
  sim.ts            deterministic World simulation + events
  input.ts          13-bit input frames, replay encode/decode
  render.ts         Canvas renderer, FX, editor overlays, themes
  controls.ts       keyboard / mouse / touch / gamepad → InputFrame
  levels.ts         tutorial, adventure, daily pool (ASCII), daily rotation helpers
  atlas.ts          GENERATED sprite rects for public/game/atlas.webp
lib/audio.ts        SFX + 3 music tracks (title / dungeon / build), all synthesized
lib/api.ts          every Supabase call (typed, fail-soft)
lib/supabase.ts     browser client from NEXT_PUBLIC_* env
lib/store.ts        per-account localStorage cache (records, ghosts, drafts, settings)
lib/hooks.ts        useSave, useSession (SessionContext), useIsTouch
lib/progression.ts  XP → level, cosmetic unlock tables
components/
  App.tsx, ui.tsx (Sprite, Button, Modal, Toasts, fmtTime, share), DungeonPreview.tsx, VolumeSettings.tsx
  play/             PlayScreen (loop + HUD + overlays), Results, TouchControls, tutorial hints
  build/Editor.tsx  dungeon editor + publish flow
  screens/          Home, Adventure, Community, DungeonPage, ChallengePage, PlayRoute, BuildHome, Profile, TopBar, Account (AuthScreen)
supabase/migrations/  schema (source of truth for the DB)
supabase/seed.sql     curated dungeons (generated)
tools/              Python sprite slicer/packer (one-off asset pipeline)
```

## Game rules implemented (keep in sync with `constants.ts`)

- Grid is 16×12 interior tiles plus a fixed outer wall. Simulation is a fixed 60 Hz tick; the renderer interpolates.
- Player: 3 hearts, 1 damage per hit, 1 s protection after damage, no healing. Sword: 0.4 s cooldown, about 70° arc. Roll: 0.3 s long, protected for the first 0.2 s, 1.2 s cooldown. Movement is 8-directional, and diagonals are normalized.
- Enemies:
  - Slime: 1 HP, chases within 5 tiles using a BFS flow field.
  - Skeleton: 2 HP, needs line of sight within 8 tiles, aims for 0.7 s (direction locks at 0.5 s), then recovers for 1.5 s.
  - Charger: 2 HP, needs line of sight within 6 tiles, telegraphs for 0.8 s, charges up to 5 tiles and stops at walls, then recovers for 1 s.
- Traps:
  - Spikes: cycle of 1 s safe, 0.5 s warning, 1 s raised, with 4 phase offsets.
  - Dart launcher: fires every 2 s after a 0.5 s flash, aims in 4 directions, with 4 phase offsets.
  - Lever and gate: one lever opens up to 3 linked gates, permanently.
- A run is won by touching the exit while holding the key. The time limit is 3 minutes. Pausing turns the run into practice: it can't enter leaderboards, but medals still count.
- Medals: Escape, Treasure (all 3 tokens), Flawless (no damage). Boards: Fastest Escape and Full Clear, per dungeon version.
- Building: 100-point budget. Costs: wall 1, slime 5, skeleton 8, charger 10, spike 4, launcher 8, lever (including its first gate) 6, each extra gate 2. Limits: 8 enemies, 12 traps, 3 lever systems. Enemies and traps can't be within 2 tiles (Chebyshev distance) of the start, and darts can't fire into that area. The key, exit and tokens must be reachable (the flood fill opens gates once their lever is reached).
- Publishing requires the creator's own completion: key plus all 3 tokens, no pause, under 3 minutes. Gameplay edits create a new version with fresh boards; cosmetic edits (decor and theme) keep the current version.
- XP is granted per dungeon identity, not per version: first escape +20, Treasure medal +10, Flawless medal +10, each daily challenge completed +20. Each 100 XP is one level. Unlocks are cosmetic only.
- The daily dungeon is `DAILY_POOL[utcDay % 6]` and rolls over at 00:00 UTC.

## Hard constraints

- **Determinism.** Replays and ghosts re-simulate stored inputs. Inside `sim.ts` use only `+ - * /`, `Math.sqrt`, `Math.floor` and the rounded `AIM_TABLE`. Never use `Math.random`, `Date`, `atan2`, `sin` or `cos` in simulation logic; they're fine in the renderer and audio. Any change to sim behaviour or `constants.ts` changes outcomes, so existing replays and leaderboard times stop matching. Treat it as a balance change.
- **Curated dungeon ids** (`tutorial`, `c01`–`c10`, `d01`–`d06`, versions `<id>-v1`) are shared by the client (`levels.ts`) and the database seed. If you change a curated layout, regenerate and re-run `supabase/seed.sql`, and keep the layout valid (`check-levels`).
- **Sprites** come only from `public/game/atlas.webp`, built from `prompt-materials/*.png` (gitignored) by `tools/slice.py` and `tools/pack.py`. `lib/game/atlas.ts` is generated; regenerate it rather than hand-editing. Use `<Sprite name=…/>` in the UI and `Renderer.spr` on the canvas.
- **Auth is required for everything.** `App.tsx` renders `AuthScreen` until there's a session, and there is no guest mode. Don't add unauthenticated reads.
- **Per-account local cache.** `store.setOwner(userId)` scopes the localStorage key `dk.save.v2:<userId>`. The server is the source of truth for runs and XP; the local store gives instant best times and medals, ghost replays and drafts.

## Supabase

Project ref `nzdwvkvmcpultudluoqm`. The client uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Never use a secret or service key in the client.

**Auth:** email and password only. Email confirmation is off, so `signUp` returns a session immediately. The project enforces a password policy (lowercase, uppercase, digit, symbol); the sign-up form mirrors it in `RULES` in `components/screens/Account.tsx`. Anonymous sign-ins are not used.

**Tables** (all RLS-enabled; reads go to `authenticated` only):

| Table | Purpose / write rules |
|---|---|
| `profiles` | One per user, created by trigger `private.sync_profile` on `auth.users`. Users can update only `display_name` and `cosmetics` (column grants). `is_guest` is a legacy column, always false now. |
| `dungeons` | Owner's community dungeons. Curated ones have a null `owner_id` and a `kind` of curated / daily / tutorial. `current_version_id` is a composite FK to a version of the same dungeon. |
| `dungeon_versions` | Immutable gameplay. The trigger `freeze_version_gameplay` rejects gameplay changes; only `layout` decor can be updated. |
| `runs` | One row per attempt. Insert your own only. `daily_date` must equal today (UTC) or be null. `replay` is kept only for successful non-practice runs. |
| `ratings` | One per user per dungeon: fun / clever / frustrating. |
| `reports` | Insert-only. |
| `challenges` | Requires your own successful, non-practice run on that version with a matching time (and all 3 tokens for `full`). |

**RPCs** (all `security invoker`, `search_path = ''`): `leaderboard`, `leaderboard_rank`, `dungeon_stats` (difficulty labels need 30+ players; the creator's runs are excluded), `browse_dungeons`, `my_records`, `my_progress` (XP), `player_bests`, and `publish_dungeon` (creates a dungeon or a new version, or keeps the version on cosmetic-only edits). Helpers live in the unexposed `private` schema.

**Migrations** (applied, and recorded in the remote history):
`20261017181042_init_darekeep` → `20261017182000_advisor_fixes` → `20261017190000_require_auth`. For a fresh project, run them in order, then `supabase/seed.sql`.

**DB change rules:**
- New tables need explicit `GRANT`s; new public tables aren't exposed to the Data API automatically.
- Enable RLS on every table and scope policies `to authenticated` with an ownership predicate.
- Wrap `auth.uid()` and `auth.jwt()` as `(select auth.uid())`.
- Don't add `SECURITY DEFINER` functions in `public`.
- Write each change as a new migration file in `supabase/migrations/`, and run the Supabase advisors afterwards.

## Conventions

- **React Compiler lint rules are on.** Don't call setState synchronously in effects: key the result by request and derive "loading", or remount with `key`. Don't read or write `ref.current` during render. Don't mutate props: `Controls` exposes setter methods for this.
- **Per-frame values:** the HUD and game loop write to the DOM through refs (the timer, cooldowns); React state changes only on discrete events (hearts, tokens, key). Keep the loop allocation-light.
- **Modals** render through a portal to `document.body`, because `backdrop-filter` ancestors trap `position: fixed`.
- **Responsive:** on phones the camera follows the player when tiles would be smaller than 30 CSS px; touch controls are a floating move stick, an attack button that is also the aim stick, and a roll button. Respect safe-area insets and `prefers-reduced-motion` (plus the in-game reduced-motion and screen-shake toggles).
- **Audio** must be unlocked by a user gesture (`audio.unlock()`, already wired in `Button` and on the first pointer or key event). Add new sounds as cases in `AudioEngine.play`.
- **Fonts and colours:** Pixelify Sans for display (`pixel-text`), Space Grotesk for body. Use the theme tokens in `app/globals.css` (`ink-*`, `gold-*`, `mint-*`, `rose-*`, `sky-*`) and the `.panel` surface.
