import type { ActionLogEntry } from '../engine';

/**
 * Extracts safe public move summaries from recent turns (including any
 * intervening bot turns in 3P/4P Pass-and-Play) so the incoming human player
 * knows what happened without seeing hidden cards.
 */
export function buildTurnRecap(
  actionLog: readonly ActionLogEntry[],
  afterLogId: number,
): string[] {
  return actionLog
    .filter((entry) => entry.id > afterLogId && entry.kind !== 'undo')
    .slice(-8)
    .map((entry) => entry.message);
}
