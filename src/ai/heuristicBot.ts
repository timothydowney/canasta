import {
  getCardPoints,
  isBlackThree,
  isNaturalRank,
  isWildCard,
  nextRng,
  validateAddToMeld,
  validateMeldCards,
  type BotDifficulty,
  type Card,
  type GameAction,
  type Meld,
  type MeldSubmission,
  type NaturalRank,
  type PlayerView,
} from '../engine';
import type { PlayerController } from './controller';
import {
  countExistingCanastas,
  findBestInitialMeld,
  partitionHand,
} from './meldSolver';

export class HeuristicBotController implements PlayerController {
  readonly id: string;
  readonly difficulty: BotDifficulty;
  private rngState: number;

  constructor(id: string, difficulty: BotDifficulty = 'normal', seed = 42) {
    this.id = id;
    this.difficulty = difficulty;
    this.rngState = seed >>> 0;
  }

  chooseAction(view: PlayerView): GameAction {
    if (view.phase === 'DRAW') {
      return this.chooseDrawAction(view);
    }
    if (view.phase === 'MELD_OR_DISCARD') {
      const meldAction = this.chooseMeldAction(view);
      if (meldAction) return meldAction;
      return this.chooseDiscardAction(view);
    }
    throw new Error(`Bot ${this.id} invoked in non-playable phase: ${view.phase}`);
  }

  private jitter(magnitude: number): number {
    if (this.difficulty !== 'easy') return 0;
    const [r, next] = nextRng(this.rngState);
    this.rngState = next;
    return (r - 0.5) * 2 * magnitude;
  }

  private getTeams(view: PlayerView) {
    const myTeam = view.teams[view.viewerTeamId === 'team-0' ? 0 : 1];
    const oppTeam = view.teams[view.viewerTeamId === 'team-0' ? 1 : 0];
    return { myTeam, oppTeam };
  }

  private getOppMinHandCount(view: PlayerView): number {
    return Math.min(
      ...view.players
        .filter((p) => p.teamId !== view.viewerTeamId)
        .map((p) => p.handCount),
    );
  }

  /**
   * Hard difficulty distinguishes patient early/mid-hand play (holding pairs to
   * ambush frozen piles, conserving wilds) from endgame lock-down / go-out push.
   */
  private isEndgame(view: PlayerView): boolean {
    const { myTeam, oppTeam } = this.getTeams(view);
    const myCanastas = countExistingCanastas(myTeam.melds);
    const oppCanastas = countExistingCanastas(oppTeam.melds);
    const oppMinCards = this.getOppMinHandCount(view);
    const req = view.ruleset.canastasRequiredToGoOut;

    return (
      view.stockCount <= 18 ||
      oppMinCards <= 5 ||
      myCanastas >= req ||
      (myCanastas >= req - 1 && view.viewerHand.length <= 10) ||
      (oppCanastas >= req - 1 && oppMinCards <= 8)
    );
  }

  private chooseDrawAction(view: PlayerView): GameAction {
    const { myTeam } = this.getTeams(view);
    const topCard = view.discardPile.topCard;

    // 1. Evaluate taking discard pile if legal
    if (view.legalHints.canTakeDiscardPile && topCard && isNaturalRank(topCard.rank)) {
      const takePlan = this.planTakeDiscardPile(view, topCard, myTeam.melds);
      if (takePlan) {
        if (view.legalHints.mustTakeDiscardPile) {
          return takePlan.action;
        }
        const oppMinCards = this.getOppMinHandCount(view);
        let utility = takePlan.utility + this.jitter(35);

        // Penalize taking a tiny pile when opponent is close to going out
        if (oppMinCards <= 4 && view.discardPile.count <= 2) {
          utility -= 160;
        }

        const threshold =
          view.stockCount === 0
            ? -40
            : this.difficulty === 'easy'
              ? 45
              : this.difficulty === 'normal'
                ? 40
                : 55;

        if (utility >= threshold) {
          return takePlan.action;
        }
      }
    }

    if (view.legalHints.canDrawStock) {
      return { type: 'DRAW_STOCK', playerId: this.id };
    }

    if (view.legalHints.canPassExhaustedStock) {
      return { type: 'PASS_EXHAUSTED_STOCK', playerId: this.id };
    }

    // Fallback for mandatory take
    if (topCard && isNaturalRank(topCard.rank)) {
      const existing = myTeam.melds.find((m) => m.rank === topCard.rank);
      if (existing) {
        return {
          type: 'TAKE_DISCARD_PILE',
          playerId: this.id,
          topCardUsage: { kind: 'add_to_meld', meldId: existing.id },
        };
      }
    }

    return { type: 'DRAW_STOCK', playerId: this.id };
  }

