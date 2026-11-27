# Web-Based Canasta — Product Requirements Document (PRD v2.0)

> [!IMPORTANT]
> **Status:** All Phase 2 product decisions are locked via alignment interview. Once approved, this PRD will be synced to `docs/prd.md` and used to draft `sdd-phase2.md` for **Phase 2A** (`feat/phase-2a-multiseat`) and **Phase 2B** (`feat/phase-2b-lan-multiplayer`).

---

## 1. Product Vision & Phased Roadmap

Build a polished, browser-based **Canasta** card game with a classic green casino felt table, crisp vector playing cards, strict rules enforcement, automatic scoring, and a pure headless rules engine that scales smoothly from solo play to shared-device play, local multi-device rooms, and online multiplayer.

| Phase | Branch / PR | Status & Scope |
| :--- | :--- | :--- |
| **Phase 1** | `main` | **SHIPPED** — Browser-only 2-Player Bicycle Canasta, 3-tier Heuristic AI (`Easy` / `Normal` / `Hard`), 2P Pass-and-Play Privacy Shield, CC0 SVG deck, dynamic Rules & Scoring drawer, staged melds + Guided Take-Discard-Pile, newly-drawn green card glow, floating announcements, Web Audio sound effects, `localStorage` auto-save/resume, replay JSON export. |
| **Phase 2A** | `feat/phase-2a-multiseat` (PR #1) | **NEXT** — Generalize engine/AI to `teams: TeamState[]`; add **4-Player Partnership** (`2×2` with full binding *"Partner, may I go out?"*), **4-Player Cutthroat** (`4×1`), and **3-Player Cutthroat** (`3×1`); flexible human/bot seat configuration across all formats (both Solo-vs-Bots and multi-human Pass-and-Play Privacy Shield offline). |
| **Phase 2B** | `feat/phase-2b-lan-multiplayer` (PR #2) | **PLANNED** — Thin Node.js + Socket.IO server (`server/`) hosting `src/engine/` & `src/ai/`, room lobby with QR code & 4-letter codes, **10-foot TV-ready Shared Table + Phone-Hands** LAN companion mode (works immediately via Chrome Tab Cast to Google TV Streamer / AirPlay / HDMI), separate-device full-table play, and resilient reconnect tokens. |
| **Phase 3** | Future | Hosted internet multiplayer (public HTTPS / `wss://`) using the Phase 2B server, alternate rulesets (Modern American, Hand & Foot, custom house rules), optional pluggable LLM Opponent / "AI Coach" controller. |
| **Phase 4** | Post-Phase 3 | Living-room native TV receivers: **Native Google Cast Web Receiver** (requires Phase 3 public HTTPS server + Cast App ID) and optional native **Apple TV (tvOS)** client consuming the exact same WebSocket `TableView` JSON protocol. |

---

## 2. Phase 1 Baseline (Shipped Summary)

All Phase 1 capabilities remain preserved on `main` and work 100% offline in the browser:
- **Pure Headless Engine (`src/engine/`):** Enforced via `tsconfig.engine.json` (`ES2022` only). Implements full Bicycle 2P Classic (`108` cards, `15` dealt, `draw 2`, `2` Canastas to go out, `50/90/120` initial melds, classic wild limits `≥ 2` naturals / `≤ 3` wilds, Red 3 auto-exposure/replacement, Black 3 stop & go-out-only melds, Concealed Going Out `+200`, stock-exhaustion mandatory take, one-card deadlock guard, safe turn undo, seeded `replayHand()`, and strict `PlayerView` / `TableView`).
- **3-Tier Heuristic AI (`src/ai/`):** Pluggable `PlayerController` with `Easy` (Casual), `Normal` (Balanced), and `Hard` (Patient/Strategic) verified over 500-hand soak benchmarks.
- **Green-Felt Casino UI (`src/ui/`):** 57 vendored CC0 SVG playing cards (`public/cards/`), hover-to-front card fan, emerald glow for newly drawn cards, floating viewport-fixed announcements above the hand, explanatory Table Log, synthesized Web Audio sound effects with mute toggle, dynamic Rules & Scoring drawer, Pass-and-Play Privacy Shield (`H` hotkey), and `localStorage` auto-save/resume.

---

## 3. Phase 2A Requirements: Multi-Seat Modes (Offline & Pass-and-Play)

### 3.1 Variable-Team Engine Generalization
Refactor `teams` from a fixed 2-tuple (`[TeamState, TeamState]`) to a dynamic `TeamState[]` (`2`, `3`, or `4` teams) across `src/engine/`, `src/ai/`, `src/store/`, and `src/ui/` while keeping Phase 1 saved-match handling safe (bump or cleanly handle schema migration).

### 3.2 Supported Official Bicycle Formats

| Format | Ruleset ID | Players / Teams | Deal | Draw | Canastas to Go Out | Partner Permission |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2-Player Classic** *(Phase 1)* | `bicycle-2p-classic` | 2 players (2×1) | 15 | 2 | 2 | N/A |
| **3-Player Cutthroat** | `bicycle-3p-cutthroat` | 3 players (3×1) | 13 | 1 | 1 | N/A |
| **4-Player Partnership** | `bicycle-4p-partnership` | 4 players (2×2) | 11 | 1 | 1 | **Yes (Binding)** |
| **4-Player Cutthroat** | `bicycle-4p-cutthroat` | 4 players (4×1) | 11 | 1 | 1 | N/A |

### 3.3 4-Player Partnership Rules & Binding Partner Permission
- **Seating & Turn Order:** `South (Seat 0)` & `North (Seat 2)` form Team 1; `West (Seat 1)` & `East (Seat 3)` form Team 2; clockwise play (`0 → 1 → 2 → 3`).
- **Shared Partnership State:** Partners share one meld zone, one Red 3 tray, one `hasMadeInitialMeld` status, and one cumulative match score.
- **Concealed Going Out in 4P Partnership:** Still earns `+200` if the *going-out player personally* has never melded or added to their partner's melds on an earlier turn, melds their entire hand in one turn including at least 1 Canasta, and goes out.
- **Binding *"Partner, may I go out?"* Flow:**
  - Optional action available to the active player on their turn (before or after drawing, before melding/discarding out) whenever their partnership can legally go out or is considering going out.
  - Asking enters a dedicated turn sub-state awaiting the partner's binding response (`YES` or `NO`):
    - **`YES` (Binding):** Active player **must** go out on this turn (cannot discard/end turn while keeping cards in hand if a legal go-out exists; if asked before drawing and the draw makes going out impossible, engine handles the fallback gracefully without soft-locking!).
    - **`NO` (Binding):** Active player **cannot** go out on this turn (engine blocks emptying the hand on this turn; must keep ≥ 1 card after discarding).
  - **Bot Partner Intelligence:**
    - When a human asks a **Bot Partner**, the bot evaluates its own hand (e.g., says `NO` if holding big melds/high penalty points or close to a Natural Canasta while opponents aren't threatening; says `YES` if hand is light, score is favorable, or opponents are low on cards).
    - When a **Bot Player** is able to go out and partnered with a **Human**, the bot optionally asks its human partner via a clear modal prompt (`Your partner asks: "May I go out?"` → `Yes, Go Out` / `No, Keep Playing`)!
    - In **Pass-and-Play** with 2 human partners, asking triggers the Privacy Shield curtain briefly for the partner to answer `Yes`/`No` (or lets them click directly since it's a single binary prompt without exposing the partner's hand!).

### 3.4 Flexible Seat Configuration & Multi-Human Pass-and-Play
- On the **Start Screen**, choosing a format (`2P`, `3P Cutthroat`, `4P Partnership`, `4P Cutthroat`) presents a clean **Seat Configurator**:
  - Each seat can be set to **Human** (editable name) or **Bot** (`Easy` / `Normal` / `Hard`).
  - Quick presets: e.g., in 4P Partnership: *"Solo + Bot Partner vs. 2 Bots"*, *"2 Humans (Partners) vs. 2 Bots"*, *"4 Humans (Pass-and-Play)"*.
- Whenever ≥ 2 seats are **Human**, the Phase 1 **Privacy Shield Curtain** automatically engages between human turns (with safe public turn recaps covering all intervening bot turns too!).

### 3.5 Multi-Seat Table UI & Dynamic Scoreboard
- **4P Partnership Layout (`1280×800` friendly):** Compact seat badges for **North (Partner)**, **West**, and **East** showing hand counts, active-turn pill, and team indicator, with generous **Your Team's Melds** and **Opponents' Melds** zones.
- **3P & 4P Cutthroat Layout:** Compact 2-panel (3P) or 3-panel (4P) opponent strip across the top showing each opponent's hand count, Red 3s, and compact clickable meld piles, with **Your Melds** below.
- **Dynamic Scoreboard, Rules Drawer & Hand Summary:** Automatically adapts to 2, 3, or 4 team/player columns, and displays the exact active format's rules (including 4P Partner Permission rules when active).

---

## 4. Phase 2B Requirements: Local WebSocket Server & Multi-Device LAN Play

### 4.1 Server-Authoritative Architecture (`server/`)
- Thin **Node.js + Socket.IO** server hosting `src/engine/` and `src/ai/` directly (zero rule duplication).
- Server validates every `GameAction` against the sender's authenticated `playerId`, runs bot turns server-side with configurable pacing, and emits strictly filtered `PlayerView` (per player) and `TableView` (for shared table screens).
- Single convenient launch script (`npm run dev:lan`) starts both the Vite client and WebSocket server on Windows, printing the machine's local LAN IPv4 address (`http://192.168.x.x:5173`).

### 4.2 Two Multi-Device Modes Over One Protocol
1. **Jackbox-Style "Shared Table + Phone Hands" (Living-Room / TV Mode):**
   - **Host Laptop / TV (`TableView` — 10-Foot Ready):** Clean 16:9 living-room layout with larger readable cards, melds, scores, big scannable QR code, and **full Web Audio sound effects** (zero private hands ever rendered). Works immediately on a living-room TV via **Chrome "Cast Tab" to Google TV Streamer**, **AirPlay**, or HDMI, while keeping the `TableView` JSON protocol decoupled for future native Cast Receiver / Apple TV clients in Phase 4.
   - **Phone Hand Controller (`PlayerView`):** Players scan a **QR code** or enter a **4-letter room code** on their phone browser. Opens a touch-first **Hand Controller** featuring:
     - **Primary "Hand" Tab:** Sorted hand fan, turn banner, top discard card + quick pickup/draw/stage-meld/add-to-meld/discard thumb buttons, and Partner Permission prompt modal.
     - **Secondary "Table / Melds" Tab + Rules Drawer:** Lets any player inspect all melds on the table, action log, active rules, and scoreboard right from their phone.
     - **Audio Default:** Phone Controllers default to **muted** (with an unmute button) while the Shared Laptop Table plays full audio, preventing room echo.
2. **Separate Full-Table Devices:**
   - Players joining from separate laptops/tablets get the full desktop green-felt table + their private hand, with a 1-tap toggle between Full Table and Hand Controller modes.

### 4.3 Room Lobby, Seat Claiming & Reconnect Resilience
- Host creates a room (chooses 2P / 3P / 4P Partnership / 4P Cutthroat, match length, and Host role: **Shared Table Display** or **Play on This Device**).
- Lobby displays a **large scannable QR code**, LAN URL, and 4-letter Room Code; joining players enter their name and claim any open seat (or swap teams in 4P Partnership). Host fills remaining seats with `Easy` / `Normal` / `Hard` bots and starts the match.
- **Reconnect Tokens:** Each player receives a `seatToken` stored in browser `localStorage`; if a phone locks or Wi-Fi blips, reopening the page auto-rejoins their exact seat seamlessly.
- **Disconnect Handling:** Live connection dots per seat; Host can assign a Bot to take over a dropped human seat or reopen it for rejoin.

---

## 5. Git & Delivery Workflow
- **Phase 2A** ships on branch `feat/phase-2a-multiseat` → pushed to GitHub and opened as a PR via `gh pr create` for review before merging to `main`.
- **Phase 2B** branches from updated `main` as `feat/phase-2b-lan-multiplayer` → pushed and opened as a second clean PR via `gh pr create`.
- Next step upon approval of **PRD v2.0**: sync `docs/prd.md` and draft **`sdd-phase2.md`** (covering Phase 2A & Phase 2B technical design) for `/grill-me` review.
