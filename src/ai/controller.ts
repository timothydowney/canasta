import type { GameAction, PlayerView } from '../engine';

/**
 * Pluggable controller interface shared by Human UI, Heuristic Bot (Phase 1),
 * Remote WebSocket Player (Phase 2/3), and future LLM Agent / Coach (Phase 3).
 * Receives strictly filtered PlayerView (never full GameState).
 */
export interface PlayerController {
  readonly id: string;
  chooseAction(view: PlayerView): GameAction | Promise<GameAction>;
}