  private planTakeDiscardPile(
    view: PlayerView,
    topCard: Card,
    myMelds: readonly Meld[],
  ): {
    action: Extract<GameAction, { type: 'TAKE_DISCARD_PILE' }>;
    utility: number;
  } | null {
    const topRank = topCard.rank as NaturalRank;
    const hand = view.viewerHand;
    const frozen = view.discardPile.isFrozenForViewer;
    const pileCount = view.discardPile.count;
    const buriedCount = Math.max(0, pileCount - 1);
    const { myTeam } = this.getTeams(view);
    const existingMeld = myMelds.find((m) => m.rank === topRank);
    const currentCanastas = countExistingCanastas(myMelds);

    // In 2-player Canasta, drawing from stock yields 2 fresh cards.
    // Normal & Hard account for that opportunity cost so they don't scoop a weak 1-card pile.
    const stockDrawCost =
      this.difficulty === 'easy'
        ? 0
        : view.stockCount > 0
          ? view.ruleset.drawCount * 24
          : 0;

    const { byRank, wilds } = partitionHand(hand);
    const matchingNaturals = byRank.get(topRank) ?? [];

    // Case A: Initial meld not made yet -> must use natural pair + optional extra melds
    if (!myTeam.hasMadeInitialMeld) {
      const plan = findBestInitialMeld(
        hand,
        view.legalHints.initialMeldRequired,
        view.ruleset,
        {
          forcedTopCard: topCard,
          extraBuriedCount: buriedCount,
        },
      );
      if (!plan) return null;

      const topMeld = plan.melds[0];
      const extraMelds = plan.melds.slice(1);
      const wildPenalty = this.difficulty === 'hard' ? 55 : 35;
      const utility =
        pileCount * 28 +
        getCardPoints(topCard) +
        (pileCount >= 3 ? 110 : 40) +
        plan.canastasFormed * 320 -
        plan.wildsUsed * wildPenalty -
        stockDrawCost;

      return {
        action: {
          type: 'TAKE_DISCARD_PILE',
          playerId: this.id,
          topCardUsage: { kind: 'new_meld', handCardIds: topMeld.cardIds },
          additionalInitialMelds: extraMelds.length > 0 ? extraMelds : undefined,
        },
        utility,
      };
    }

    // Case B: Initial meld already made, unfrozen, matches existing meld
    if (!frozen && existingMeld) {
      const postHand = hand.length + buriedCount;
      const completesCanasta =
        !existingMeld.isCanasta && existingMeld.cards.length + 1 >= 7;
      const postCanastas = currentCanastas + (completesCanasta ? 1 : 0);
      if (postHand <= 1 && postCanastas < view.ruleset.canastasRequiredToGoOut) {
        return null;
      }
      // On Normal/Hard, a 1-card pile gives 0 net cards to hand (only +1 to meld),
      // so skip unless it completes a Canasta, helps go out, or stock is empty!
      const helpsCloseNatural =
        !existingMeld.isCanasta &&
        existingMeld.wildCount === 0 &&
        existingMeld.cards.length === 5;
      const utility =
        pileCount * 26 +
        getCardPoints(topCard) +
        (completesCanasta ? (existingMeld.wildCount === 0 ? 480 : 300) : 0) +
        (helpsCloseNatural ? 35 : 0) +
        (this.difficulty === 'easy' ? 25 : 0) -
        stockDrawCost;

      return {
        action: {
          type: 'TAKE_DISCARD_PILE',
          playerId: this.id,
          topCardUsage: { kind: 'add_to_meld', meldId: existingMeld.id },
        },
        utility,
      };
    }

    // Case C: Natural pair in hand (works for both frozen and unfrozen)
    if (matchingNaturals.length >= 2) {
      const pairIds = [matchingNaturals[0].id, matchingNaturals[1].id];
      const postHand = hand.length - 2 + buriedCount;
      const completesCanasta = existingMeld
        ? !existingMeld.isCanasta && existingMeld.cards.length + 3 >= 7
        : false;
      const postCanastas = currentCanastas + (completesCanasta ? 1 : 0);
      if (postHand <= 1 && postCanastas < view.ruleset.canastasRequiredToGoOut) {
        return null;
      }
      const utility =
        pileCount * 30 +
        getCardPoints(topCard) * 1.5 +
        (completesCanasta ? 380 : 10) -
        stockDrawCost;

      return {
        action: {
          type: 'TAKE_DISCARD_PILE',
          playerId: this.id,
          topCardUsage: { kind: 'new_meld', handCardIds: pairIds },
        },
        utility,
      };
    }

    // Case D: Unfrozen, no existing meld, 1 matching natural + 1 wild
    if (!frozen && !existingMeld && matchingNaturals.length >= 1 && wilds.length >= 1) {
      const postHand = hand.length - 2 + buriedCount;
      if (postHand <= 1 && currentCanastas < view.ruleset.canastasRequiredToGoOut) {
        return null;
      }
      const wildCard = wilds[0];
      const wildCost =
        this.difficulty === 'hard'
          ? wildCard.rank === 'JOKER'
            ? 145
            : 95
          : wildCard.rank === 'JOKER'
            ? 95
            : 55;
      const utility =
        pileCount * 28 + getCardPoints(topCard) - wildCost - stockDrawCost;

      return {
        action: {
          type: 'TAKE_DISCARD_PILE',
          playerId: this.id,
          topCardUsage: {
            kind: 'new_meld',
            handCardIds: [matchingNaturals[0].id, wildCard.id],
          },
        },
        utility,
      };
    }

    return null;
  }

