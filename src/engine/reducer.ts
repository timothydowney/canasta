import {
  createDoubleDeck,
  getCardLabel,
  isBlackThree,
  isRedThree,
  isWildCard,
  nextRng,
  shuffleCards,
  sortHandCards,
} from './deck';
import { BICYCLE_2P_CLASSIC } from './rulesets';
import { finalizeHand } from './scoring';
import type {
  ActionLogKind,
  ActionResult,
  Card,
  DiscardPile,
  GameAction,
  GameState,
  Meld,
  PlayerConfig,
  PlayerState,
  RulesetConfig,
  TeamState,
} from './types';
import {
  countTeamCanastas,
  getTeamById,
  isMandatoryStockExhaustedTake,
  validateCommitMeldsAction,
  validateTakeDiscardPileAction,
} from './validation';

export interface CreateMatchOptions {
  matchId?: string;
  seed?: number;
  ruleset?: RulesetConfig;
  players: PlayerConfig[];
  teamNames?: [string, string];
}

function cloneTeams(teams: readonly [TeamState, TeamState]): [TeamState, TeamState] {
  return [
    {
      ...teams[0],
      playerIds: teams[0].playerIds.slice(),
      melds: teams[0].melds.map((m) => ({ ...m, cards: m.cards.slice() })),
      redThrees: teams[0].redThrees.slice(),
      meldedOnPriorTurnPlayerIds: teams[0].meldedOnPriorTurnPlayerIds.slice(),
      handHistory: teams[0].handHistory.slice(),
    },
    {
      ...teams[1],
      playerIds: teams[1].playerIds.slice(),
      melds: teams[1].melds.map((m) => ({ ...m, cards: m.cards.slice() })),
      redThrees: teams[1].redThrees.slice(),
      meldedOnPriorTurnPlayerIds: teams[1].meldedOnPriorTurnPlayerIds.slice(),
      handHistory: teams[1].handHistory.slice(),
    },
  ];
}

function appendLog(
  state: GameState,
  playerId: string | null,
  kind: ActionLogKind,
  message: string,
): GameState {
  return {
    ...state,
    actionLog: [
      ...state.actionLog,
      {
        id: state.nextLogId,
        handNumber: state.handNumber,
        turnNumber: state.turnNumber,
        playerId,
        kind,
        message,
      },
    ],
    nextLogId: state.nextLogId + 1,
  };
}

/**
 * Draw `count` cards from stock for `playerIndex`, automatically exposing any Red 3s
 * and drawing replacements. If the very last stock card drawn is a Red 3, sets
 * `endedByLastRedThree = true`.
 */
function drawCardsWithRedThreeReplacement(
  state: GameState,
  playerIndex: number,
  count: number,
): { state: GameState; drawnCount: number; endedByLastRedThree: boolean } {
  let stock = state.stock.slice();
  const players = state.players.map((p, idx) =>
    idx === playerIndex ? { ...p, hand: p.hand.slice() } : p,
  );
  const teams = cloneTeams(state.teams);
  const player = players[playerIndex];
  const teamIdx = player.teamId === 'team-0' ? 0 : 1;
  let nextState: GameState = { ...state, stock, players, teams };

  let remainingToDraw = count;
  let drawnNonRed3 = 0;

  while (remainingToDraw > 0 && stock.length > 0) {
    const card = stock.pop()!;
    if (isRedThree(card)) {
      teams[teamIdx].redThrees.push(card);
      const isLastStockCard = stock.length === 0;
      nextState = {
        ...nextState,
        stock: stock.slice(),
        players,
        teams,
      };
      nextState = appendLog(
        nextState,
        player.id,
        'red_three',
        isLastStockCard
          ? `${player.name} drew ${getCardLabel(card)} as the last card of the stock.`
          : `${player.name} exposed ${getCardLabel(card)} and drew a replacement.`,
      );
      if (isLastStockCard) {
        return { state: nextState, drawnCount: drawnNonRed3, endedByLastRedThree: true };
      }
      // Keep remainingToDraw unchanged so a replacement card is drawn
    } else {
      player.hand.push(card);
      drawnNonRed3++;
      remainingToDraw--;
    }
  }

  player.hand = sortHandCards(player.hand);
  nextState = {
    ...nextState,
    stock: stock.slice(),
    players,
    teams,
  };
  return { state: nextState, drawnCount: drawnNonRed3, endedByLastRedThree: false };
}

