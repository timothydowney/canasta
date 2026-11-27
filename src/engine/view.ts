import { getRequiredInitialMeldPoints } from './rulesets';
import type { GameState, PlayerView, PublicPlayerView, TableView } from './types';
import {
  canPlayerTakeDiscardPile,
  countTeamCanastas,
  getTeamById,
  isDiscardPileFrozenForTeam,
  isMandatoryStockExhaustedTake,
} from './validation';

function buildPublicPlayers(state: GameState): PublicPlayerView[] {
  return state.players.map((p, idx) => ({
    id: p.id,
    name: p.name,
    teamId: p.teamId,
    seatIndex: p.seatIndex,
    kind: p.kind,
    botDifficulty: p.botDifficulty,
    handCount: p.hand.length,
    isActive: idx === state.activePlayerIndex,
  }));
}

export function getPlayerView(state: GameState, viewerPlayerId: string): PlayerView {
  const viewer = state.players.find((p) => p.id === viewerPlayerId);
  if (!viewer) {
    throw new Error(`Unknown viewer playerId: ${viewerPlayerId}`);
  }

  const activePlayer = state.players[state.activePlayerIndex];
  const isViewerTurn = activePlayer.id === viewer.id;
  const viewerTeam = getTeamById(state.teams, viewer.teamId);
  const topCard =
    state.discardPile.cards.length > 0
      ? state.discardPile.cards[state.discardPile.cards.length - 1]
      : null;
  const frozenCard = state.discardPile.frozenCardId
    ? state.discardPile.cards.find((c) => c.id === state.discardPile.frozenCardId) ??
      null
    : null;

  const isFrozenForViewer = isDiscardPileFrozenForTeam(
    state.discardPile,
    viewerTeam,
  );
  const canTake = isViewerTurn && canPlayerTakeDiscardPile(state, viewer.id);
  const mustTake = isViewerTurn && isMandatoryStockExhaustedTake(state, viewer.id);
  const viewerCanastas = countTeamCanastas(viewerTeam.melds);
  const initialMeldRequired = getRequiredInitialMeldPoints(
    state.ruleset,
    viewerTeam.cumulativeScore,
  );

  const canUndoMelds =
    isViewerTurn &&
    state.phase === 'MELD_OR_DISCARD' &&
    state.turnUndoCheckpoint !== null &&
    state.turnUndoCheckpoint.playerId === viewer.id &&
    (state.turnUndoCheckpoint.hand.length !== viewer.hand.length ||
      state.turnUndoCheckpoint.teams[viewer.teamId === 'team-0' ? 0 : 1].melds
        .length !== viewerTeam.melds.length);

  return {
    matchId: state.matchId,
    handNumber: state.handNumber,
    turnNumber: state.turnNumber,
    phase: state.phase,
    ruleset: state.ruleset,
    viewerId: viewer.id,
    viewerTeamId: viewer.teamId,
    viewerHand: viewer.hand.slice(),
    newlyAcquiredCardIds:
      isViewerTurn && state.phase === 'MELD_OR_DISCARD'
        ? (state.lastDrawnCardIds ?? []).slice()
        : [],
    activePlayerId: activePlayer.id,
    players: buildPublicPlayers(state),
    teams: [
      {
        ...state.teams[0],
        melds: state.teams[0].melds.map((m) => ({ ...m, cards: m.cards.slice() })),
        redThrees: state.teams[0].redThrees.slice(),
        handHistory: state.teams[0].handHistory.slice(),
      },
      {
        ...state.teams[1],
        melds: state.teams[1].melds.map((m) => ({ ...m, cards: m.cards.slice() })),
        redThrees: state.teams[1].redThrees.slice(),
        handHistory: state.teams[1].handHistory.slice(),
      },
    ],
    stockCount: state.stock.length,
    discardPile: {
      topCard,
      count: state.discardPile.cards.length,
      frozenByWildOrInitial: state.discardPile.frozenByWildOrInitial,
      isFrozenForViewer,
      frozenCard,
      blockedByBlackThree: state.discardPile.blockedByBlackThree,
    },
    actionLog: state.actionLog.slice(-40),
    lastHandSummary: state.lastHandSummary,
    winnerTeamId: state.winnerTeamId,
    legalHints: {
      isViewerTurn,
      canDrawStock: isViewerTurn && state.phase === 'DRAW' && state.stock.length > 0,
      canTakeDiscardPile: canTake,
      mustTakeDiscardPile: mustTake,
      canPassExhaustedStock:
        isViewerTurn &&
        state.phase === 'DRAW' &&
        state.stock.length === 0 &&
        !mustTake,
      canUndoMelds,
      canGoOutWithoutDiscard:
        isViewerTurn &&
        state.phase === 'MELD_OR_DISCARD' &&
        viewer.hand.length === 0 &&
        viewerCanastas >= state.ruleset.canastasRequiredToGoOut,
      viewerCanastas,
      canastasRequired: state.ruleset.canastasRequiredToGoOut,
      initialMeldRequired,
      viewerTeamHasInitialMeld: viewerTeam.hasMadeInitialMeld,
    },
  };
}

/** Shared table projection (zero hands exposed) — ready for Phase 2 Laptop-Table view. */
export function getTableView(state: GameState): TableView {
  const activePlayer = state.players[state.activePlayerIndex];
  const topCard =
    state.discardPile.cards.length > 0
      ? state.discardPile.cards[state.discardPile.cards.length - 1]
      : null;
  const frozenCard = state.discardPile.frozenCardId
    ? state.discardPile.cards.find((c) => c.id === state.discardPile.frozenCardId) ??
      null
    : null;

  return {
    matchId: state.matchId,
    handNumber: state.handNumber,
    turnNumber: state.turnNumber,
    phase: state.phase,
    ruleset: state.ruleset,
    activePlayerId: activePlayer.id,
    players: buildPublicPlayers(state),
    teams: state.teams,
    stockCount: state.stock.length,
    discardPile: {
      topCard,
      count: state.discardPile.cards.length,
      frozenByWildOrInitial: state.discardPile.frozenByWildOrInitial,
      frozenCard,
      blockedByBlackThree: state.discardPile.blockedByBlackThree,
    },
    actionLog: state.actionLog.slice(-40),
    lastHandSummary: state.lastHandSummary,
    winnerTeamId: state.winnerTeamId,
  };
}