  private chooseMeldAction(view: PlayerView): GameAction | null {
    const { myTeam } = this.getTeams(view);
    const hand = view.viewerHand;
    if (hand.length <= 1) return null;

    const isHard = this.difficulty === 'hard';
    const endgame = this.isEndgame(view);

    // 1. Before initial meld: run exact solver
    if (!myTeam.hasMadeInitialMeld) {
      const plan = findBestInitialMeld(
        hand,
        view.legalHints.initialMeldRequired,
        view.ruleset,
      );
      if (!plan) return null;

      // Hard bot exercises patience: if stock is deep and opponent isn't threatening,
      // don't burn 2+ wild cards on a bare minimum initial meld (wait for naturals).
      if (
        isHard &&
        !endgame &&
        view.stockCount > 28 &&
        plan.canastasFormed === 0 &&
        plan.wildsUsed >= 2 &&
        hand.length <= 18
      ) {
        return null;
      }

      return {
        type: 'COMMIT_MELDS',
        playerId: this.id,
        submissions: plan.melds,
      };
    }

    // 2. After initial meld: build melds & additions according to difficulty strategy
    const { byRank, wilds, blackThrees } = partitionHand(hand);
    const availableWilds = wilds.slice();
    const submissions: MeldSubmission[] = [];
    const usedIds = new Set<string>();
    let projectedCanastas = countExistingCanastas(myTeam.melds);

    const existingByRank = new Map<NaturalRank, Meld>();
    for (const m of myTeam.melds) {
      if (m.rank !== '3B') existingByRank.set(m.rank, m);
    }

    const meldSizes = new Map<
      string,
      { cards: Card[]; wilds: number; isCanasta: boolean }
    >();
    for (const m of myTeam.melds) {
      meldSizes.set(m.id, {
        cards: m.cards.slice(),
        wilds: m.wildCount,
        isCanasta: m.isCanasta,
      });
    }

    // Step 2a: Add natural cards to existing melds
    for (const [rank, natCards] of byRank.entries()) {
      const existing = existingByRank.get(rank);
      if (!existing || natCards.length === 0) continue;

      // Hard patience: if this meld is ALREADY a completed Canasta and we hold a pair
      // early/mid-game, keep the pair in hand so we can still ambush a frozen discard pile!
      if (
        isHard &&
        !endgame &&
        existing.isCanasta &&
        natCards.length >= 2 &&
        hand.length <= 15
      ) {
        continue;
      }

      const sim = meldSizes.get(existing.id)!;
      const check = validateAddToMeld(existing, natCards, view.ruleset);
      if (!check.valid) continue;
      submissions.push({
        kind: 'add_to_meld',
        meldId: existing.id,
        cardIds: natCards.map((c) => c.id),
      });
      for (const c of natCards) usedIds.add(c.id);
      const wasCanasta = sim.isCanasta;
      sim.cards.push(...natCards);
      if (!wasCanasta && sim.cards.length >= 7) {
        sim.isCanasta = true;
        projectedCanastas++;
      }
    }

    // Step 2b: Create new natural melds (3+ naturals of a rank not yet melded)
    const createdRanks = new Set<NaturalRank>();
    for (const [rank, natCards] of byRank.entries()) {
      if (existingByRank.has(rank)) continue;
      if (natCards.length < view.ruleset.minMeldSize) continue;
      if (!validateMeldCards(natCards, rank, view.ruleset).valid) continue;

      // Hard patience: early/mid-hand, hold thin 3-card sets (4-Q) in hand to keep
      // discard flexibility and ambush frozen discard piles; do lay down 4+ naturals
      // (strong Natural Canasta candidates) or whenever hand grows large (> 14 cards).
      if (
        isHard &&
        !endgame &&
        natCards.length === 3 &&
        hand.length - usedIds.size <= 14 &&
        getCardPoints(natCards[0]) <= 10
      ) {
        continue;
      }

      submissions.push({
        kind: 'new_meld',
        rank,
        cardIds: natCards.map((c) => c.id),
      });
      createdRanks.add(rank);
      for (const c of natCards) usedIds.add(c.id);
      if (natCards.length >= 7) projectedCanastas++;
    }

    // Step 2c: Use wild cards strategically to complete Mixed Canastas
    if (availableWilds.length > 0) {
      const candidates = myTeam.melds
        .filter((m) => m.rank !== '3B' && !m.isCanasta)
        .map((m) => {
          const sim = meldSizes.get(m.id)!;
          return { meld: m, sim, needed: Math.max(0, 7 - sim.cards.length) };
        })
        .filter((x) => x.needed > 0)
        .sort((a, b) => a.needed - b.needed);

      for (const { meld, sim, needed } of candidates) {
        const wildRoom = view.ruleset.maxWildsPerMeld - sim.wilds;
        if (wildRoom < needed || availableWilds.length < needed) continue;

        // Protect pure-natural Canasta candidates (5–6 naturals) while stock is healthy
        if (
          (this.difficulty === 'normal' || isHard) &&
          !endgame &&
          sim.wilds === 0 &&
          sim.cards.length >= 5 &&
          availableWilds.length < 3 &&
          hand.length - usedIds.size > 5
        ) {
          continue;
        }
        // Hard bot avoids burning 2+ wilds on a 5-card meld early when not in endgame
        if (isHard && !endgame && needed >= 2 && view.stockCount > 24) {
          continue;
        }

        const spentWilds = availableWilds.splice(0, needed);
        const existingSub = submissions.find(
          (s) => s.kind === 'add_to_meld' && s.meldId === meld.id,
        );
        if (existingSub) {
          existingSub.cardIds.push(...spentWilds.map((c) => c.id));
        } else {
          submissions.push({
            kind: 'add_to_meld',
            meldId: meld.id,
            cardIds: spentWilds.map((c) => c.id),
          });
        }
        for (const c of spentWilds) usedIds.add(c.id);
        sim.cards.push(...spentWilds);
        sim.wilds += spentWilds.length;
        sim.isCanasta = true;
        projectedCanastas++;
      }

      // Opening a 3-card meld with a wild (pair + 1 wild):
      // Easy does it whenever >= 2 wilds; Normal only if >= 3 wilds or endgame;
      // Hard NEVER burns a wild to open a thin 3-card meld unless in endgame with spare wilds!
      const allowWildOpen =
        this.difficulty === 'easy'
          ? availableWilds.length >= 2
          : this.difficulty === 'normal'
            ? availableWilds.length >= 3 || (endgame && availableWilds.length >= 2)
            : endgame && availableWilds.length >= 2 && hand.length - usedIds.size >= 8;

      if (allowWildOpen) {
        const highPairs = [...byRank.entries()]
          .filter(
            ([r, cards]) =>
              !existingByRank.has(r) &&
              !createdRanks.has(r) &&
              cards.length === 2 &&
              getCardPoints(cards[0]) >= 10,
          )
          .sort((a, b) => getCardPoints(b[1][0]) - getCardPoints(a[1][0]));

        if (highPairs.length > 0) {
          const [rank, pair] = highPairs[0];
          const w = availableWilds.shift()!;
          submissions.push({
            kind: 'new_meld',
            rank,
            cardIds: [pair[0].id, pair[1].id, w.id],
          });
          createdRanks.add(rank);
          usedIds.add(pair[0].id);
          usedIds.add(pair[1].id);
          usedIds.add(w.id);
        }
      }
    }

    // Step 2d: Check if shedding remaining wilds or Black 3s lets us GO OUT right now
    const remainingNow = hand.filter((c) => !usedIds.has(c.id));
    if (projectedCanastas >= view.ruleset.canastasRequiredToGoOut) {
      const leftoverWilds = remainingNow.filter(isWildCard);
      const leftoverNonWilds = remainingNow.filter((c) => !isWildCard(c));
      const canMeldBlack3s =
        blackThrees.length >= 3 &&
        leftoverNonWilds.every((c) => isBlackThree(c)) &&
        !myTeam.melds.some((m) => m.rank === '3B');

      if (canMeldBlack3s && leftoverWilds.length <= 1) {
        submissions.push({
          kind: 'new_meld',
          rank: '3B',
          cardIds: blackThrees.map((c) => c.id),
        });
        for (const c of blackThrees) usedIds.add(c.id);
      } else if (leftoverWilds.length > 0 && leftoverNonWilds.length <= 1) {
        for (const w of leftoverWilds) {
          const target = myTeam.melds.find((m) => {
            if (m.rank === '3B') return false;
            const sim = meldSizes.get(m.id)!;
            return sim.wilds + 1 <= view.ruleset.maxWildsPerMeld;
          });
          if (!target) break;
          const sim = meldSizes.get(target.id)!;
          const existingSub = submissions.find(
            (s) => s.kind === 'add_to_meld' && s.meldId === target.id,
          );
          if (existingSub) existingSub.cardIds.push(w.id);
          else {
            submissions.push({
              kind: 'add_to_meld',
              meldId: target.id,
              cardIds: [w.id],
            });
          }
          sim.wilds++;
          sim.cards.push(w);
          usedIds.add(w.id);
        }
      }
    }

    if (submissions.length === 0) return null;

    // Step 2e: Safety trim — NEVER violate the one-card deadlock rule!
    let remainingCount = hand.length - usedIds.size;
    if (
      remainingCount <= 1 &&
      projectedCanastas < view.ruleset.canastasRequiredToGoOut
    ) {
      while (submissions.length > 0 && remainingCount <= 1) {
        const last = submissions[submissions.length - 1];
        if (last.kind === 'add_to_meld' && last.cardIds.length > 1) {
          const removedId = last.cardIds.pop()!;
          usedIds.delete(removedId);
          remainingCount++;
        } else {
          submissions.pop();
          for (const id of last.cardIds) usedIds.delete(id);
          remainingCount += last.cardIds.length;
        }
      }
      if (submissions.length === 0) return null;
    }

    return {
      type: 'COMMIT_MELDS',
      playerId: this.id,
      submissions,
    };
  }