/**
 * At the start of a player's very first turn of a hand, automatically expose
 * any Red 3s dealt in their starting hand and replace them from stock.
 */
function prepareTurnStart(state: GameState): GameState {
  if (state.phase !== 'DRAW') return state;
  const activeIdx = state.activePlayerIndex;
  const activePlayer = state.players[activeIdx];
  if (activePlayer.hasTakenFirstTurn) return state;

  const startingRedThrees = activePlayer.hand.filter((c) => isRedThree(c));
  const players = state.players.map((p, idx) =>
    idx === activeIdx
      ? {
          ...p,
          hasTakenFirstTurn: true,
          hand: p.hand.filter((c) => !isRedThree(c)),
        }
      : p,
  );

  if (startingRedThrees.length === 0) {
    return { ...state, players };
  }

  const teams = cloneTeams(state.teams);
  const teamIdx = activePlayer.teamId === 'team-0' ? 0 : 1;
  teams[teamIdx].redThrees.push(...startingRedThrees);

  let nextState: GameState = { ...state, players, teams };
  const labels = startingRedThrees.map(getCardLabel).join(', ');
  nextState = appendLog(
    nextState,
    activePlayer.id,
    'red_three',
    `${activePlayer.name} exposed starting Red 3${startingRedThrees.length > 1 ? 's' : ''} (${labels}) and drew replacement${startingRedThrees.length > 1 ? 's' : ''}.`,
  );

  const replaced = drawCardsWithRedThreeReplacement(
    nextState,
    activeIdx,
    startingRedThrees.length,
  );
  if (replaced.endedByLastRedThree) {
    return finalizeHand(replaced.state, 'STOCK_EXHAUSTED_RED_THREE');
  }
  return replaced.state;
}

function dealHand(
  baseState: Omit<
    GameState,
    | 'stock'
    | 'discardPile'
    | 'phase'
    | 'activePlayerIndex'
    | 'turnNumber'
    | 'tookDiscardPileThisTurn'
    | 'meldedThisTurn'
    | 'turnUndoCheckpoint'
    | 'actionHistory'
    | 'lastHandSummary'
  >,
): GameState {
  const deck = createDoubleDeck();
  const shuffled = shuffleCards(deck, baseState.handSeed);
  const stock = shuffled.cards.slice();

  const players: PlayerState[] = baseState.players.map((p) => ({
    ...p,
    hand: [],
    hasTakenFirstTurn: false,
  }));

  // Deal round-robin starting left of dealer
  const playerCount = players.length;
  for (let c = 0; c < baseState.ruleset.dealSize; c++) {
    for (let offset = 1; offset <= playerCount; offset++) {
      const idx = (baseState.dealerIndex + offset) % playerCount;
      players[idx].hand.push(stock.pop()!);
    }
  }
  for (const p of players) {
    p.hand = sortHandCards(p.hand);
  }

  // Turn up initial discard card; keep turning if Wild or 3
  const discardCards: Card[] = [];
  let frozenByWildOrInitial = false;
  let frozenCardId: string | null = null;

  while (stock.length > 0) {
    const up = stock.pop()!;
    discardCards.push(up);
    if (isWildCard(up) || isRedThree(up)) {
      frozenByWildOrInitial = true;
      if (!frozenCardId) frozenCardId = up.id;
      continue;
    }
    if (isBlackThree(up)) {
      continue;
    }
    break;
  }

  const discardPile: DiscardPile = {
    cards: discardCards,
    frozenByWildOrInitial,
    frozenCardId,
    blockedByBlackThree: false,
  };

  const teams: [TeamState, TeamState] = [
    {
      ...baseState.teams[0],
      melds: [],
      redThrees: [],
      hasMadeInitialMeld: false,
      meldedOnPriorTurnPlayerIds: [],
    },
    {
      ...baseState.teams[1],
      melds: [],
      redThrees: [],
      hasMadeInitialMeld: false,
      meldedOnPriorTurnPlayerIds: [],
    },
  ];

  const firstPlayerIndex = (baseState.dealerIndex + 1) % playerCount;

  let state: GameState = {
    ...baseState,
    rngState: shuffled.rngState,
    players,
    teams,
    activePlayerIndex: firstPlayerIndex,
    phase: 'DRAW',
    turnNumber: 1,
    stock,
    discardPile,
    tookDiscardPileThisTurn: false,
    meldedThisTurn: false,
    turnUndoCheckpoint: null,
    actionHistory: [],
    lastHandSummary: null,
  };

  const topUp = discardCards[discardCards.length - 1];
  state = appendLog(
    state,
    null,
    'deal',
    `Hand #${state.handNumber} dealt (${state.ruleset.dealSize} cards each). Upcard: ${getCardLabel(topUp)}${frozenByWildOrInitial ? ' (Discard pile starts FROZEN)' : ''}.`,
  );

  return prepareTurnStart(state);
}

