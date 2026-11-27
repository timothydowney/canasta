import type { ActionLogEntry } from '../engine';

/**
 * Extracts safe public move summaries from the previous turn so the incoming
 * Pass-and-Play player knows what happened without seeing hidden cards.
 */
export function buildTurnRecap(
  actionLog: readonly ActionLogEntry[],
  previousTurnNumber: number,
  previousPlayerId: string,
): string[] {
  return actionLog
    .filter(
      (entry) =>
        entry.turnNumber === previousTurnNumber &&
        entry.playerId === previousPlayerId &&
        entry.kind !== 'undo',
    )
    .map((entry) => entry.message);
}
