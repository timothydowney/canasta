import {
  getCardPoints,
  isBlackThree,
  isNaturalRank,
  isRedThree,
  isWildCard,
} from './deck';
import { getRequiredInitialMeldPoints } from './rulesets';
import type {
  Card,
  DiscardPile,
  GameAction,
  GameState,
  Meld,
  MeldRank,
  MeldSubmission,
  NaturalRank,
  RulesetConfig,
  TeamId,
  TeamState,
} from './types';

export interface MeldValidationResult {
  valid: boolean;
  reason?: string;
  naturalCount: number;
  wildCount: number;
  points: number;
}

export function countTeamCanastas(melds: readonly Meld[]): number {
  return melds.reduce((acc, m) => acc + (m.isCanasta ? 1 : 0), 0);
}

export function buildMeldObject(id: string, rank: MeldRank, cards: Card[]): Meld {
  let naturalCount = 0;
  let wildCount = 0;
  for (const card of cards) {
    if (isWildCard(card)) wildCount++;
    else naturalCount++;
  }
  const isCanasta = cards.length >= 7;
  const canastaType = isCanasta ? (wildCount === 0 ? 'natural' : 'mixed') : null;
  return {
    id,
    rank,
    cards,
    naturalCount,
    wildCount,
    isCanasta,
    canastaType,
  };
}

export function getTeamIndex(teams: readonly TeamState[], teamId: TeamId): number {
  const idx = teams.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    throw new Error(`Unknown teamId: ${teamId}`);
  }
  return idx;
}

export function getTeamById(
  teams: readonly TeamState[],
  teamId: TeamId,
): TeamState {
  return teams[getTeamIndex(teams, teamId)];
}

export function getActiveTeam(state: GameState): TeamState {
  const player = state.players[state.activePlayerIndex];
  return getTeamById(state.teams, player.teamId);
}

export function getPartnerPlayerId(
  state: GameState,
  playerId: string,
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const team = getTeamById(state.teams, player.teamId);
  if (team.playerIds.length !== 2) return null;
  return team.playerIds.find((id) => id !== playerId) ?? null;
}

export function validateMeldCards(
  cards: readonly Card[],
  rank: MeldRank,
  ruleset: RulesetConfig,
  options: { isGoingOut?: boolean } = {},
): MeldValidationResult {
  if (cards.length < ruleset.minMeldSize) {
    return {
      valid: false,
      reason: `A meld requires at least ${ruleset.minMeldSize} cards.`,
      naturalCount: 0,
      wildCount: 0,
      points: 0,
    };
  }

  let naturalCount = 0;
  let wildCount = 0;
  let points = 0;

  if (rank === '3B') {
    if (!ruleset.allowBlackThreeMeldOnGoOut) {
      return {
        valid: false,
        reason: 'Black 3s cannot be melded under this ruleset.',
        naturalCount: 0,
        wildCount: 0,
        points: 0,
      };
    }
    if (!options.isGoingOut) {
      return {
        valid: false,
        reason: 'Black 3s may only be melded on the turn you go out.',
        naturalCount: 0,
        wildCount: 0,
        points: 0,
      };
    }
    if (cards.length > 4) {
      return {
        valid: false,
        reason: 'A Black 3 meld can have at most 4 Black 3s.',
        naturalCount: 0,
        wildCount: 0,
        points: 0,
      };
    }
    for (const card of cards) {
      if (!isBlackThree(card)) {
        return {
          valid: false,
          reason: 'Black 3 melds cannot include wild cards or other ranks.',
          naturalCount: 0,
          wildCount: 0,
          points: 0,
        };
      }
      naturalCount++;
      points += getCardPoints(card);
    }
    return { valid: true, naturalCount, wildCount: 0, points };
  }

  for (const card of cards) {
    if (isRedThree(card)) {
      return {
        valid: false,
        reason: 'Red 3s cannot be placed in a regular meld.',
        naturalCount,
        wildCount,
        points,
      };
    }
    if (isBlackThree(card)) {
      return {
        valid: false,
        reason: 'Black 3s cannot be combined with other ranks.',
        naturalCount,
        wildCount,
        points,
      };
    }
    if (isWildCard(card)) {
      wildCount++;
    } else if (card.rank === rank) {
      naturalCount++;
    } else {
      return {
        valid: false,
        reason: `Card ${card.rank} does not match meld rank ${rank}.`,
        naturalCount,
        wildCount,
        points,
      };
    }
    points += getCardPoints(card);
  }

  if (naturalCount < ruleset.minNaturalsPerMeld) {
    return {
      valid: false,
      reason: `A meld requires at least ${ruleset.minNaturalsPerMeld} natural cards.`,
      naturalCount,
      wildCount,
      points,
    };
  }

  if (wildCount > ruleset.maxWildsPerMeld) {
    return {
      valid: false,
      reason: `A meld may contain at most ${ruleset.maxWildsPerMeld} wild cards.`,
      naturalCount,
      wildCount,
      points,
    };
  }

  if (ruleset.requireNaturalMajority && wildCount >= naturalCount) {
    return {
      valid: false,
      reason: 'Natural cards must strictly outnumber wild cards in a meld.',
      naturalCount,
      wildCount,
      points,
    };
  }

  return { valid: true, naturalCount, wildCount, points };
}