export function createMatch(options: CreateMatchOptions): GameState {
  const ruleset = options.ruleset ?? BICYCLE_2P_CLASSIC;
  if (options.players.length !== ruleset.playerCount) {
    throw new Error(
      `Ruleset ${ruleset.id} requires ${ruleset.playerCount} players, received ${options.players.length}.`,
    );
  }

  const matchSeed = (options.seed ?? Date.now()) >>> 0;
  const matchId = options.matchId ?? `match-${matchSeed.toString(36)}`;
  const players: PlayerState[] = options.players.map((p, idx) => ({
    ...p,
    seatIndex: idx,
    hand: [],
    hasTakenFirstTurn: false,
  }));

  const t0Players = players.filter((p) => p.teamId === 'team-0').map((p) => p.id);
  const t1Players = players.filter((p) => p.teamId === 'team-1').map((p) => p.id);

  const teamNames: [string, string] = options.teamNames ?? [
    t0Players.length === 1
      ? players.find((p) => p.id === t0Players[0])!.name
      : 'Team 1',
    t1Players.length === 1
      ? players.find((p) => p.id === t1Players[0])!.name
      : 'Team 2',
  ];

  const teams: [TeamState, TeamState] = [
    {
      id: 'team-0',
      name: teamNames[0],
      playerIds: t0Players,
      melds: [],
      redThrees: [],
      hasMadeInitialMeld: false,
      meldedOnPriorTurnPlayerIds: [],
      cumulativeScore: 0,
      handHistory: [],
    },
    {
      id: 'team-1',
      name: teamNames[1],
      playerIds: t1Players,
      melds: [],
      redThrees: [],
      hasMadeInitialMeld: false,
      meldedOnPriorTurnPlayerIds: [],
      cumulativeScore: 0,
      handHistory: [],
    },
  ];

  return dealHand({
    schemaVersion: 1,
    matchId,
    matchSeed,
    handSeed: matchSeed,
    rngState: matchSeed,
    handNumber: 1,
    dealerIndex: 0,
    ruleset,
    players,
    teams,
    actionLog: [],
    nextLogId: 1,
    nextMeldSeq: 1,
    winnerTeamId: null,
  });
}

function assignStableMeldIds(
  melds: Meld[],
  nextMeldSeq: number,
): { melds: Meld[]; nextMeldSeq: number } {
  let seq = nextMeldSeq;
  const assigned = melds.map((m) => {
    if (m.id.startsWith('temp-')) {
      return { ...m, id: `meld-${seq++}` };
    }
    return m;
  });
  return { melds: assigned, nextMeldSeq: seq };
}

