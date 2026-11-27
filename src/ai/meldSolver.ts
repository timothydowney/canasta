import {
  getCardPoints,
  isNaturalRank,
  isWildCard,
  validateMeldCards,
  type Card,
  type Meld,
  type MeldDraftItem,
  type NaturalRank,
  type RulesetConfig,
} from '../engine';

export interface CandidateMeld {
  rank: NaturalRank;
  cards: Card[];
  points: number;
  wildCount: number;
  completesCanasta: boolean;
  isNaturalCanasta: boolean;
}

export interface InitialMeldPlan {
  melds: MeldDraftItem[];
  totalPoints: number;
  wildsUsed: number;
  cardsUsedCount: number;
  canastasFormed: number;
}

/**
 * Group natural cards by rank and separate wild cards sorted ascending by cost
 * (prefer spending 20-pt 2s before 50-pt Jokers unless extra points are needed).
 */
export function partitionHand(hand: readonly Card[]): {
  byRank: Map<NaturalRank, Card[]>;
  wilds: Card[];
  blackThrees: Card[];
} {
  const byRank = new Map<NaturalRank, Card[]>();
  const wilds: Card[] = [];
  const blackThrees: Card[] = [];

  for (const c of hand) {
    if (isWildCard(c)) {
      wilds.push(c);
    } else if (c.rank === '3' && c.color === 'black') {
      blackThrees.push(c);
    } else if (isNaturalRank(c.rank)) {
      const arr = byRank.get(c.rank) ?? [];
      arr.push(c);
      byRank.set(c.rank, arr);
    }
  }

  // Sort wilds: 2s first (cheaper to spend), Jokers last
  wilds.sort((a, b) => getCardPoints(a) - getCardPoints(b));
  return { byRank, wilds, blackThrees };
}

/**
 * Find an optimal initial meld combination meeting `requiredPoints`.
 * If `forcedTopCard` is provided (taking discard pile), it MUST be melded with
 * at least 2 natural matching cards from hand (pile is frozen pre-initial-meld).
 */