export function validateAddToMeld(
  meld: Meld,
  addedCards: readonly Card[],
  ruleset: RulesetConfig,
): MeldValidationResult {
  if (addedCards.length === 0) {
    return {
      valid: false,
      reason: 'Select at least one card to add.',
      naturalCount: 0,
      wildCount: 0,
      points: 0,
    };
  }
  if (meld.rank === '3B') {
    return {
      valid: false,
      reason: 'Cannot add cards to a Black 3 meld.',
      naturalCount: 0,
      wildCount: 0,
      points: 0,
    };
  }

  const combined = [...meld.cards, ...addedCards];
  const check = validateMeldCards(combined, meld.rank, ruleset);
  if (!check.valid) return check;

  let addedPoints = 0;
  let addedNaturals = 0;
  let addedWilds = 0;
  for (const c of addedCards) {
    addedPoints += getCardPoints(c);
    if (isWildCard(c)) addedWilds++;
    else addedNaturals++;
  }
  return {
    valid: true,
    naturalCount: addedNaturals,
    wildCount: addedWilds,
    points: addedPoints,
  };
}

export function isDiscardPileFrozenForTeam(
  discardPile: DiscardPile,
  team: TeamState,
): boolean {
  return discardPile.frozenByWildOrInitial || !team.hasMadeInitialMeld;
}

export function canTopDiscardBeClaimed(discardPile: DiscardPile): boolean {
  if (discardPile.cards.length === 0) return false;
  const top = discardPile.cards[discardPile.cards.length - 1];
  if (isWildCard(top) || isBlackThree(top) || isRedThree(top)) return false;
  return isNaturalRank(top.rank);
}

/** Infer meld rank for a list of selected cards, or null if ambiguous/invalid. */
export function inferMeldRank(cards: readonly Card[]): MeldRank | null {
  if (cards.length === 0) return null;
  if (cards.every((c) => isBlackThree(c))) return '3B';
  let foundRank: NaturalRank | null = null;
  for (const c of cards) {
    if (isWildCard(c)) continue;
    if (isRedThree(c) || isBlackThree(c)) return null;
    if (!isNaturalRank(c.rank)) return null;
    if (foundRank === null) foundRank = c.rank;
    else if (foundRank !== c.rank) return null;
  }
  return foundRank;
}