function recordAction(state: GameState, action: GameAction): GameState {
  if (action.type === 'START_NEXT_HAND') return state;
  return {
    ...state,
    actionHistory: [...state.actionHistory, action],
  };
}

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.type) {
    case 'DRAW_STOCK': {
      if (state.phase !== 'DRAW') {
        return { ok: false, error: 'You can only draw during the draw phase.' };
      }
      const active = state.players[state.activePlayerIndex];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (state.stock.length === 0) {
        return { ok: false, error: 'The stock pile is empty.' };
      }

      const drawResult = drawCardsWithRedThreeReplacement(
        state,
        state.activePlayerIndex,
        state.ruleset.drawCount,
      );
      let next = recordAction(drawResult.state, action);

      if (drawResult.endedByLastRedThree) {
        return {
          ok: true,
          state: finalizeHand(next, 'STOCK_EXHAUSTED_RED_THREE'),
        };
      }

      next = appendLog(
        next,
        active.id,
        'draw',
        `${active.name} drew ${drawResult.drawnCount} card${drawResult.drawnCount === 1 ? '' : 's'} from the stock.`,
      );

      const activeAfter = next.players[next.activePlayerIndex];
      next = {
        ...next,
        phase: 'MELD_OR_DISCARD',
        tookDiscardPileThisTurn: false,
        meldedThisTurn: false,
        turnUndoCheckpoint: {
          playerId: activeAfter.id,
          hand: activeAfter.hand.slice(),
          teams: cloneTeams(next.teams),
        },
      };

      return { ok: true, state: next };
    }

    case 'TAKE_DISCARD_PILE': {
      const check = validateTakeDiscardPileAction(state, action);
      if (!check.ok) return check;

      const activeIdx = state.activePlayerIndex;
      const active = state.players[activeIdx];
      const teamIdx = active.teamId === 'team-0' ? 0 : 1;
      const topCard = state.discardPile.cards[state.discardPile.cards.length - 1];
      const buried = state.discardPile.cards.slice(0, -1);
      const buriedRedThrees = buried.filter((c) => isRedThree(c));
      const buriedHandCards = buried.filter((c) => !isRedThree(c));

      const assigned = assignStableMeldIds(check.nextMelds, state.nextMeldSeq);
      const teams = cloneTeams(state.teams);
      teams[teamIdx].melds = assigned.melds;
      teams[teamIdx].hasMadeInitialMeld = true;
      teams[teamIdx].redThrees.push(...buriedRedThrees);

      const newHand = sortHandCards([
        ...active.hand.filter((c) => !check.usedHandCardIds.has(c.id)),
        ...buriedHandCards,
      ]);

      const players = state.players.map((p, idx) =>
        idx === activeIdx ? { ...p, hand: newHand } : p,
      );

      let next: GameState = {
        ...state,
        players,
        teams,
        discardPile: {
          cards: [],
          frozenByWildOrInitial: false,
          frozenCardId: null,
          blockedByBlackThree: false,
        },
        phase: 'MELD_OR_DISCARD',
        tookDiscardPileThisTurn: true,
        meldedThisTurn: true,
        nextMeldSeq: assigned.nextMeldSeq,
      };
      next = recordAction(next, action);

      const totalTaken = state.discardPile.cards.length;
      next = appendLog(
        next,
        active.id,
        'take_pile',
        `${active.name} took the discard pile (${totalTaken} card${totalTaken === 1 ? '' : 's'}) using ${getCardLabel(topCard)}.`,
      );

      if (buriedRedThrees.length > 0) {
        next = appendLog(
          next,
          active.id,
          'red_three',
          `${active.name} exposed ${buriedRedThrees.map(getCardLabel).join(', ')} from the discard pile (no replacement).`,
        );
      }

      // If hand is now empty, player automatically went out!
      if (newHand.length === 0) {
        const concealed = !state.teams[teamIdx].meldedOnPriorTurnPlayerIds.includes(
          active.id,
        );
        return {
          ok: true,
          state: finalizeHand(
            next,
            concealed ? 'WENT_OUT_CONCEALED' : 'WENT_OUT',
            active.id,
          ),
        };
      }

      // Set post-pickup undo checkpoint so any FURTHER optional melds this turn can be undone
      next = {
        ...next,
        turnUndoCheckpoint: {
          playerId: active.id,
          hand: newHand.slice(),
          teams: cloneTeams(next.teams),
        },
      };

      return { ok: true, state: next };
    }

    case 'COMMIT_MELDS': {
      const check = validateCommitMeldsAction(state, action);
      if (!check.ok) return check;

      const activeIdx = state.activePlayerIndex;
      const active = state.players[activeIdx];
      const teamIdx = active.teamId === 'team-0' ? 0 : 1;
      const assigned = assignStableMeldIds(check.nextMelds, state.nextMeldSeq);

      const teams = cloneTeams(state.teams);
      teams[teamIdx].melds = assigned.melds;
      teams[teamIdx].hasMadeInitialMeld = true;

      const newHand = sortHandCards(
        active.hand.filter((c) => !check.usedHandCardIds.has(c.id)),
      );
      const players = state.players.map((p, idx) =>
        idx === activeIdx ? { ...p, hand: newHand } : p,
      );

      let next: GameState = {
        ...state,
        players,
        teams,
        meldedThisTurn: true,
        nextMeldSeq: assigned.nextMeldSeq,
      };
      next = recordAction(next, action);

      const summaryParts = action.submissions.map((s) =>
        s.kind === 'new_meld'
          ? `${s.cardIds.length}×${s.rank === '3B' ? 'Black 3' : s.rank}`
          : `+${s.cardIds.length} to meld`,
      );
      next = appendLog(
        next,
        active.id,
        'meld',
        `${active.name} melded ${summaryParts.join(', ')} (${check.meldPoints} pts).`,
      );

      // If hand reached 0 cards cleanly, player went out without needing a discard!
      if (newHand.length === 0) {
        const concealed = !state.teams[teamIdx].meldedOnPriorTurnPlayerIds.includes(
          active.id,
        );
        return {
          ok: true,
          state: finalizeHand(
            next,
            concealed ? 'WENT_OUT_CONCEALED' : 'WENT_OUT',
            active.id,
          ),
        };
      }

      return { ok: true, state: next };
    }

    case 'UNDO_TURN_MELDS': {
      if (state.phase !== 'MELD_OR_DISCARD') {
        return { ok: false, error: 'Nothing to undo right now.' };
      }
      const activeIdx = state.activePlayerIndex;
      const active = state.players[activeIdx];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (!state.turnUndoCheckpoint || state.turnUndoCheckpoint.playerId !== active.id) {
        return { ok: false, error: 'No melds to undo this turn.' };
      }

      const cp = state.turnUndoCheckpoint;
      const players = state.players.map((p, idx) =>
        idx === activeIdx ? { ...p, hand: cp.hand.slice() } : p,
      );

      let next: GameState = {
        ...state,
        players,
        teams: cloneTeams(cp.teams),
        meldedThisTurn: state.tookDiscardPileThisTurn,
      };
      next = recordAction(next, action);
      next = appendLog(next, active.id, 'undo', `${active.name} undid melds from this turn.`);
      return { ok: true, state: next };
    }

    case 'DISCARD': {
      if (state.phase !== 'MELD_OR_DISCARD') {
        return { ok: false, error: 'You can only discard after drawing.' };
      }
      const activeIdx = state.activePlayerIndex;
      const active = state.players[activeIdx];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }

      const card = active.hand.find((c) => c.id === action.cardId);
      if (!card) {
        return { ok: false, error: 'Card to discard is not in your hand.' };
      }
      if (isRedThree(card)) {
        return { ok: false, error: 'Red 3s cannot be discarded.' };
      }

      const teamIdx = active.teamId === 'team-0' ? 0 : 1;
      const team = state.teams[teamIdx];
      const remainingHand = active.hand.filter((c) => c.id !== card.id);
      const teamCanastas = countTeamCanastas(team.melds);

      if (remainingHand.length === 0) {
        if (teamCanastas < state.ruleset.canastasRequiredToGoOut) {
          return {
            ok: false,
            error: `You need at least ${state.ruleset.canastasRequiredToGoOut} Canasta(s) to go out.`,
          };
        }
      }

      const players = state.players.map((p, idx) =>
        idx === activeIdx ? { ...p, hand: remainingHand } : p,
      );

      const teams = cloneTeams(state.teams);
      if (
        state.meldedThisTurn &&
        !teams[teamIdx].meldedOnPriorTurnPlayerIds.includes(active.id)
      ) {
        teams[teamIdx].meldedOnPriorTurnPlayerIds.push(active.id);
      }

      const nextDiscardCards = [...state.discardPile.cards, card];
      const wildDiscard = isWildCard(card);
      const blackThreeDiscard = isBlackThree(card);
      const nextDiscardPile: DiscardPile = {
        cards: nextDiscardCards,
        frozenByWildOrInitial:
          state.discardPile.frozenByWildOrInitial || wildDiscard,
        frozenCardId:
          state.discardPile.frozenCardId ?? (wildDiscard ? card.id : null),
        blockedByBlackThree: blackThreeDiscard,
      };

      let next: GameState = {
        ...state,
        players,
        teams,
        discardPile: nextDiscardPile,
        turnUndoCheckpoint: null,
      };
      next = recordAction(next, action);

      const suffix = wildDiscard
        ? ' (FROZE discard pile)'
        : blackThreeDiscard
          ? ' (blocked pile for next turn)'
          : '';
      next = appendLog(
        next,
        active.id,
        'discard',
        `${active.name} discarded ${getCardLabel(card)}${suffix}.`,
      );

      if (remainingHand.length === 0) {
        const concealed = !state.teams[teamIdx].meldedOnPriorTurnPlayerIds.includes(
          active.id,
        );
        return {
          ok: true,
          state: finalizeHand(
            next,
            concealed ? 'WENT_OUT_CONCEALED' : 'WENT_OUT',
            active.id,
          ),
        };
      }

      const nextPlayerIndex = (activeIdx + 1) % state.players.length;
      next = {
        ...next,
        activePlayerIndex: nextPlayerIndex,
        phase: 'DRAW',
        turnNumber: state.turnNumber + 1,
        tookDiscardPileThisTurn: false,
        meldedThisTurn: false,
      };

      return { ok: true, state: prepareTurnStart(next) };
    }

    case 'GO_OUT_WITHOUT_DISCARD': {
      if (state.phase !== 'MELD_OR_DISCARD') {
        return { ok: false, error: 'Not in meld/discard phase.' };
      }
      const active = state.players[state.activePlayerIndex];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (active.hand.length > 0) {
        return { ok: false, error: 'You still have cards in hand.' };
      }
      const team = getTeamById(state.teams, active.teamId);
      if (countTeamCanastas(team.melds) < state.ruleset.canastasRequiredToGoOut) {
        return {
          ok: false,
          error: `Need ${state.ruleset.canastasRequiredToGoOut} Canasta(s) to go out.`,
        };
      }
      const concealed = !team.meldedOnPriorTurnPlayerIds.includes(active.id);
      const next = recordAction(state, action);
      return {
        ok: true,
        state: finalizeHand(
          next,
          concealed ? 'WENT_OUT_CONCEALED' : 'WENT_OUT',
          active.id,
        ),
      };
    }

    case 'PASS_EXHAUSTED_STOCK': {
      if (state.phase !== 'DRAW') {
        return { ok: false, error: 'Can only pass during the draw phase.' };
      }
      const active = state.players[state.activePlayerIndex];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (state.stock.length > 0) {
        return { ok: false, error: 'You cannot pass while cards remain in the stock.' };
      }
      if (isMandatoryStockExhaustedTake(state, active.id)) {
        return {
          ok: false,
          error: 'Stock is empty and the unfrozen top discard matches your meld — taking the pile is mandatory.',
        };
      }
      const next = recordAction(state, action);
      return {
        ok: true,
        state: finalizeHand(next, 'STOCK_EXHAUSTED_PASS'),
      };
    }

    case 'START_NEXT_HAND': {
      if (state.phase !== 'HAND_OVER') {
        return { ok: false, error: 'Current hand is not finished yet.' };
      }
      const [, nextHandSeed] = nextRng(state.rngState);
      const nextDealer = (state.dealerIndex + 1) % state.players.length;
      const nextState = dealHand({
        schemaVersion: 1,
        matchId: state.matchId,
        matchSeed: state.matchSeed,
        handSeed: nextHandSeed,
        rngState: nextHandSeed,
        handNumber: state.handNumber + 1,
        dealerIndex: nextDealer,
        ruleset: state.ruleset,
        players: state.players,
        teams: state.teams,
        actionLog: state.actionLog,
        nextLogId: state.nextLogId,
        nextMeldSeq: state.nextMeldSeq,
        winnerTeamId: null,
      });
      return { ok: true, state: nextState };
    }
  }
}

