import type { GameState } from '../engine';

export type GameMode = 'solo_bots' | 'pass_and_play';
export type BotSpeed = 'slow' | 'normal' | 'fast';

export const BOT_SPEED_MS: Record<BotSpeed, number> = {
  slow: 950,
  normal: 550,
  fast: 200,
};

export interface SavedSession {
  schemaVersion: 2;
  savedAt: string;
  mode: GameMode;
  botSpeed: BotSpeed;
  state: GameState;
}

const STORAGE_KEY = 'canasta_saved_match_v2';

export function saveSession(session: SavedSession): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota or private-mode errors gracefully
  }
}

export function loadSavedSession(): SavedSession | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (
      parsed.schemaVersion !== 2 ||
      !parsed.state ||
      parsed.state.schemaVersion !== 2 ||
      !Array.isArray(parsed.state.players) ||
      !Array.isArray(parsed.state.teams)
    ) {
      return null;
    }
    return parsed as SavedSession;
  } catch {
    return null;
  }
}

export function clearSavedSession(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function buildReplayExportJson(state: GameState): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    matchId: state.matchId,
    handNumber: state.handNumber,
    handSeed: state.handSeed,
    dealerIndex: state.dealerIndex,
    ruleset: state.ruleset,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      kind: p.kind,
      botDifficulty: p.botDifficulty,
    })),
    teamScoresAtHandStart: state.teams.map(
      (t, idx) =>
        t.cumulativeScore -
        (state.lastHandSummary?.breakdowns[idx]?.handNetScore ?? 0),
    ),
    actionHistory: state.actionHistory,
  };
  return JSON.stringify(payload, null, 2);
}