export function isMandatoryStockExhaustedTake(
  state: GameState,
  playerId: string,
): boolean {
  if (state.phase !== 'DRAW' || state.stock.length > 0) return false;
  if (state.partnerGoOut?.status === 'PENDING') return false;
  const player = state.players[state.activePlayerIndex];
  if (player.id !== playerId) return false;
  if (!canTopDiscardBeClaimed(state.discardPile)) return false;

  const team = getTeamById(state.teams, player.teamId);
  if (isDiscardPileFrozenForTeam(state.discardPile, team)) return false;

  const top = state.discardPile.cards[state.discardPile.cards.length - 1];
  const existingMeld = team.melds.find((m) => m.rank === top.rank);
  if (!existingMeld) return false;

  const remainingNonRed3 = state.discardPile.cards
    .slice(0, -1)
    .filter((c) => !isRedThree(c)).length;
  const postHandCount = player.hand.length + remainingNonRed3;
  if (postHandCount <= 1) {
    if (state.partnerGoOut?.status === 'DENIED') return false;
    const postCanastas = countTeamCanastas(
      team.melds.map((m) =>
        m.id === existingMeld.id
          ? buildMeldObject(m.id, m.rank, [...m.cards, top])
          : m,
      ),
    );
    return postCanastas >= state.ruleset.canastasRequiredToGoOut;
  }
  return true;
}

/** Quick check whether a player has ANY legal way to take the discard pile right now. */
export function canPlayerTakeDiscardPile(
  state: GameState,
  playerId: string,
): boolean {
  if (state.phase !== 'DRAW') return false;
  if (state.partnerGoOut?.status === 'PENDING') return false;
  const player = state.players[state.activePlayerIndex];
  if (player.id !== playerId) return false;
  if (!canTopDiscardBeClaimed(state.discardPile)) return false;

  const team = getTeamById(state.teams, player.teamId);
  const top = state.discardPile.cards[state.discardPile.cards.length - 1];
  const topRank = top.rank as NaturalRank;
  const frozen = isDiscardPileFrozenForTeam(state.discardPile, team);
  const matchingNaturals = player.hand.filter((c) => c.rank === topRank);
  const wilds = player.hand.filter((c) => isWildCard(c));
  const existingMeld = team.melds.find((m) => m.rank === topRank);

  if (team.hasMadeInitialMeld) {
    if (!frozen && existingMeld) {
      return true;
    }
    if (existingMeld) {
      return matchingNaturals.length >= 2;
    }
    if (frozen) {
      return matchingNaturals.length >= 2;
    }
    return (
      matchingNaturals.length >= 2 ||
      (matchingNaturals.length >= 1 && wilds.length >= 1)
    );
  }

  if (matchingNaturals.length < 2) return false;

  const required = getRequiredInitialMeldPoints(
    state.ruleset,
    team.cumulativeScore,
  );
  const maxReachable = estimateMaxInitialMeldPointsWithTopCard(
    player.hand,
    top,
    state.ruleset,
  );
  return maxReachable >= required;
}

/** Upper-bound exact check of max initial meld points achievable using topCard + natural pair. */
function estimateMaxInitialMeldPointsWithTopCard(
  hand: readonly Card[],
  topCard: Card,
  ruleset: RulesetConfig,
): number {
  const topRank = topCard.rank as NaturalRank;
  const byRank = new Map<NaturalRank, Card[]>();
  const wilds: Card[] = [];

  for (const c of hand) {
    if (isWildCard(c)) wilds.push(c);
    else if (isNaturalRank(c.rank)) {
      const list = byRank.get(c.rank) ?? [];
      list.push(c);
      byRank.set(c.rank, list);
    }
  }

  const topNaturals = byRank.get(topRank) ?? [];
  if (topNaturals.length < 2) return 0;

  let totalPoints =
    getCardPoints(topCard) +
    topNaturals.reduce((sum, c) => sum + getCardPoints(c), 0);
  let totalWildSlots = ruleset.requireNaturalMajority
    ? Math.min(ruleset.maxWildsPerMeld, topNaturals.length)
    : ruleset.maxWildsPerMeld;

  for (const [rank, cards] of byRank.entries()) {
    if (rank === topRank) continue;
    if (cards.length >= ruleset.minMeldSize) {
      totalPoints += cards.reduce((sum, c) => sum + getCardPoints(c), 0);
      totalWildSlots += ruleset.requireNaturalMajority
        ? Math.min(ruleset.maxWildsPerMeld, cards.length - 1)
        : ruleset.maxWildsPerMeld;
    }
  }

  const sortedWilds = wilds
    .slice()
    .sort((a, b) => getCardPoints(b) - getCardPoints(a));

  const pairs = [...byRank.entries()]
    .filter(([r, cards]) => r !== topRank && cards.length === 2)
    .sort(
      (a, b) =>
        b[1].reduce((s, c) => s + getCardPoints(c), 0) -
        a[1].reduce((s, c) => s + getCardPoints(c), 0),
    );

  const remainingWilds = sortedWilds.slice();
  for (const [, pairCards] of pairs) {
    if (remainingWilds.length === 0) break;
    const wild = remainingWilds.shift()!;
    totalPoints +=
      pairCards.reduce((s, c) => s + getCardPoints(c), 0) + getCardPoints(wild);
    const extraSlots = ruleset.requireNaturalMajority
      ? 0
      : Math.max(0, ruleset.maxWildsPerMeld - 1);
    totalWildSlots += extraSlots;
  }

  const assignable = Math.min(remainingWilds.length, totalWildSlots);
  for (let i = 0; i < assignable; i++) {
    totalPoints += getCardPoints(remainingWilds[i]);
  }

  return totalPoints;
}