/** Deterministic replay of a single hand from its seed and committed actionHistory. */
export function replayHand(
  handSeed: number,
  ruleset: RulesetConfig,
  players: PlayerConfig[],
  actions: readonly GameAction[],
  options: {
    initialTeamScores?: [number, number];
    dealerIndex?: number;
    handNumber?: number;
    teamNames?: [string, string];
  } = {},
): GameState {
  let state = createMatch({
    seed: handSeed,
    ruleset,
    players,
    teamNames: options.teamNames,
  });

  if (
    options.initialTeamScores ||
    options.dealerIndex !== undefined ||
    options.handNumber !== undefined
  ) {
    const t0Score = options.initialTeamScores?.[0] ?? 0;
    const t1Score = options.initialTeamScores?.[1] ?? 0;
    state = dealHand({
      schemaVersion: 1,
      matchId: state.matchId,
      matchSeed: handSeed,
      handSeed,
      rngState: handSeed,
      handNumber: options.handNumber ?? 1,
      dealerIndex: options.dealerIndex ?? 0,
      ruleset,
      players: state.players,
      teams: [
        { ...state.teams[0], cumulativeScore: t0Score, handHistory: [] },
        { ...state.teams[1], cumulativeScore: t1Score, handHistory: [] },
      ],
      actionLog: [],
      nextLogId: 1,
      nextMeldSeq: 1,
      winnerTeamId: null,
    });
  }

  for (const action of actions) {
    const res = applyAction(state, action);
    if (!res.ok) {
      throw new Error(`Replay failed at action ${action.type}: ${res.error}`);
    }
    state = res.state;
  }

  return state;
}
