# Canasta — Web-Based Classic Bicycle Card Table

A browser-based **Canasta** card game built with TypeScript, React, Vite, and Tailwind CSS, featuring a classic green casino felt table, crisp self-hosted CC0 SVG playing cards, strict Bicycle Classic rules enforcement, automatic scoring, and a headless rules engine architected for future local-network and online multiplayer.

---

## Current Features (Phase 1 & Phase 2)

- **Official Bicycle Canasta Formats:**
  - **2-Player Classic** (15 cards dealt, draw 2, 2 Canastas to go out)
  - **3-Player Cutthroat** (13 cards dealt, draw 1, 1 Canasta to go out)
  - **4-Player Partnership** (11 cards dealt, draw 1, 1 Canasta, 2 teams of 2 sitting opposite, with binding ***"Partner, may I go out?"*** permission)
  - **4-Player Cutthroat** (11 cards dealt, draw 1, 1 Canasta, 4 independent players)
  - Full enforcement of initial meld score tiers (`<0 → 0`, `0–1495 → 50`, `1500–2995 → 90`, `3000+ → 120`), classic wild-card limits (`≥ 2` naturals, `≤ 3` wilds), frozen vs. unfrozen discard pile rules, automatic Red 3 exposure/replacement, Black 3 stop cards & go-out-only melds, Concealed Going Out (`+200`), stock-exhaustion rules, and one-card deadlock protection.
- **Play Modes:**
  - **Solo vs. Computer (Offline):** 3-tier rule-based heuristic AI (**Easy**, **Normal**, and patient/strategic **Hard**) with configurable turn pacing across all 4 formats.
  - **Multi-Human Pass-and-Play (Offline):** Flexible Human/Bot seat mixes on one laptop with an automatic **Privacy Shield** handover curtain (`H` hotkey) and safe multi-turn recaps.
  - **LAN Multi-Device Rooms (`npm run dev:lan`):** Node.js + Socket.IO server hosting the pure rules engine, with scannable **QR code** + 4-letter room codes, smart LAN IPv4 adapter selector, **10-Foot TV-Ready Shared Table** (ready for Chrome *Cast Tab* to Google TV Streamer / AirPlay / HDMI), touch-first **Mobile Phone Hand Controller** (Hand + Table/Melds tabs), separate-laptop Full Table mode, and `seatToken` auto-reconnects.
- **Card Table UX & Polish:**
  - **CC0 Traditional SVG Deck:** 57 self-hosted vector cards (`public/cards/`) with Red/Black Jokers and Red/Blue ornate backs.
  - **Smart Hand & Staging Controls:** Auto-sorted adaptive 1-to-2 row card fan, hover-to-front readability, green glow highlighting newly drawn/scooped cards for the current turn, multi-meld staging with live initial-meld point math, Guided Take-Discard-Pile mode, safe turn undo (without reverting hidden draws), and high-stakes confirmation guardrails.
  - **Dynamic Rules & Scoring Drawer:** Always-accessible overlay generated directly from the active `RulesetConfig` (highlighting your current initial-meld tier) plus an itemized round-by-round scoreboard and end-of-hand breakdown modal.
  - **Offline Web Audio Sound Effects:** Synthesized deal riffles, card flicks, stock slides, felt discards, meld snaps, Canasta fanfares, and freeze chimes with a persistent Mute toggle.
  - **Persistence & Replayability:** Automatic `localStorage` match save/resume, match-length presets (`5,000 pts`, `2,500 pts`, `Single Hand`), and 1-click deterministic Hand Replay JSON export.

---

## Architecture

The codebase enforces a strict headless boundary so the rules engine and AI can move straight onto a Node.js WebSocket server in Phase 2 with zero rewrite:

```text
canasta/
├── docs/               # Locked Product Requirements (prd.md) & Software Design (sdd.md)
├── public/cards/       # Vendored CC0 traditional SVG playing cards (100% offline)
├── src/
│   ├── engine/         # Pure ES2022 rules engine, RulesetConfig, scoring, replay & PlayerView
│   ├── ai/             # Pluggable PlayerController interface + Easy/Normal/Hard heuristic bot
│   ├── store/          # Session orchestrator, bot pacing, privacy curtain, localStorage save
│   └── ui/             # React + Tailwind green-felt casino UI & Web Audio sound engine
└── tests/
    ├── engine/         # Bicycle Canasta rules & edge-case unit tests
    └── ai/             # 500-hand multi-tier Bot-vs-Bot soak & benchmark tests
```

`tsconfig.engine.json` enforces at compile time that `src/engine/` and `src/ai/` have zero DOM or React dependencies.

---

## Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended) and `npm`

### Setup & Development
```bash
git clone https://github.com/timothydowney/canasta.git
cd canasta
npm install

# Solo / Pass-and-Play (browser-only)
npm run dev

# LAN Multi-Device (starts Vite + Node.js Socket.IO server together)
npm run dev:lan
```
Open **http://localhost:5173/** on your laptop. For **Jackbox-style living-room play**, click **Host LAN Room → Shared TV / Table Display**, cast the Chrome tab to your Google TV Streamer (or TV), and scan the QR code from each player's phone on the same Wi-Fi!

> **Windows PowerShell note:** If PowerShell's execution policy blocks `npm.ps1`, run commands with `npm.cmd` (for example `npm.cmd install` and `npm.cmd run dev:lan`).

### Scripts
| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start the local Vite frontend (offline Solo & Pass-and-Play) |
| `npm run dev:lan` | Start both Vite frontend and Node.js Socket.IO LAN server |
| `npm run dev:server` | Start only the Node.js Socket.IO server on `:3001` |
| `npm run typecheck` | Run strict TypeScript checks across app, server (`tsconfig.json`), and pure engine (`tsconfig.engine.json`) |
| `npm test` | Run all Vitest engine, AI soak, and Socket.IO integration tests |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run start:server` | Serve production `dist/` + Socket.IO from a single port (`:3001`) |

---

## Roadmap

- **Phase 2 — Local Server, Phone-Hands LAN & 4-Player Partnership:**
  - Thin Node.js + Socket.IO server hosting the existing `src/engine/` and `src/ai/` modules.
  - **Laptop-as-Table + Phones-as-Hands** (Jackbox-style local Wi-Fi play via QR code — zero passing the laptop, zero accidental peeking).
  - **4-Player Partnership** mode (`BICYCLE_4P_CLASSIC`: 11 cards dealt, draw 1, 1 Canasta to go out, partner permission prompt, mixed human/bot seats).
- **Phase 3 — Online Multiplayer, Alternate Rulesets & Optional LLM AI:**
  - Deployed WebSocket rooms with room codes and reconnect handling.
  - Alternate ruleset presets (Modern American, Hand & Foot, customizable house rules via `RulesetConfig`).
  - Optional pluggable LLM opponent or "AI Coach / Hint" controller behind `PlayerController`.

---

## Documentation & Assets
- [Product Requirements Document (PRD)](docs/prd.md)
- [Software Design Document (SDD)](docs/sdd.md)
- Playing card SVGs in `public/cards/` are sourced from **Public Domain / CC0** vector playing card assets (`AustinGabriel/Public-Domain-and-CC0-Playing-Cards`).
