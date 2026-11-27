# Web-Based Canasta — Product Requirements Document (PRD v1.0)

> [!IMPORTANT]
> This PRD incorporates all decisions from our design review and alignment interview. Once approved, this document serves as the baseline for the **Software Design Document (SDD)**.

---

## 1. Product Vision & Phased Roadmap

Build a polished, browser-based **Canasta** card game with a classic green casino felt table, crisp vector playing cards, strict rules enforcement, automatic scoring, and a clean headless rules engine that scales seamlessly from solo play to shared-laptop play, local phone-as-hand play, and online multiplayer.

| Phase | Milestone | Scope |
| :--- | :--- | :--- |
| **Phase 1 (MVP)** | **Browser-Only 2-Player Bicycle Canasta** | Solo vs. Heuristic Bot **and** 2-Player Pass-and-Play (privacy curtain), full Bicycle 2-player rules, automatic scoring, dynamic Rules & Scoring drawer, staged multi-meld UI with turn undo, `localStorage` auto-save/resume, match-length presets. Runs 100% in the browser (`npm run dev`). |
| **Phase 2** | **Local Server, Phone-Hands LAN & 4-Player Partnership** | Thin Node.js + WebSocket server wrapping the exact same `src/engine` module. Adds **Laptop-as-Table + Phones-as-Hands** LAN companion mode (QR code join over local Wi-Fi) and **4-Player Partnership** (11 cards, draw 1, 1 Canasta to go out, partner permission to go out, mixed human/bot seats). |
| **Phase 3** | **Online Multiplayer, Alternate Rulesets & Optional LLM AI** | Deploy Node.js WebSocket server for remote rooms with reconnect support; add alternate ruleset presets (Modern American, Hand & Foot, custom house rules); optional pluggable LLM Opponent / "AI Coach" controller. |

---

## 2. Functional Requirements

### 2.1 Rules Engine & Bicycle Classic Baseline
All rules are driven by a typed `RulesetConfig` object so alternate rulesets can be added without modifying core game flow.

- **Deck**: 108 cards (two standard 52-card decks + 4 Jokers).
- **2-Player Head-to-Head (Phase 1 Default)**:
  - **Deal**: 15 cards per player.
  - **Turn Draw**: Draw **2 cards** from the stock (or take the entire discard pile); discard **1 card** to end turn (discard optional when melding last cards to go out).
  - **Going Out Requirement**: At least **2 completed Canastas**.
- **4-Player Partnership (Phase 2 Preset)**:
  - **Deal**: 11 cards per player across 2 partnerships.
  - **Turn Draw**: Draw **1 card** from the stock (or take the discard pile); discard **1 card**.
  - **Going Out Requirement**: At least **1 completed Canasta** (with optional binding *"Partner, may I go out?"* prompt).
- **Initial Discard Upcard**: Turn top stock card face-up. If it is a Wild Card (Joker or 2) or a 3 (Red or Black), turn additional cards until a natural `4–A` appears. If a Wild Card or Red 3 is turned up during setup, the discard pile starts **frozen**.
- **Wild Cards & Valid Melds (Classic Bicycle Default)**:
  - Jokers (`50 pts`) and 2s (`20 pts`) are wild.
  - A valid meld requires **≥ 3 cards** of the same rank, **≥ 2 natural cards**, and **≤ 3 wild cards** (`allowWildMajorityWithinLimit: true` for classic Bicycle; strict `naturals > wilds` toggleable in `RulesetConfig` for future variants).
  - All-wild melds are disallowed in Bicycle Classic (configurable for future variants).
- **Red 3s (Bonus Cards)**:
  - Dealt in starting hand: Automatically/prompted to expose on player's first turn with immediate stock replacement.
  - Drawn from stock: Immediately exposed face-up and replaced from stock.
  - Acquired in discard pile: Exposed face-up with **no replacement card**.
- **Black 3s (Stop Cards)**:
  - Discarding a Black 3 blocks/freezes the discard pile for the **next player's turn only**.
  - Black 3s may **only be melded** (3 or 4 natural Black 3s, no wilds) on the turn the player **goes out**.
- **Initial Meld Minimums** (determined by cumulative score at the **start of the hand**; face values only, excluding Canasta/Red 3 bonuses):
  - `< 0` → **0 pts**
  - `0 – 1,495` → **50 pts**
  - `1,500 – 2,995` → **90 pts**
  - `3,000+` → **120 pts**
  - *When taking the discard pile for an initial meld, only the **top discard card** plus cards already in hand count toward the minimum before scooping the remaining pile.*