export function findBestInitialMeld(
  hand: readonly Card[],
  requiredPoints: number,
  ruleset: RulesetConfig,
  options: {
    forcedTopCard?: Card;
    extraBuriedCount?: number;
  } = {},
): InitialMeldPlan | null {
  const { byRank, wilds } = partitionHand(hand);
  const forcedTopCard = options.forcedTopCard;
  const extraBuriedCount = options.extraBuriedCount ?? 0;

  let forcedRank: NaturalRank | null = null;
  if (forcedTopCard) {
    if (!isNaturalRank(forcedTopCard.rank)) return null;
    forcedRank = forcedTopCard.rank;
    const nat = byRank.get(forcedRank) ?? [];
    if (nat.length < 2) return null;
  }

  // Order ranks to explore: forcedRank first (if any), then all ranks with >= 2 naturals
  const ranks: NaturalRank[] = [];
  if (forcedRank) ranks.push(forcedRank);
  for (const [rank, cards] of byRank.entries()) {
    if (rank === forcedRank) continue;
    if (cards.length >= ruleset.minNaturalsPerMeld) {
      ranks.push(rank);
    }
  }

  if (forcedRank && ranks[0] !== forcedRank) return null;

  // Wilds sorted descending by points for high-point fill, ascending for frugal fill
  const wildsHighFirst = wilds
    .slice()
    .sort((a, b) => getCardPoints(b) - getCardPoints(a));

  let bestPlan: InitialMeldPlan | null = null;
  let bestCost = Infinity;

  interface Choice {
    rank: NaturalRank;
    naturalCards: Card[];
    wildCount: number;
    includesForcedTop: boolean;
  }

  const chosen: Choice[] = [];

  function evaluateChosen() {
    let totalWildsNeeded = 0;
    let naturalPoints = 0;
    let usedFromHand = 0;
    let canastasFormed = 0;

    for (const ch of chosen) {
      totalWildsNeeded += ch.wildCount;
      for (const c of ch.naturalCards) naturalPoints += getCardPoints(c);
      if (ch.includesForcedTop && forcedTopCard) {
        naturalPoints += getCardPoints(forcedTopCard);
      }
      usedFromHand += ch.naturalCards.length + ch.wildCount;
      const totalLen =
        ch.naturalCards.length + ch.wildCount + (ch.includesForcedTop ? 1 : 0);
      if (totalLen >= 7) canastasFormed++;
    }

    if (totalWildsNeeded > wilds.length) return;

    // Respect one-card deadlock rule: post-hand must be >= 2 OR going out with enough canastas
    const postHand = hand.length - usedFromHand + extraBuriedCount;
    if (postHand <= 1 && canastasFormed < ruleset.canastasRequiredToGoOut) {
      return;
    }

    // Pick which wild cards to spend: try frugal (2s first) if enough points, else high-value (Jokers first)
    let pickedWilds: Card[] = [];
    if (totalWildsNeeded > 0) {
      const frugal = wilds.slice(0, totalWildsNeeded);
      const frugalPts =
        naturalPoints + frugal.reduce((s, c) => s + getCardPoints(c), 0);
      if (frugalPts >= requiredPoints) {
        pickedWilds = frugal;
      } else {
        const heavy = wildsHighFirst.slice(0, totalWildsNeeded);
        const heavyPts =
          naturalPoints + heavy.reduce((s, c) => s + getCardPoints(c), 0);
        if (heavyPts < requiredPoints) return;
        pickedWilds = heavy;
      }
    } else if (naturalPoints < requiredPoints) {
      return;
    }

    const totalPoints =
      naturalPoints + pickedWilds.reduce((s, c) => s + getCardPoints(c), 0);
    if (totalPoints < requiredPoints) return;

    // Cost heuristic: strongly minimize wilds spent, prefer fewer Jokers, prefer Canastas & higher points
    const jokersUsed = pickedWilds.filter((c) => c.rank === 'JOKER').length;
    const cost =
      totalWildsNeeded * 100 +
      jokersUsed * 40 -
      canastasFormed * 250 -
      Math.min(totalPoints - requiredPoints, 60) * 0.25;

    if (cost < bestCost) {
      // Distribute pickedWilds across chosen melds
      let wIdx = 0;
      const melds: MeldDraftItem[] = [];
      for (const ch of chosen) {
        const assignedWilds = pickedWilds.slice(wIdx, wIdx + ch.wildCount);
        wIdx += ch.wildCount;
        const cardIds = [
          ...ch.naturalCards.map((c) => c.id),
          ...assignedWilds.map((c) => c.id),
        ];
        // Double check validity with forcedTopCard if applicable
        const checkCards = ch.includesForcedTop && forcedTopCard
          ? [forcedTopCard, ...ch.naturalCards, ...assignedWilds]
          : [...ch.naturalCards, ...assignedWilds];
        if (!validateMeldCards(checkCards, ch.rank, ruleset).valid) return;
        melds.push({ kind: 'new_meld', rank: ch.rank, cardIds });
      }

      bestCost = cost;
      bestPlan = {
        melds,
        totalPoints,
        wildsUsed: totalWildsNeeded,
        cardsUsedCount: usedFromHand,
        canastasFormed,
      };
    }
  }

  function dfs(idx: number, wildsRemaining: number) {
    if (idx === ranks.length) {
      if (chosen.length > 0) evaluateChosen();
      return;
    }

    const rank = ranks[idx];
    const naturals = byRank.get(rank)!;
    const isForced = rank === forcedRank;
    const effectiveNaturals = naturals.length + (isForced ? 1 : 0);

    // Branch 1: skip this rank (only allowed if not forced)
    if (!isForced) {
      dfs(idx + 1, wildsRemaining);
    }

    // Branch 2: include this rank with 0..maxAllowedWilds
    const minWildsNeeded = Math.max(0, ruleset.minMeldSize - effectiveNaturals);
    const maxWildsAllowed = Math.min(
      wildsRemaining,
      ruleset.maxWildsPerMeld,
      ruleset.requireNaturalMajority ? effectiveNaturals - 1 : ruleset.maxWildsPerMeld,
    );

    for (let w = minWildsNeeded; w <= maxWildsAllowed; w++) {
      // To keep branching tight, normally use all naturals of this rank;
      // if using all would leave 0-1 cards illegally, also allow using just enough naturals (2 or 3)
      const natSlices: Card[][] = [naturals];
      if (naturals.length > 2) {
        const minNat = Math.max(
          isForced ? 2 : ruleset.minNaturalsPerMeld,
          ruleset.minMeldSize - w - (isForced ? 1 : 0),
        );
        if (minNat < naturals.length) {
          natSlices.push(naturals.slice(0, minNat));
        }
      }

      for (const natCards of natSlices) {
        chosen.push({
          rank,
          naturalCards: natCards,
          wildCount: w,
          includesForcedTop: isForced,
        });
        dfs(idx + 1, wildsRemaining - w);
        chosen.pop();
      }
    }
  }

  dfs(0, wilds.length);
  return bestPlan;
}

export function countExistingCanastas(melds: readonly Meld[]): number {
  return melds.reduce((acc, m) => acc + (m.isCanasta ? 1 : 0), 0);
}