/**
 * Checks whether `playerId` can legally go out right now during `MELD_OR_DISCARD`
 * (used to enforce binding Partner Permission YES without ever soft-locking!).
 */
export function canPlayerGoOutNow(state: GameState, playerId: string): boolean {
  if (state.phase !== 'MELD_OR_DISCARD') return false;
  const player = state.players[state.activePlayerIndex];
  if (player.id !== playerId) return false;
  const team = getTeamById(state.teams, player.teamId);
  const ruleset = state.ruleset;
  const hand = player.hand;

  if (hand.length === 0) {
    return countTeamCanastas(team.melds) >= ruleset.canastasRequiredToGoOut;
  }

  // Try each possible final discard (or null = meld every single card out!)
  const candidates: Array<Card | null> = [null, ...hand];

  for (const discardChoice of candidates) {
    if (discardChoice && isRedThree(discardChoice)) continue;
    const toMeld = discardChoice
      ? hand.filter((c) => c.id !== discardChoice.id)
      : hand;

    if (
      canCardsAllBeMeldedOut(
        toMeld,
        team,
        player.id,
        state.tookDiscardPileThisTurn,
        state.meldedThisTurn,
        ruleset,
      )
    ) {
      return true;
    }
  }

  return false;
}

function canCardsAllBeMeldedOut(
  cards: readonly Card[],
  team: TeamState,
  playerId: string,
  tookDiscardPileThisTurn: boolean,
  meldedThisTurn: boolean,
  ruleset: RulesetConfig,
): boolean {
  const existingCanastas = countTeamCanastas(team.melds);
  if (cards.length === 0) {
    return existingCanastas >= ruleset.canastasRequiredToGoOut;
  }

  const existingByRank = new Map<NaturalRank, Meld>();
  for (const m of team.melds) {
    if (m.rank !== '3B') existingByRank.set(m.rank, m);
  }

  const byRank = new Map<NaturalRank, Card[]>();
  const wilds: Card[] = [];
  const blackThrees: Card[] = [];

  for (const c of cards) {
    if (isRedThree(c)) return false;
    if (isWildCard(c)) wilds.push(c);
    else if (isBlackThree(c)) blackThrees.push(c);
    else if (isNaturalRank(c.rank)) {
      const arr = byRank.get(c.rank) ?? [];
      arr.push(c);
      byRank.set(c.rank, arr);
    }
  }

  // Black 3s must be 0 or 3..4 (and no existing 3B meld)
  if (blackThrees.length > 0) {
    if (
      !ruleset.allowBlackThreeMeldOnGoOut ||
      blackThrees.length < 3 ||
      blackThrees.length > 4 ||
      team.melds.some((m) => m.rank === '3B')
    ) {
      return false;
    }
  }

  // Every rank group NOT already on the table needs >= minNaturalsPerMeld naturals
  // and enough wilds to reach minMeldSize.
  let minWildsRequired = 0;
  let totalWildCapacity = 0;
  let naturalOnlyCanastasAdded = 0;

  // Track non-Canasta melds that could reach 7 with extra wilds: [cardsNeeded, wildRoomLeft]
  const canastaOpportunities: Array<{ needed: number; wildRoom: number }> = [];

  // Existing melds that receive naturals from hand (or could absorb wilds)
  for (const m of team.melds) {
    if (m.rank === '3B') continue;
    const addedNats = byRank.get(m.rank)?.length ?? 0;
    const totalNats = m.naturalCount + addedNats;
    const maxWilds = ruleset.requireNaturalMajority
      ? Math.min(ruleset.maxWildsPerMeld, totalNats - 1)
      : ruleset.maxWildsPerMeld;
    const room = Math.max(0, maxWilds - m.wildCount);
    totalWildCapacity += room;
    const sizeWithoutNewWilds = m.cards.length + addedNats;
    if (!m.isCanasta) {
      if (sizeWithoutNewWilds >= 7) {
        naturalOnlyCanastasAdded++;
      } else {
        const needed = 7 - sizeWithoutNewWilds;
        if (room >= needed) {
          canastaOpportunities.push({ needed, wildRoom: room });
        }
      }
    }
  }

  // New rank groups from hand
  for (const [rank, group] of byRank.entries()) {
    if (existingByRank.has(rank)) continue;
    if (group.length < ruleset.minNaturalsPerMeld) return false;
    const neededForMeld = Math.max(0, ruleset.minMeldSize - group.length);
    const maxWilds = ruleset.requireNaturalMajority
      ? Math.min(ruleset.maxWildsPerMeld, group.length - 1)
      : ruleset.maxWildsPerMeld;
    if (neededForMeld > maxWilds) return false;
    minWildsRequired += neededForMeld;
    const extraRoom = maxWilds - neededForMeld;
    totalWildCapacity += maxWilds;

    const baseSize = group.length + neededForMeld;
    if (baseSize >= 7) {
      naturalOnlyCanastasAdded++;
    } else {
      const extraNeeded = 7 - baseSize;
      if (extraRoom >= extraNeeded) {
        canastaOpportunities.push({ needed: extraNeeded, wildRoom: extraRoom });
      }
    }
  }

  if (wilds.length < minWildsRequired) return false;
  if (wilds.length > totalWildCapacity) return false;

  // Greedily allocate remaining wilds to finish Canastas (fewest needed first)
  let spareWilds = wilds.length - minWildsRequired;
  canastaOpportunities.sort((a, b) => a.needed - b.needed);
  let extraCanastas = 0;
  for (const opp of canastaOpportunities) {
    if (spareWilds >= opp.needed) {
      spareWilds -= opp.needed;
      extraCanastas++;
    }
  }

  const totalCanastas =
    existingCanastas + naturalOnlyCanastasAdded + extraCanastas;
  if (totalCanastas < ruleset.canastasRequiredToGoOut) return false;

  // Check initial meld threshold if team hasn't melded yet
  if (!team.hasMadeInitialMeld) {
    const playerMeldedBefore = team.meldedOnPriorTurnPlayerIds.includes(playerId);
    const waivedByConcealedStock =
      !playerMeldedBefore && !meldedThisTurn && !tookDiscardPileThisTurn;
    if (!waivedByConcealedStock) {
      const pts = cards.reduce((s, c) => s + getCardPoints(c), 0);
      const req = getRequiredInitialMeldPoints(ruleset, team.cumulativeScore);
      if (pts < req) return false;
    }
  }

  return true;
}