- **Discard Pile & Freezing**:
  - **Frozen** against any side without an initial meld, or frozen for **everyone** when a Wild Card is discarded (rendered sideways) or turned up on deal.
  - **Taking Frozen Pile**: Requires holding a **natural pair** matching the top discard card in hand (no wild substitution; cannot add to an existing meld).
  - **Taking Unfrozen Pile**: Top card must be immediately melded via (a) natural pair from hand, (b) 1 natural + 1 wild from hand, or (c) adding to an existing meld on your side.
  - **Unclaimable Top Card**: Pile cannot be taken when the top card is a Wild Card, Black 3, or Red 3.
- **Canastas (7+ cards of a rank)**:
  - **Natural (Clean/Red) Canasta**: 7+ natural cards, 0 wilds (`+500 pts`; squared stack topped with a red card).
  - **Mixed (Dirty/Black) Canasta**: 7+ cards with 1–3 wilds (`+300 pts`; squared stack topped with a black card).
  - Adding a wild card to a Natural Canasta downgrades it to Mixed (`+500 → +300`) and triggers a **confirmation guardrail** in the UI.
- **Ending a Hand & Stock Exhaustion**:
  - **Going Out**: Empty hand after meeting Canasta requirement (`+100 pts`).
  - **Going Out Concealed**: Meld entire hand (including required Canastas) in one turn with no prior melds/additions (`+200 pts` total).
  - **Stock Exhaustion**: If the last card drawn from stock is a Red 3, expose it and end the hand immediately. Otherwise play continues without a stock; players *must* take an unfrozen discard pile if it matches an existing meld. Hand ends when a player cannot (or chooses not to) take the pile; no going-out bonus is awarded.
- **Automatic Scoring**:
  - **Card Values**: Joker = `50`, Ace / 2 = `20`, `8–K` = `10`, `4–7` & Black 3 = `5`.
  - **Red 3s**: `+100` each (`+800` if all 4 collected); **`-100` each** (`-800` for all 4) if the side never made an initial meld.
  - **Hand Total** = `(Melded card values + Canasta bonuses + Red 3 bonuses + Going Out bonus) − (Unmelded cards remaining in hand)`.
- **Match Length Presets**:
  - **Standard Match (Default)**: First to **5,000 points** after a completed hand.
  - **Quick Presets**: **2,500 points** or **Single Hand**.

---

## 3. User Experience & Interface Requirements

### 3.1 Table Aesthetic & Card Rendering
- **Theme**: Classic **green casino felt** table with warm wood/gold accents and traditional Bicycle-style playing cards.
- **Card Assets**: Self-hosted **CC0 / Public Domain SVG playing cards** (including distinct Red/Black Jokers and ornate card backs) wrapped in a reusable `<PlayingCard />` component.
- **Adaptive Hand Display**:
  - Auto-sorted by rank (with wild cards cleanly grouped) for instant scanning.
  - Automatically wraps from 1 overlapping fan into 2 compact rows when hand size exceeds ~18 cards (common after picking up a large discard pile).
- **Table Clarity**:
  - **Stock Pile**: Stacked card backs with remaining count badge.
  - **Discard Pile**: Face-up top card, pile count badge, **sideways peeking wild card + "Frozen" indicator** when frozen, and "Blocked (Black 3)" indicator when stopped.
  - **Meld Area**: Distinct zones for Player and Opponent melds + Red 3 trays; completed Canastas squared up with Red/Black top indicator and hover/click popover to inspect all cards inside.

### 3.2 Turn Interaction, Staging & Guardrails
- **Click/Tap-to-Select Primary**: Clicking/tapping cards raises them; a contextual action bar dynamically enables valid actions (`Stage Meld`, `Add to Meld`, `Discard`, `Take Discard Pile`)—designed from Day 1 to work identically on laptop trackpads and phone touchscreens.
- **Multi-Meld Staging & Turn Undo**:
  - Players can stage multiple melds in one turn while seeing a live point progress indicator against their initial meld threshold (e.g., `Initial Meld: 55 / 50 pts ✓`).
  - Melds placed from hand during the current turn can be **undone** right up until the player discards (ending the turn).
  - Actions that reveal hidden information (drawing from stock or picking up the discard pile) **lock immediately** and cannot be undone.