  private chooseDiscardAction(view: PlayerView): GameAction {
    const hand = view.viewerHand;
    if (hand.length === 0) {
      return { type: 'GO_OUT_WITHOUT_DISCARD', playerId: this.id };
    }

    const { myTeam, oppTeam } = this.getTeams(view);
    const { byRank } = partitionHand(hand);
    const oppMeldRanks = new Set(oppTeam.melds.map((m) => m.rank));
    const myMeldRanks = new Set(myTeam.melds.map((m) => m.rank));
    const pileUnfrozenForOpp =
      !view.discardPile.frozenByWildOrInitial && oppTeam.hasMadeInitialMeld;
    const pileCount = view.discardPile.count;
    const isHard = this.difficulty === 'hard';

    let bestCard = hand[0];
    let lowestKeepScore = Infinity;

    for (const card of hand) {
      let keepScore = 0;

      if (isWildCard(card)) {
        keepScore = card.rank === 'JOKER' ? 195 : 145;
        // Emergency freeze with a 2 if unfrozen pile is large and dangerous
        const freezeThreshold = isHard ? 7 : 10;
        if (
          this.difficulty !== 'easy' &&
          card.rank === '2' &&
          pileUnfrozenForOpp &&
          pileCount >= freezeThreshold
        ) {
          keepScore -= isHard ? 115 : 85;
        }
      } else if (isBlackThree(card)) {
        // Use Black 3 tactically to stop opponent from taking a valuable pile
        const stopThreshold = isHard ? 4 : 5;
        if (pileUnfrozenForOpp && pileCount >= stopThreshold) {
          keepScore = -45;
        } else if (isHard && pileCount === 0) {
          // Save Black 3s when pile is empty so they're available to block later
          keepScore = 38;
        } else {
          keepScore = 15;
        }
      } else if (isNaturalRank(card.rank)) {
        const countInHand = (byRank.get(card.rank) ?? []).length;
        keepScore = getCardPoints(card) * (isHard ? 1.5 : 1.2);

        // Protect pairs and sets (Hard guards pairs even more carefully for frozen pickups)
        if (countInHand === 2) keepScore += isHard ? 72 : 55;
        else if (countInHand >= 3) keepScore += isHard ? 115 : 95;

        // Protect cards matching our own melds
        if (myMeldRanks.has(card.rank)) keepScore += 75;

        // Strongly avoid feeding opponent's melds when pile is unfrozen
        if (oppMeldRanks.has(card.rank)) {
          keepScore += pileUnfrozenForOpp ? (isHard ? 130 : 95) : 25;
        }

        // Before opponent's initial meld, high cards (A/K/Q) help them reach 50/90/120 more than 4-7s
        if (isHard && !oppTeam.hasMadeInitialMeld && getCardPoints(card) >= 10) {
          keepScore += 18;
        }
      }

      keepScore += this.jitter(30);

      if (keepScore < lowestKeepScore) {
        lowestKeepScore = keepScore;
        bestCard = card;
      }
    }

    return {
      type: 'DISCARD',
      playerId: this.id,
      cardId: bestCard.id,
    };
  }
}