export function validateTakeDiscardPileAction(
  state: GameState,
  action: Extract<GameAction, { type: 'TAKE_DISCARD_PILE' }>,
):
  | {
      ok: true;
      nextMelds: Meld[];
      usedHandCardIds: Set<string>;
      meldPoints: number;
    }
  | { ok: false; error: string } {
  if (state.phase !== 'DRAW') {
    return {
      ok: false,
      error: 'You can only take the discard pile during the draw phase.',
    };
  }
  if (state.partnerGoOut?.status === 'PENDING') {
    return {
      ok: false,
      error: 'Waiting for your partner to answer your go-out request.',
    };
  }
  const player = state.players[state.activePlayerIndex];
  if (player.id !== action.playerId) {
    return { ok: false, error: 'It is not your turn.' };
  }
  if (!canTopDiscardBeClaimed(state.discardPile)) {
    return {
      ok: false,
      error: 'The top card of the discard pile cannot be taken.',
    };
  }

  const team = getTeamById(state.teams, player.teamId);
  const topCard = state.discardPile.cards[state.discardPile.cards.length - 1];
  const topRank = topCard.rank as NaturalRank;
  const frozen = isDiscardPileFrozenForTeam(state.discardPile, team);
  const handById = new Map(player.hand.map((c) => [c.id, c]));
  const usedHandCardIds = new Set<string>();
  const nextMelds = team.melds.map((m) => ({ ...m, cards: m.cards.slice() }));
  let meldPoints = 0;

  if (action.topCardUsage.kind === 'add_to_meld') {
    if (frozen) {
      return {
        ok: false,
        error:
          'The discard pile is frozen — you must meld the top card with a natural pair from your hand.',
      };
    }
    const targetMeldId = action.topCardUsage.meldId;
    const idx = nextMelds.findIndex((m) => m.id === targetMeldId);
    if (idx === -1) {
      return { ok: false, error: 'Target meld not found.' };
    }
    if (nextMelds[idx].rank !== topRank) {
      return {
        ok: false,
        error: `Top card ${topRank} does not match target meld rank ${nextMelds[idx].rank}.`,
      };
    }
    const check = validateAddToMeld(nextMelds[idx], [topCard], state.ruleset);
    if (!check.valid)
      return { ok: false, error: check.reason ?? 'Invalid addition to meld.' };
    nextMelds[idx] = buildMeldObject(nextMelds[idx].id, nextMelds[idx].rank, [
      ...nextMelds[idx].cards,
      topCard,
    ]);
    meldPoints += getCardPoints(topCard);
  } else {
    const handCards: Card[] = [];
    for (const id of action.topCardUsage.handCardIds) {
      if (usedHandCardIds.has(id)) {
        return { ok: false, error: 'Duplicate card selected.' };
      }
      const card = handById.get(id);
      if (!card) return { ok: false, error: 'Selected card is not in your hand.' };
      usedHandCardIds.add(id);
      handCards.push(card);
    }

    const matchingNaturalsInSelection = handCards.filter(
      (c) => c.rank === topRank,
    ).length;
    if (frozen && matchingNaturalsInSelection < 2) {
      return {
        ok: false,
        error:
          'The discard pile is frozen — you must use at least two natural matching cards from your hand.',
      };
    }

    const existingIdx = nextMelds.findIndex((m) => m.rank === topRank);
    const combinedNew = [topCard, ...handCards];

    if (existingIdx !== -1) {
      const check = validateAddToMeld(
        nextMelds[existingIdx],
        combinedNew,
        state.ruleset,
      );
      if (!check.valid)
        return { ok: false, error: check.reason ?? 'Invalid cards for existing meld.' };
      nextMelds[existingIdx] = buildMeldObject(
        nextMelds[existingIdx].id,
        nextMelds[existingIdx].rank,
        [...nextMelds[existingIdx].cards, ...combinedNew],
      );
      meldPoints += check.points;
    } else {
      const check = validateMeldCards(combinedNew, topRank, state.ruleset);
      if (!check.valid)
        return { ok: false, error: check.reason ?? 'Invalid meld with top discard card.' };
      nextMelds.push(buildMeldObject(`temp-top-${topRank}`, topRank, combinedNew));
      meldPoints += check.points;
    }
  }

  const additional = action.additionalInitialMelds ?? [];
  if (additional.length > 0 && team.hasMadeInitialMeld) {
    return {
      ok: false,
      error:
        'Additional melds should be played after taking the discard pile once initial meld is complete.',
    };
  }

  for (let i = 0; i < additional.length; i++) {
    const item = additional[i];
    if (item.rank === '3B') {
      return {
        ok: false,
        error: 'Black 3s cannot be used as part of an initial meld pickup.',
      };
    }
    if (nextMelds.some((m) => m.rank === item.rank)) {
      return {
        ok: false,
        error: `Cannot create duplicate meld for rank ${item.rank}.`,
      };
    }
    const cards: Card[] = [];
    for (const id of item.cardIds) {
      if (usedHandCardIds.has(id)) {
        return { ok: false, error: 'A card cannot be used in two melds.' };
      }
      const c = handById.get(id);
      if (!c) return { ok: false, error: 'Selected card is not in your hand.' };
      usedHandCardIds.add(id);
      cards.push(c);
    }
    const check = validateMeldCards(cards, item.rank, state.ruleset);
    if (!check.valid)
      return { ok: false, error: check.reason ?? 'Invalid additional meld.' };
    nextMelds.push(buildMeldObject(`temp-init-${i}-${item.rank}`, item.rank, cards));
    meldPoints += check.points;
  }

  if (!team.hasMadeInitialMeld) {
    const required = getRequiredInitialMeldPoints(
      state.ruleset,
      team.cumulativeScore,
    );
    if (meldPoints < required) {
      return {
        ok: false,
        error: `Initial meld requires at least ${required} points (currently ${meldPoints} points).`,
      };
    }
  }

  const buriedNonRed3Count = state.discardPile.cards
    .slice(0, -1)
    .filter((c) => !isRedThree(c)).length;
  const remainingHandCount =
    player.hand.length - usedHandCardIds.size + buriedNonRed3Count;
  if (remainingHandCount <= 1) {
    if (state.partnerGoOut?.status === 'DENIED') {
      return {
        ok: false,
        error:
          'Your partner denied going out — you must keep at least 2 cards before discarding on this turn.',
      };
    }
    const canastas = countTeamCanastas(nextMelds);
    if (canastas < state.ruleset.canastasRequiredToGoOut) {
      return {
        ok: false,
        error: `You must keep at least 2 cards before discarding until you complete ${state.ruleset.canastasRequiredToGoOut} Canasta(s).`,
      };
    }
  }

  return { ok: true, nextMelds, usedHandCardIds, meldPoints };
}

