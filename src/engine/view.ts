import { getRequiredInitialMeldPoints } from './rulesets';
import type { GameState, PlayerView, PublicPlayerView, TableView } from './types';
import {
  canPlayerTakeDiscardPile,
  countTeamCanastas,
  getPartnerPlayerId,
  getTeamById,
  getTeamIndex,
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
  const viewerTeamIdx = getTeamIndex(state.teams, viewer.teamId);
  const topCard =
    state.discardPile.cards.length > 0
      ? state.discardPile.cards[state.discardPile.cards.length - 1]
      : null;
  const frozenCard = state.discardPile.frozenCardId
    ? state.discardPile.cards.find((c) => c.id === state.discardPile.frozenCardId) ??
      null
    : null;

  const partnerPending = state.partnerGoOut?.status === 'PENDING';
  const mustAnswerPartnerGoOut =
    partnerPending && state.partnerGoOut?.partnerPlayerId === viewer.id;

  const isFrozenForViewer = isDiscardPileFrozenForTeam(
    state.discardPile,
    viewerTeam,
  );
  const canTake =
    !partnerPending &&
    isViewerTurn &&
    canPlayerTakeDiscardPile(state, viewer.id);
  const mustTake =
    !partnerPending &&
    isViewerTurn &&
    isMandatoryStockExhaustedTake(state, viewer.id);
  const viewerCanastas = countTeamCanastas(viewerTeam.melds);
  const initialMeldRequired = getRequiredInitialMeldPoints(
    state.ruleset,
    viewerTeam.cumulativeScore,
  );

  const canUndoMelds =
    !partnerPending &&
    isViewerTurn &&
    state.phase === 'MELD_OR_DISCARD' &&
    state.turnUndoCheckpoint !== null &&
    state.turnUndoCheckpoint.playerId === viewer.id &&
    (state.turnUndoCheckpoint.hand.length !== viewer.hand.length ||
      state.turnUndoCheckpoint.teams[viewerTeamIdx].melds.length !==
        viewerTeam.melds.length);

  const canAskPartnerGoOut =
    isViewerTurn &&
    (state.phase === 'DRAW' || state.phase === 'MELD_OR_DISCARD') &&
    state.ruleset.allowPartnerGoOutPrompt &&
    state.partnerGoOut === null &&
    getPartnerPlayerId(state, viewer.id) !== null;

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
    teams: state.teams.map((t) => ({
      ...t,
      melds: t.melds.map((m) => ({ ...m, cards: m.cards.slice() })),
      redThrees: t.redThrees.slice(),
      handHistory: t.handHistory.slice(),
    })),
    stockCount: state.stock.length,
    discardPile: {
      topCard,
      count: state.discardPile.cards.length,
      frozenByWildOrInitial: state.discardPile.frozenByWildOrInitial,
      isFrozenForViewer,
      frozenCard,
      blockedByBlackThree: state.discardPile.blockedByBlackThree,
    },
    partnerGoOut: state.partnerGoOut ? { ...state.partnerGoOut } : null,
    actionLog: state.actionLog.slice(-40),
    lastHandSummary: state.lastHandSummary,
    winnerTeamId: state.winnerTeamId,
    legalHints: {
      isViewerTurn,
      canDrawStock:
        !partnerPending &&
        isViewerTurn &&
        state.phase === 'DRAW' &&
        state.stock.length > 0,
      canTakeDiscardPile: canTake,
      mustTakeDiscardPile: mustTake,
      canPassExhaustedStock:
        !partnerPending &&
        isViewerTurn &&
        state.phase === 'DRAW' &&
        state.stock.length === 0 &&
        !mustTake,
      canUndoMelds,
      canGoOutWithoutDiscard:
        !partnerPending &&
        state.partnerGoOut?.status !== 'DENIED' &&
        isViewerTurn &&
        state.phase === 'MELD_OR_DISCARD' &&
        viewer.hand.length === 0 &&
        viewerCanastas >= state.ruleset.canastasRequiredToGoOut,
      canAskPartnerGoOut,
      mustAnswerPartnerGoOut,
      partnerGoOutStatus: state.partnerGoOut?.status ?? null,
      viewerCanastas,
      canastasRequired: state.ruleset.canastasRequiredToGoOut,
      initialMeldRequired,
      viewerTeamHasInitialMeld: viewerTeam.hasMadeInitialMeld,
    },
  };
}

/** Shared table projection (zero hands exposed) — ready for Phase 2B TV/Laptop Table view. */
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
    teams: state.teams.map((t) => ({
      ...t,
      melds: t.melds.map((m) => ({ ...m, cards: m.cards.slice() })),
      redThrees: t.redThrees.slice(),
      handHistory: t.handHistory.slice(),
    })),
    stockCount: state.stock.length,
    discardPile: {
      topCard,
      count: state.discardPile.cards.length,
      frozenByWildOrInitial: state.discardPile.frozenByWildOrInitial,
      frozenCard,
      blockedByBlackThree: state.discardPile.blockedByBlackThree,
    },
    partnerGoOut: state.partnerGoOut ? { ...state.partnerGoOut } : null,
    actionLog: state.actionLog.slice(-40),
    lastHandSummary: state.lastHandSummary,
    winnerTeamId: state.winnerTeamId,
  };
}
