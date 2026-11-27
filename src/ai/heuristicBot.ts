import {
  getCardPoints,
  getTeamById,
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
  type TeamState,
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
    // Partner Permission: answer immediately when asked by partner
    if (view.legalHints.mustAnswerPartnerGoOut) {
      return {
        type: 'ANSWER_PARTNER_GO_OUT',
        playerId: this.id,
        allow: this.evaluatePartnerGoOutRequest(view),
      };
    }

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

  private getTeams(view: PlayerView): {
    myTeam: TeamState;
    oppTeams: TeamState[];
    nextOpponentTeam: TeamState | null;
  } {
    const myTeam = getTeamById(view.teams, view.viewerTeamId);
    const oppTeams = view.teams.filter((t) => t.id !== view.viewerTeamId);
    const me = view.players.find((p) => p.id === view.viewerId);
    let nextOpponentTeam: TeamState | null = oppTeams[0] ?? null;
    if (me) {
      const nextSeat = (me.seatIndex + 1) % view.players.length;
      const nextPlayer = view.players[nextSeat];
      if (nextPlayer && nextPlayer.teamId !== view.viewerTeamId) {
        nextOpponentTeam = getTeamById(view.teams, nextPlayer.teamId);
      }
    }
    return { myTeam, oppTeams, nextOpponentTeam };
  }

  private getOppMinHandCount(view: PlayerView): number {
    const counts = view.players
      .filter((p) => p.teamId !== view.viewerTeamId)
      .map((p) => p.handCount);
    return counts.length > 0 ? Math.min(...counts) : 99;
  }

  private evaluatePartnerGoOutRequest(view: PlayerView): boolean {
    const { myTeam } = this.getTeams(view);
    const handPts = view.viewerHand.reduce((s, c) => s + getCardPoints(c), 0);
    const oppMin = this.getOppMinHandCount(view);
    const { byRank, wilds } = partitionHand(view.viewerHand);

    // Always say Yes if opponents are close to going out, stock is nearly gone, or hand is light
    if (handPts <= 70 || oppMin <= 4 || view.stockCount <= 12) {
      return true;
    }

    // Check if our team already wins the match if partner goes out now
    if (view.ruleset.winScore !== null) {
      const currentTablePts =
        myTeam.melds.reduce(
          (s, m) => s + m.cards.reduce((cs, c) => cs + getCardPoints(c), 0),
          0,
        ) +
        myTeam.melds.reduce(
          (s, m) =>
            s +
            (m.canastaType === 'natural'
              ? view.ruleset.naturalCanastaBonus
              : m.canastaType === 'mixed'
                ? view.ruleset.mixedCanastaBonus
                : 0),
          0,
        );
      if (
        myTeam.cumulativeScore + currentTablePts + 100 - handPts >=
        view.ruleset.winScore
      ) {
        return true;
      }
    }

    // Say No if holding substantial playable melds/wilds and opponents aren't threatening
    const hasPlayableMeld =
      wilds.length >= 2 ||
      [...byRank.values()].some((arr) => arr.length >= 3);
    if (hasPlayableMeld && handPts > 85 && oppMin >= 6) {
      return false;
    }

    return handPts <= 115;
  }

  private isEndgame(view: PlayerView): boolean {
    const { myTeam, oppTeams } = this.getTeams(view);
    const myCanastas = countExistingCanastas(myTeam.melds);
    const maxOppCanastas = Math.max(
      0,
      ...oppTeams.map((t) => countExistingCanastas(t.melds)),
    );
    const oppMinCards = this.getOppMinHandCount(view);
    const req = view.ruleset.canastasRequiredToGoOut;

    return (
      view.stockCount <= 18 ||
      oppMinCards <= 5 ||
      myCanastas >= req ||
      (myCanastas >= req - 1 && view.viewerHand.length <= 9) ||
      (maxOppCanastas >= req - 1 && oppMinCards <= 7)
    );
  }

  private chooseDrawAction(view: PlayerView): GameAction {
    const { myTeam } = this.getTeams(view);
    const topCard = view.discardPile.topCard;

    if (
      view.legalHints.canTakeDiscardPile &&
      topCard &&
      isNaturalRank(topCard.rank)
    ) {
      const takePlan = this.planTakeDiscardPile(view, topCard, myTeam.melds);
      if (takePlan) {
        if (view.legalHints.mustTakeDiscardPile) {
          return takePlan.action;
        }
        const oppMinCards = this.getOppMinHandCount(view);
        let utility = takePlan.utility + this.jitter(35);

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
    const goOutDenied = view.legalHints.partnerGoOutStatus === 'DENIED';

    const stockDrawCost =
      this.difficulty === 'easy'
        ? 0
        : view.stockCount > 0
          ? view.ruleset.drawCount * 24
          : 0;

    const { byRank, wilds } = partitionHand(hand);
    const matchingNaturals = byRank.get(topRank) ?? [];

    // Case A: Initial meld not made yet
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
      const postHand = hand.length - plan.cardsUsedCount + buriedCount;
      if (postHand <= 1 && goOutDenied) return null;

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

    // Case B: Initial meld made, unfrozen, matches existing meld
    if (!frozen && existingMeld) {
      const postHand = hand.length + buriedCount;
      const completesCanasta =
        !existingMeld.isCanasta && existingMeld.cards.length + 1 >= 7;
      const postCanastas = currentCanastas + (completesCanasta ? 1 : 0);
      if (
        postHand <= 1 &&
        (goOutDenied || postCanastas < view.ruleset.canastasRequiredToGoOut)
      ) {
        return null;
      }
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

    // Case C: Natural pair in hand
    if (matchingNaturals.length >= 2) {
      const pairIds = [matchingNaturals[0].id, matchingNaturals[1].id];
      const postHand = hand.length - 2 + buriedCount;
      const completesCanasta = existingMeld
        ? !existingMeld.isCanasta && existingMeld.cards.length + 3 >= 7
        : false;
      const postCanastas = currentCanastas + (completesCanasta ? 1 : 0);
      if (
        postHand <= 1 &&
        (goOutDenied || postCanastas < view.ruleset.canastasRequiredToGoOut)
      ) {
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

    // Case D: Unfrozen, no existing meld, 1 natural + 1 wild
    if (
      !frozen &&
      !existingMeld &&
      matchingNaturals.length >= 1 &&
      wilds.length >= 1
    ) {
      const postHand = hand.length - 2 + buriedCount;
      if (
        postHand <= 1 &&
        (goOutDenied || currentCanastas < view.ruleset.canastasRequiredToGoOut)
      ) {
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
    if (hand.length <= 1) {
      // If down to 1 card and partnered with a human, ask partner before discarding out!
      if (
        hand.length === 1 &&
        view.legalHints.canAskPartnerGoOut &&
        view.legalHints.viewerCanastas >= view.legalHints.canastasRequired
      ) {
        const partner = view.players.find(
          (p) => p.teamId === view.viewerTeamId && p.id !== view.viewerId,
        );
        if (partner?.kind === 'human') {
          return { type: 'ASK_PARTNER_GO_OUT', playerId: this.id };
        }
      }
      return null;
    }

    const isHard = this.difficulty === 'hard';
    const endgame = this.isEndgame(view);
    const goOutDenied = view.legalHints.partnerGoOutStatus === 'DENIED';
    const goOutApproved = view.legalHints.partnerGoOutStatus === 'APPROVED';

    // 1. Before initial meld
    if (!myTeam.hasMadeInitialMeld) {
      const plan = findBestInitialMeld(
        hand,
        view.legalHints.initialMeldRequired,
        view.ruleset,
      );
      if (!plan) return null;

      const postHand = hand.length - plan.cardsUsedCount;
      if (postHand <= 1 && goOutDenied) return null;

      if (
        isHard &&
        !endgame &&
        !goOutApproved &&
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

    // 2. After initial meld
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

    // Step 2a: Add naturals to existing melds
    for (const [rank, natCards] of byRank.entries()) {
      const existing = existingByRank.get(rank);
      if (!existing || natCards.length === 0) continue;

      if (
        isHard &&
        !endgame &&
        !goOutApproved &&
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

    // Step 2b: New natural melds (3+ naturals)
    const createdRanks = new Set<NaturalRank>();
    for (const [rank, natCards] of byRank.entries()) {
      if (existingByRank.has(rank)) continue;
      if (natCards.length < view.ruleset.minMeldSize) continue;
      if (!validateMeldCards(natCards, rank, view.ruleset).valid) continue;

      if (
        isHard &&
        !endgame &&
        !goOutApproved &&
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

    // Step 2c: Strategic wild cards for Mixed Canastas
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

        if (
          (this.difficulty === 'normal' || isHard) &&
          !endgame &&
          !goOutApproved &&
          sim.wilds === 0 &&
          sim.cards.length >= 5 &&
          availableWilds.length < 3 &&
          hand.length - usedIds.size > 5
        ) {
          continue;
        }
        if (isHard && !endgame && !goOutApproved && needed >= 2 && view.stockCount > 24) {
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

      const allowWildOpen =
        goOutApproved ||
        (this.difficulty === 'easy'
          ? availableWilds.length >= 2
          : this.difficulty === 'normal'
            ? availableWilds.length >= 3 || (endgame && availableWilds.length >= 2)
            : endgame && availableWilds.length >= 2 && hand.length - usedIds.size >= 8);

      if (allowWildOpen) {
        const highPairs = [...byRank.entries()]
          .filter(
            ([r, cards]) =>
              !existingByRank.has(r) &&
              !createdRanks.has(r) &&
              cards.length === 2 &&
              (goOutApproved || getCardPoints(cards[0]) >= 10),
          )
          .sort((a, b) => getCardPoints(b[1][0]) - getCardPoints(a[1][0]));

        for (const [rank, pair] of highPairs) {
          if (availableWilds.length === 0) break;
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
          if (!goOutApproved) break;
        }
      }
    }

    // Step 2d: Go-out shedding (Black 3s & leftover wilds) when allowed
    const remainingNow = hand.filter((c) => !usedIds.has(c.id));
    if (
      !goOutDenied &&
      projectedCanastas >= view.ruleset.canastasRequiredToGoOut
    ) {
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

    // Step 2e: Safety trim — respect one-card deadlock AND Partner Permission DENIED!
    let remainingCount = hand.length - usedIds.size;
    const mustKeepTwo =
      goOutDenied || projectedCanastas < view.ruleset.canastasRequiredToGoOut;

    if (remainingCount <= 1 && mustKeepTwo) {
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

    // Step 2f: If this meld plan will go out AND we're partnered with a human, ask first!
    if (
      remainingCount <= 1 &&
      !mustKeepTwo &&
      view.legalHints.canAskPartnerGoOut
    ) {
      const partner = view.players.find(
        (p) => p.teamId === view.viewerTeamId && p.id !== view.viewerId,
      );
      if (partner?.kind === 'human') {
        return { type: 'ASK_PARTNER_GO_OUT', playerId: this.id };
      }
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

    const { myTeam, oppTeams, nextOpponentTeam } = this.getTeams(view);
    const { byRank } = partitionHand(hand);

    const nextOppMeldRanks = new Set(
      (nextOpponentTeam?.melds ?? []).map((m) => m.rank),
    );
    const otherOppMeldRanks = new Set(
      oppTeams
        .filter((t) => t.id !== nextOpponentTeam?.id)
        .flatMap((t) => t.melds.map((m) => m.rank)),
    );
    const myMeldRanks = new Set(myTeam.melds.map((m) => m.rank));

    const pileUnfrozenForNextOpp =
      !view.discardPile.frozenByWildOrInitial &&
      (nextOpponentTeam?.hasMadeInitialMeld ?? false);
    const anyOppUnfrozen =
      !view.discardPile.frozenByWildOrInitial &&
      oppTeams.some((t) => t.hasMadeInitialMeld);
    const pileCount = view.discardPile.count;
    const isHard = this.difficulty === 'hard';

    let bestCard = hand[0];
    let lowestKeepScore = Infinity;

    for (const card of hand) {
      let keepScore = 0;

      if (isWildCard(card)) {
        keepScore = card.rank === 'JOKER' ? 195 : 145;
        const freezeThreshold = isHard ? 7 : 10;
        if (
          this.difficulty !== 'easy' &&
          card.rank === '2' &&
          anyOppUnfrozen &&
          pileCount >= freezeThreshold
        ) {
          keepScore -= isHard ? 115 : 85;
        }
      } else if (isBlackThree(card)) {
        const stopThreshold = isHard ? 4 : 5;
        if (pileUnfrozenForNextOpp && pileCount >= stopThreshold) {
          keepScore = -45;
        } else if (isHard && pileCount === 0) {
          keepScore = 38;
        } else {
          keepScore = 15;
        }
      } else if (isNaturalRank(card.rank)) {
        const countInHand = (byRank.get(card.rank) ?? []).length;
        keepScore = getCardPoints(card) * (isHard ? 1.5 : 1.2);

        if (countInHand === 2) keepScore += isHard ? 72 : 55;
        else if (countInHand >= 3) keepScore += isHard ? 115 : 95;

        if (myMeldRanks.has(card.rank)) keepScore += 75;

        // Clockwise threat: feeding the immediate next opponent is most dangerous
        if (nextOppMeldRanks.has(card.rank)) {
          keepScore += pileUnfrozenForNextOpp ? (isHard ? 140 : 105) : 28;
        } else if (otherOppMeldRanks.has(card.rank)) {
          keepScore += anyOppUnfrozen ? (isHard ? 80 : 55) : 15;
        }

        if (
          isHard &&
          nextOpponentTeam &&
          !nextOpponentTeam.hasMadeInitialMeld &&
          getCardPoints(card) >= 10
        ) {
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