export function validateCommitMeldsAction(
  state: GameState,
  action: Extract<GameAction, { type: 'COMMIT_MELDS' }>,
):
  | {
      ok: true;
      nextMelds: Meld[];
      usedHandCardIds: Set<string>;
      meldPoints: number;
      isConcealedGoOutCandidate: boolean;
    }
  | { ok: false; error: string } {
  if (state.phase !== 'MELD_OR_DISCARD') {
    return { ok: false, error: 'Melds can only be played after drawing.' };
  }
  if (state.partnerGoOut?.status === 'PENDING') {
    return {
      ok: false,
      error: 'Waiting for your partner to answer your go-out request.',
    };
  }
  const player = state.players[state.activePlayerIndex];
  if (player.id !== action.playerId) {
    return { ok: false, error: 'It is not your turn.' };
  }
  if (action.submissions.length === 0) {
    return { ok: false, error: 'No melds were submitted.' };
  }

  const team = getTeamById(state.teams, player.teamId);
  const handById = new Map(player.hand.map((c) => [c.id, c]));
  const usedHandCardIds = new Set<string>();
  const nextMelds = team.melds.map((m) => ({ ...m, cards: m.cards.slice() }));

  const resolvedSubmissions: Array<{ sub: MeldSubmission; cards: Card[] }> = [];
  for (const sub of action.submissions) {
    if (sub.cardIds.length === 0) {
      return {
        ok: false,
        error: 'Each meld submission must include at least one card.',
      };
    }
    const cards: Card[] = [];
    for (const id of sub.cardIds) {
      if (usedHandCardIds.has(id)) {
        return { ok: false, error: 'A card cannot be used in multiple melds.' };
      }
      const c = handById.get(id);
      if (!c) return { ok: false, error: 'Selected card is not in your hand.' };
      usedHandCardIds.add(id);
      cards.push(c);
    }
    resolvedSubmissions.push({ sub, cards });
  }

  const remainingHandCount = player.hand.length - usedHandCardIds.size;
  const hasBlackThreeSub = action.submissions.some(
    (s) => s.kind === 'new_meld' && s.rank === '3B',
  );

  let meldPoints = 0;
  for (let i = 0; i < resolvedSubmissions.length; i++) {
    const { sub, cards } = resolvedSubmissions[i];
    if (sub.kind === 'new_meld') {
      if (nextMelds.some((m) => m.rank === sub.rank)) {
        return {
          ok: false,
          error: `Your team already has a meld of ${sub.rank === '3B' ? 'Black 3s' : sub.rank}s — add to it instead.`,
        };
      }
      const check = validateMeldCards(cards, sub.rank, state.ruleset, {
        isGoingOut: remainingHandCount <= 1,
      });
      if (!check.valid) return { ok: false, error: check.reason ?? 'Invalid meld.' };
      nextMelds.push(buildMeldObject(`temp-new-${i}-${sub.rank}`, sub.rank, cards));
      meldPoints += check.points;
    } else {
      const idx = nextMelds.findIndex((m) => m.id === sub.meldId);
      if (idx === -1) {
        return { ok: false, error: 'Target meld not found.' };
      }
      const check = validateAddToMeld(nextMelds[idx], cards, state.ruleset);
      if (!check.valid)
        return { ok: false, error: check.reason ?? 'Invalid meld addition.' };
      nextMelds[idx] = buildMeldObject(nextMelds[idx].id, nextMelds[idx].rank, [
        ...nextMelds[idx].cards,
        ...cards,
      ]);
      meldPoints += check.points;
    }
  }

  const postCanastas = countTeamCanastas(nextMelds);

  if (remainingHandCount <= 1 && state.partnerGoOut?.status === 'DENIED') {
    return {
      ok: false,
      error:
        'Your partner denied going out — you must keep at least 2 cards before discarding on this turn.',
    };
  }

  if (hasBlackThreeSub) {
    if (
      remainingHandCount > 1 ||
      postCanastas < state.ruleset.canastasRequiredToGoOut
    ) {
      return {
        ok: false,
        error: `Black 3s can only be melded when going out (requires ${state.ruleset.canastasRequiredToGoOut} Canasta(s) and at most 1 card left to discard).`,
      };
    }
  }

  if (
    remainingHandCount <= 1 &&
    postCanastas < state.ruleset.canastasRequiredToGoOut
  ) {
    return {
      ok: false,
      error: `You must keep at least 2 cards (1 to discard + 1 in hand) until you complete ${state.ruleset.canastasRequiredToGoOut} Canasta(s).`,
    };
  }

  const playerMeldedBefore = team.meldedOnPriorTurnPlayerIds.includes(player.id);
  const isConcealedGoOutCandidate =
    !playerMeldedBefore &&
    !state.meldedThisTurn &&
    remainingHandCount <= 1 &&
    postCanastas >= state.ruleset.canastasRequiredToGoOut;

  if (!team.hasMadeInitialMeld) {
    const waivedByConcealedStock =
      isConcealedGoOutCandidate && !state.tookDiscardPileThisTurn;
    if (!waivedByConcealedStock) {
      const required = getRequiredInitialMeldPoints(
        state.ruleset,
        team.cumulativeScore,
      );
      if (meldPoints < required) {
        return {
          ok: false,
          error: `Initial meld requires at least ${required} points (submitted ${meldPoints} points).`,
        };
      }
    }
  }

  return {
    ok: true,
    nextMelds,
    usedHandCardIds,
    meldPoints,
    isConcealedGoOutCandidate,
  };
}
