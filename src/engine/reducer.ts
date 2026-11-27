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
  TeamId,
  TeamState,
} from './types';
import {
  canPlayerGoOutNow,
  countTeamCanastas,
  getPartnerPlayerId,
  getTeamById,
  getTeamIndex,
  isMandatoryStockExhaustedTake,
  validateCommitMeldsAction,
  validateTakeDiscardPileAction,
} from './validation';

export interface CreateMatchOptions {
  matchId?: string;
  seed?: number;
  ruleset?: RulesetConfig;
  players: PlayerConfig[];
  teamNames?: string[];
}

function cloneTeams(teams: readonly TeamState[]): TeamState[] {
  return teams.map((t) => ({
    ...t,
    playerIds: t.playerIds.slice(),
    melds: t.melds.map((m) => ({ ...m, cards: m.cards.slice() })),
    redThrees: t.redThrees.slice(),
    meldedOnPriorTurnPlayerIds: t.meldedOnPriorTurnPlayerIds.slice(),
    handHistory: t.handHistory.slice(),
  }));
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
): {
  state: GameState;
  drawnCount: number;
  drawnCardIds: string[];
  endedByLastRedThree: boolean;
} {
  const stock = state.stock.slice();
  const players = state.players.map((p, idx) =>
    idx === playerIndex ? { ...p, hand: p.hand.slice() } : p,
  );
  const teams = cloneTeams(state.teams);
  const player = players[playerIndex];
  const teamIdx = getTeamIndex(teams, player.teamId);
  let nextState: GameState = { ...state, stock, players, teams };

  let remainingToDraw = count;
  let drawnNonRed3 = 0;
  const drawnCardIds: string[] = [];

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
        return {
          state: nextState,
          drawnCount: drawnNonRed3,
          drawnCardIds,
          endedByLastRedThree: true,
        };
      }
    } else {
      player.hand.push(card);
      drawnCardIds.push(card.id);
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
  return {
    state: nextState,
    drawnCount: drawnNonRed3,
    drawnCardIds,
    endedByLastRedThree: false,
  };
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
  const teamIdx = getTeamIndex(teams, activePlayer.teamId);
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
    | 'lastDrawnCardIds'
    | 'partnerGoOut'
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

  const teams: TeamState[] = baseState.teams.map((t) => ({
    ...t,
    melds: [],
    redThrees: [],
    hasMadeInitialMeld: false,
    meldedOnPriorTurnPlayerIds: [],
  }));

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
    lastDrawnCardIds: [],
    partnerGoOut: null,
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

const ORDERED_TEAM_IDS: readonly TeamId[] = [
  'team-0',
  'team-1',
  'team-2',
  'team-3',
];

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

  const teamIds = ORDERED_TEAM_IDS.slice(0, ruleset.teamCount);
  const teams: TeamState[] = teamIds.map((teamId, idx) => {
    const members = players.filter((p) => p.teamId === teamId);
    const defaultName =
      members.length === 1
        ? members[0].name
        : members.length === 2
          ? `${members[0].name} & ${members[1].name}`
          : `Team ${idx + 1}`;
    return {
      id: teamId,
      name: options.teamNames?.[idx] ?? defaultName,
      playerIds: members.map((m) => m.id),
      melds: [],
      redThrees: [],
      hasMadeInitialMeld: false,
      meldedOnPriorTurnPlayerIds: [],
      cumulativeScore: 0,
      handHistory: [],
    };
  });

  return dealHand({
    schemaVersion: 2,
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
    case 'ASK_PARTNER_GO_OUT': {
      if (state.phase !== 'DRAW' && state.phase !== 'MELD_OR_DISCARD') {
        return { ok: false, error: 'You can only ask your partner during your turn.' };
      }
      if (!state.ruleset.allowPartnerGoOutPrompt) {
        return { ok: false, error: 'Partner go-out permission is only available in 4-Player Partnership.' };
      }
      const active = state.players[state.activePlayerIndex];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (state.partnerGoOut !== null) {
        return { ok: false, error: 'You have already asked your partner on this turn.' };
      }
      const partnerId = getPartnerPlayerId(state, active.id);
      if (!partnerId) {
        return { ok: false, error: 'You do not have a partner in this mode.' };
      }
      const partner = state.players.find((p) => p.id === partnerId)!;
      let next: GameState = {
        ...state,
        partnerGoOut: {
          askedByPlayerId: active.id,
          partnerPlayerId: partner.id,
          status: 'PENDING',
        },
      };
      next = recordAction(next, action);
      next = appendLog(
        next,
        active.id,
        'partner_prompt',
        `${active.name} asked ${partner.name}: "Partner, may I go out?"`,
      );
      return { ok: true, state: next };
    }

    case 'ANSWER_PARTNER_GO_OUT': {
      if (!state.partnerGoOut || state.partnerGoOut.status !== 'PENDING') {
        return { ok: false, error: 'There is no pending partner go-out request.' };
      }
      if (state.partnerGoOut.partnerPlayerId !== action.playerId) {
        return { ok: false, error: 'Only the asked partner may answer this request.' };
      }
      const partner = state.players.find((p) => p.id === action.playerId)!;
      const asker = state.players.find(
        (p) => p.id === state.partnerGoOut!.askedByPlayerId,
      )!;
      let next: GameState = {
        ...state,
        partnerGoOut: {
          ...state.partnerGoOut,
          status: action.allow ? 'APPROVED' : 'DENIED',
        },
      };
      next = recordAction(next, action);
      next = appendLog(
        next,
        partner.id,
        'partner_prompt',
        action.allow
          ? `${partner.name} answered YES — ${asker.name} is bound to go out this turn!`
          : `${partner.name} answered NO — ${asker.name} may not go out this turn.`,
      );
      return { ok: true, state: next };
    }

    case 'DRAW_STOCK': {
      if (state.phase !== 'DRAW') {
        return { ok: false, error: 'You can only draw during the draw phase.' };
      }
      if (state.partnerGoOut?.status === 'PENDING') {
        return {
          ok: false,
          error: 'Waiting for your partner to answer your go-out request.',
        };
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
        lastDrawnCardIds: drawResult.drawnCardIds,
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
      const teamIdx = getTeamIndex(state.teams, active.teamId);
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
        lastDrawnCardIds: buriedHandCards.map((c) => c.id),
        nextMeldSeq: assigned.nextMeldSeq,
      };
      next = recordAction(next, action);

      const totalTaken = state.discardPile.cards.length;
      const wasFrozen =
        state.discardPile.frozenByWildOrInitial ||
        !state.teams[teamIdx].hasMadeInitialMeld;
      let takeReason: string;
      if (action.topCardUsage.kind === 'add_to_meld') {
        takeReason = `by adding ${getCardLabel(topCard)} to existing ${topCard.rank}s meld`;
      } else {
        const usedHand = active.hand.filter(
          (c) =>
            action.topCardUsage.kind === 'new_meld' &&
            action.topCardUsage.handCardIds.includes(c.id),
        );
        const usedWild = usedHand.some((c) => isWildCard(c));
        takeReason = usedWild
          ? `by melding ${getCardLabel(topCard)} with a matching card + wild from hand`
          : `by melding ${getCardLabel(topCard)} with a natural pair from hand`;
      }
      const initialTag = !state.teams[teamIdx].hasMadeInitialMeld
        ? ' [Initial Meld]'
        : '';
      next = appendLog(
        next,
        active.id,
        'take_pile',
        `${active.name} took the ${wasFrozen ? 'frozen ' : 'unfrozen '}discard pile (${totalTaken} card${totalTaken === 1 ? '' : 's'}) ${takeReason}${initialTag}.`,
      );

      if (buriedRedThrees.length > 0) {
        next = appendLog(
          next,
          active.id,
          'red_three',
          `${active.name} exposed ${buriedRedThrees.map(getCardLabel).join(', ')} from the discard pile (no replacement).`,
        );
      }

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
      const teamIdx = getTeamIndex(state.teams, active.teamId);
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

      const prevMeldsById = new Map(
        state.teams[teamIdx].melds.map((m) => [m.id, m]),
      );
      const summaryParts = action.submissions.map((s) => {
        if (s.kind === 'new_meld') {
          return `${s.cardIds.length}×${s.rank === '3B' ? 'Black 3' : s.rank}`;
        }
        const target = prevMeldsById.get(s.meldId);
        return `+${s.cardIds.length} to ${target ? `${target.rank}s` : 'meld'}`;
      });
      const newlyCompletedCanastas = assigned.melds.filter((m) => {
        if (!m.isCanasta) return false;
        const prev = prevMeldsById.get(m.id);
        return !prev || !prev.isCanasta;
      });
      const canastaNote =
        newlyCompletedCanastas.length > 0
          ? ` — completed ${newlyCompletedCanastas
              .map(
                (m) =>
                  `${m.canastaType === 'natural' ? 'Natural (+500)' : 'Mixed (+300)'} ${m.rank}s Canasta`,
              )
              .join(' & ')}!`
          : '';
      const initialNote = !state.teams[teamIdx].hasMadeInitialMeld
        ? ' [Initial Meld]'
        : '';
      next = appendLog(
        next,
        active.id,
        'meld',
        `${active.name} melded ${summaryParts.join(', ')} (${check.meldPoints} pts)${initialNote}${canastaNote}.`,
      );

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
      if (state.partnerGoOut?.status === 'PENDING') {
        return {
          ok: false,
          error: 'Waiting for your partner to answer your go-out request.',
        };
      }
      const activeIdx = state.activePlayerIndex;
      const active = state.players[activeIdx];
      if (active.id !== action.playerId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (
        !state.turnUndoCheckpoint ||
        state.turnUndoCheckpoint.playerId !== active.id
      ) {
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
      next = appendLog(
        next,
        active.id,
        'undo',
        `${active.name} undid melds from this turn.`,
      );
      return { ok: true, state: next };
    }

    case 'DISCARD': {
      if (state.phase !== 'MELD_OR_DISCARD') {
        return { ok: false, error: 'You can only discard after drawing.' };
      }
      if (state.partnerGoOut?.status === 'PENDING') {
        return {
          ok: false,
          error: 'Waiting for your partner to answer your go-out request.',
        };
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

      const teamIdx = getTeamIndex(state.teams, active.teamId);
      const team = state.teams[teamIdx];
      const remainingHand = active.hand.filter((c) => c.id !== card.id);
      const teamCanastas = countTeamCanastas(team.melds);

      if (remainingHand.length === 0) {
        if (state.partnerGoOut?.status === 'DENIED') {
          return {
            ok: false,
            error: 'Your partner denied going out — you cannot go out on this turn.',
          };
        }
        if (teamCanastas < state.ruleset.canastasRequiredToGoOut) {
          return {
            ok: false,
            error: `You need at least ${state.ruleset.canastasRequiredToGoOut} Canasta(s) to go out.`,
          };
        }
      }

      // Binding APPROVED partner permission: must go out if legally achievable!
      let approvedFallbackNote = false;
      if (
        remainingHand.length > 0 &&
        state.partnerGoOut?.status === 'APPROVED'
      ) {
        if (canPlayerGoOutNow(state, active.id)) {
          return {
            ok: false,
            error:
              'Your partner approved going out — you are bound to go out on this turn.',
          };
        }
        approvedFallbackNote = true;
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
      if (approvedFallbackNote) {
        next = appendLog(
          next,
          active.id,
          'partner_prompt',
          `${active.name} could not legally go out after drawing despite partner approval — play continues.`,
        );
      }

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
        lastDrawnCardIds: [],
        partnerGoOut: null,
      };

      return { ok: true, state: prepareTurnStart(next) };
    }

    case 'GO_OUT_WITHOUT_DISCARD': {
      if (state.phase !== 'MELD_OR_DISCARD') {
        return { ok: false, error: 'Not in meld/discard phase.' };
      }
      if (state.partnerGoOut?.status === 'PENDING') {
        return {
          ok: false,
          error: 'Waiting for your partner to answer your go-out request.',
        };
      }
      if (state.partnerGoOut?.status === 'DENIED') {
        return {
          ok: false,
          error: 'Your partner denied going out on this turn.',
        };
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
      if (state.partnerGoOut?.status === 'PENDING') {
        return {
          ok: false,
          error: 'Waiting for your partner to answer your go-out request.',
        };
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
          error:
            'Stock is empty and the unfrozen top discard matches your meld — taking the pile is mandatory.',
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
        schemaVersion: 2,
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
    initialTeamScores?: number[];
    dealerIndex?: number;
    handNumber?: number;
    teamNames?: string[];
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
    state = dealHand({
      schemaVersion: 2,
      matchId: state.matchId,
      matchSeed: handSeed,
      handSeed,
      rngState: handSeed,
      handNumber: options.handNumber ?? 1,
      dealerIndex: options.dealerIndex ?? 0,
      ruleset,
      players: state.players,
      teams: state.teams.map((t, idx) => ({
        ...t,
        cumulativeScore: options.initialTeamScores?.[idx] ?? 0,
        handHistory: [],
      })),
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