- **High-Stakes Guardrails**: Confirmation prompts before potentially costly mistakes (e.g., adding a wild card to a Natural Canasta, discarding a Wild Card, or discarding a Black 3).
- **Bot Pacing & Move Log**:
  - Configurable bot animation speed (Slow / Normal / Fast, default ~600 ms per discrete action) so players can clearly see each draw, Red 3 replacement, meld, and discard.
  - Compact scrollable **Action Log** summarizing recent moves (e.g., *"CPU drew 2 cards → exposed 3♥ → melded 3×K → discarded 7♣"*).

### 3.3 Always-Accessible Rules & Scoring Reference
- **Top-Bar "Rules & Scoring" Button**: Opens a clean slide-over drawer/modal mid-game without interrupting the hand.
- **Dynamically Generated from `RulesetConfig`**: Guarantees displayed rules always match the active match configuration (2P vs. 4P, Bicycle vs. future alternate rulesets).
  - **Rules Tab**: Deal/draw counts, initial meld table with the player's **current tier highlighted**, wild-card limits, freezing/taking pile rules, Canasta & going-out requirements.
  - **Scoring Tab**: Card point values, bonus table, and live **hand-by-hand cumulative scoreboard** (including current melded points on table).
- **End-of-Hand Breakdown Modal**: Automatically presented after every hand showing itemized Melded Cards, Natural/Mixed Canastas, Red 3s, Going Out bonus, Unmelded Hand deductions, Hand Net, and Cumulative Match Score.

### 3.4 Shared-Device & Local Multiplayer Privacy
- **Phase 1 — Pass-and-Play Privacy Curtain**:
  - Immediately upon ending a turn (discarding), active hand flips face-down behind a full-screen curtain: *"Pass laptop to [Player 2] — Click or press Space to reveal hand."*
  - Displays a brief safe summary of the previous player's public moves ("Player 1 melded 3 Jacks and discarded 9♠") plus an anytime quick-hide hotkey (`H`).
- **Phase 2 — Laptop-as-Table + Phones-as-Hands (LAN Companion)**:
  - Laptop hosts the shared table display (stock, discard pile, melds, scoreboard, QR code / local URL).
  - Each player connects on their phone browser over local Wi-Fi to view and tap cards from their private hand—zero accidental peeking, zero laptop passing.

### 3.5 Persistence & Session Recovery
- **Auto-Save (`localStorage`)**: Active match state is persisted after every committed action so accidental tab reloads or closures offer instant **Resume Match** from the start screen.

---

## 4. Technical & Architectural Principles

- **Environment**: Native Windows development in `c:\Users\timot\Downloads\antigravity\canasta` (Node.js, npm, and Git verified installed).
- **Tech Stack**:
  - **Language**: Strict TypeScript across engine, AI, UI, and future server.
  - **Frontend**: Vite + React + Tailwind CSS.
  - **Testing**: Vitest (comprehensive unit test suite for all Bicycle Canasta rules & edge cases).
  - **Future Server (Phase 2/3)**: Node.js + Socket.IO (or `ws`) hosting the shared `src/engine` module.
- **Core Architectural Boundaries**:
  1. **Headless Rules Engine (`src/engine/`)**: Zero React/DOM dependencies; pure command-driven state machine (`applyAction(state, action) -> nextState`) plus strict hidden-info filtering (`getPlayerView(state, playerId)`).
  2. **Pluggable `PlayerController` Interface (`src/ai/`)**: Abstracts Human UI, Heuristic Bot (Phase 1), Remote WebSocket Player (Phase 2/3), and future LLM Opponent/Coach (Phase 3) behind a unified contract.
  3. **Rule-Based Heuristic AI (Phase 1)**: Deterministic, offline, `<5 ms` evaluation covering pile-pickup profitability, initial-meld subset optimization, wild-card conservation, Natural Canasta protection, and defensive discarding (Easy / Normal difficulty presets).

---

## 5. Next Step
Upon your sign-off on **PRD v1.0**, we will create the **Software Design Document (SDD)** specifying exact TypeScript data models (`Card`, `Meld`, `RulesetConfig`, `GameState`, `PlayerView`, `GameAction`), state transitions, heuristic AI scoring functions, SVG card asset strategy, UI component hierarchy, and the Phase 1 implementation & test plan.
