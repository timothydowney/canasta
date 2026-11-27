import { getCardPoints } from './deck';
import type {
  GameState,
  HandEndReason,
  HandScoreBreakdown,
  HandSummary,
  PlayerState,
  RulesetConfig,
  TeamState,
} from './types';

export function calculateTeamHandScore(
  team: TeamState,
  players: readonly PlayerState[],
  handNumber: number,
  wentOutTeamId: 'team-0' | 'team-1' | null,
  wentOutConcealed: boolean,
  ruleset: RulesetConfig,
): HandScoreBreakdown {
  let meldedCardPoints = 0;
  let naturalCanastaCount = 0;
  let mixedCanastaCount = 0;

  for (const meld of team.melds) {
    for (const card of meld.cards) {
      meldedCardPoints += getCardPoints(card);
    }
    if (meld.canastaType === 'natural') naturalCanastaCount++;
    else if (meld.canastaType === 'mixed') mixedCanastaCount++;
  }

  const naturalCanastaPoints = naturalCanastaCount * ruleset.naturalCanastaBonus;
  const mixedCanastaPoints = mixedCanastaCount * ruleset.mixedCanastaBonus;

  const redThreeCount = team.redThrees.length;
  let redThreePoints = 0;
  if (redThreeCount > 0) {
    const magnitude =
      redThreeCount === 4
        ? ruleset.allFourRedThreesBonus
        : redThreeCount * ruleset.redThreeValue;
    redThreePoints =
      !team.hasMadeInitialMeld && ruleset.penalizeRedThreesWithoutInitialMeld
        ? -magnitude
        : magnitude;
  }

  const didGoOut = wentOutTeamId === team.id;
  const goingOutBonus = didGoOut
    ? ruleset.goingOutBonus +
      (wentOutConcealed ? ruleset.concealedGoingOutExtraBonus : 0)
    : 0;

  let unmeldedPenaltyPositive = 0;
  for (const player of players) {
    if (player.teamId !== team.id) continue;
    for (const card of player.hand) {
      unmeldedPenaltyPositive += getCardPoints(card);
    }
  }
  const unmeldedHandPenalty = -unmeldedPenaltyPositive;

  const handNetScore =
    meldedCardPoints +
    naturalCanastaPoints +
    mixedCanastaPoints +
    redThreePoints +
    goingOutBonus +
    unmeldedHandPenalty;

  const cumulativeAfterHand = team.cumulativeScore + handNetScore;

  return {
    handNumber,
    teamId: team.id,
    meldedCardPoints,
    naturalCanastaCount,
    naturalCanastaPoints,
    mixedCanastaCount,
    mixedCanastaPoints,
    redThreeCount,
    redThreePoints,
    goingOutBonus,
    wentOutConcealed: didGoOut && wentOutConcealed,
    unmeldedHandPenalty,
    handNetScore,
    cumulativeAfterHand,
  };
}

export function finalizeHand(
  state: GameState,
  reason: HandEndReason,
  wentOutPlayerId: string | null = null,
): GameState {
  const wentOutPlayer = wentOutPlayerId
    ? state.players.find((p) => p.id === wentOutPlayerId) ?? null
    : null;
  const wentOutTeamId = wentOutPlayer ? wentOutPlayer.teamId : null;
  const wentOutConcealed = reason === 'WENT_OUT_CONCEALED';

  const b0 = calculateTeamHandScore(
    state.teams[0],
    state.players,
    state.handNumber,
    wentOutTeamId,
    wentOutConcealed,
    state.ruleset,
  );
  const b1 = calculateTeamHandScore(
    state.teams[1],
    state.players,
    state.handNumber,
    wentOutTeamId,
    wentOutConcealed,
    state.ruleset,
  );

  const nextTeams: [TeamState, TeamState] = [
    {
      ...state.teams[0],
      cumulativeScore: b0.cumulativeAfterHand,
      handHistory: [...state.teams[0].handHistory, b0],
    },
    {
      ...state.teams[1],
      cumulativeScore: b1.cumulativeAfterHand,
      handHistory: [...state.teams[1].handHistory, b1],
    },
  ];

  const summary: HandSummary = {
    handNumber: state.handNumber,
    reason,
    wentOutPlayerId,
    wentOutTeamId,
    breakdowns: [b0, b1],
  };

  let isMatchOver = false;
  let winnerTeamId: 'team-0' | 'team-1' | null = null;

  if (state.ruleset.winScore === null) {
    // Single-hand match
    isMatchOver = true;
  } else if (
    b0.cumulativeAfterHand >= state.ruleset.winScore ||
    b1.cumulativeAfterHand >= state.ruleset.winScore
  ) {
    isMatchOver = true;
  }

  if (isMatchOver) {
    if (b0.cumulativeAfterHand > b1.cumulativeAfterHand) {
      winnerTeamId = 'team-0';
    } else if (b1.cumulativeAfterHand > b0.cumulativeAfterHand) {
      winnerTeamId = 'team-1';
    } else if (wentOutTeamId) {
      winnerTeamId = wentOutTeamId;
    } else {
      winnerTeamId = null; // Exact tie
    }
  }

  const endMsg =
    reason === 'WENT_OUT_CONCEALED'
      ? `${wentOutPlayer?.name ?? 'Player'} went out CONCEALED (+${state.ruleset.goingOutBonus + state.ruleset.concealedGoingOutExtraBonus} pts)!`
      : reason === 'WENT_OUT'
        ? `${wentOutPlayer?.name ?? 'Player'} went out (+${state.ruleset.goingOutBonus} pts)!`
        : reason === 'STOCK_EXHAUSTED_RED_THREE'
          ? 'Last stock card was a Red 3 — hand ends immediately.'
          : 'Stock exhausted and discard pile passed — hand ends.';

  return {
    ...state,
    teams: nextTeams,
    phase: isMatchOver ? 'MATCH_OVER' : 'HAND_OVER',
    turnUndoCheckpoint: null,
    lastHandSummary: summary,
    winnerTeamId,
    actionLog: [
      ...state.actionLog,
      {
        id: state.nextLogId,
        handNumber: state.handNumber,
        turnNumber: state.turnNumber,
        playerId: wentOutPlayerId,
        kind: 'hand_end',
        message: endMsg,
      },
    ],
    nextLogId: state.nextLogId + 1,
  };
}
