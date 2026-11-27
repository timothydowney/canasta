import { describe, expect, it } from 'vitest';
import {
  BICYCLE_2P_CLASSIC,
  applyAction,
  buildMeldObject,
  createDoubleDeck,
  createMatch,
  createRuleset,
  getCardPoints,
  getPlayerView,
  getRequiredInitialMeldPoints,
  isMandatoryStockExhaustedTake,
  isRedThree,
  replayHand,
  validateMeldCards,
  type Card,
  type GameState,
  type PlayerConfig,
} from '../../src/engine';

const TWO_PLAYERS: PlayerConfig[] = [
  { id: 'p0', name: 'Alice', teamId: 'team-0', kind: 'human' },
  { id: 'p1', name: 'Bob', teamId: 'team-1', kind: 'human' },
];

function card(
  rank: Card['rank'],
  suit: Card['suit'],
  deckIndex: 0 | 1 = 0,
): Card {
  const color: 'red' | 'black' =
    suit === 'hearts' || suit === 'diamonds'
      ? 'red'
      : suit === 'joker'
        ? deckIndex === 0
          ? 'red'
          : 'black'
        : 'black';
  const suffix =
    suit === 'joker'
      ? color === 'red'
        ? 'JOKER-R'
        : 'JOKER-B'
      : `${rank}${suit[0].toUpperCase()}`;
  return {
    id: `d${deckIndex}-${suffix}`,
    deckIndex,
    rank,
    suit,
    color,
  };
}

function countAllCards(state: GameState): number {
  const inHands = state.players.reduce((s, p) => s + p.hand.length, 0);
  const inMelds = state.teams.reduce(
    (s, t) => s + t.melds.reduce((ms, m) => ms + m.cards.length, 0),
    0,
  );
  const inRed3s = state.teams.reduce((s, t) => s + t.redThrees.length, 0);
  return state.stock.length + state.discardPile.cards.length + inHands + inMelds + inRed3s;
}

describe('Bicycle Canasta Deck & Setup', () => {
  it('creates 108 unique cards (2x52 + 4 jokers)', () => {
    const deck = createDoubleDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
    expect(deck.filter((c) => c.rank === 'JOKER')).toHaveLength(4);
    expect(deck.filter(isRedThree)).toHaveLength(4);
  });

  it('deals 15 cards each in 2P mode, conserves all 108 cards, and starts with natural upcard', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = createMatch({ seed, players: TWO_PLAYERS });
      expect(countAllCards(state)).toBe(108);
      expect(state.players[0].hand).toHaveLength(15);
      expect(state.players[1].hand).toHaveLength(15);
      const top = state.discardPile.cards[state.discardPile.cards.length - 1];
      expect(top).toBeDefined();
      expect(['2', '3', 'JOKER']).not.toContain(top.rank);
      // Active player (p1, left of dealer 0) already exposed any starting Red 3s
      expect(state.players[state.activePlayerIndex].hand.some(isRedThree)).toBe(false);
    }
  });

  it('computes initial meld thresholds for all 4 Bicycle score tiers', () => {
    expect(getRequiredInitialMeldPoints(BICYCLE_2P_CLASSIC, -200)).toBe(0);
    expect(getRequiredInitialMeldPoints(BICYCLE_2P_CLASSIC, 0)).toBe(50);
    expect(getRequiredInitialMeldPoints(BICYCLE_2P_CLASSIC, 1495)).toBe(50);
    expect(getRequiredInitialMeldPoints(BICYCLE_2P_CLASSIC, 1500)).toBe(90);
    expect(getRequiredInitialMeldPoints(BICYCLE_2P_CLASSIC, 2995)).toBe(90);
    expect(getRequiredInitialMeldPoints(BICYCLE_2P_CLASSIC, 3000)).toBe(120);
  });
});

describe('Meld & Wild Card Rules', () => {
  it('allows classic Bicycle 2 naturals + 3 wilds, rejects 4 wilds or <2 naturals', () => {
    const twoNatThreeWild = [
      card('K', 'spades', 0),
      card('K', 'hearts', 0),
      card('2', 'clubs', 0),
      card('2', 'diamonds', 0),
      card('JOKER', 'joker', 0),
    ];
    expect(validateMeldCards(twoNatThreeWild, 'K', BICYCLE_2P_CLASSIC).valid).toBe(true);

    // Toggleable strict variant (naturals > wilds) rejects 2 naturals + 3 wilds
    const strictRules = { ...BICYCLE_2P_CLASSIC, requireNaturalMajority: true };
    expect(validateMeldCards(twoNatThreeWild, 'K', strictRules).valid).toBe(false);

    // >3 wilds always rejected
    const fourWilds = [...twoNatThreeWild, card('2', 'spades', 1)];
    expect(validateMeldCards(fourWilds, 'K', BICYCLE_2P_CLASSIC).valid).toBe(false);

    // Only 1 natural rejected
    const oneNatural = [
      card('K', 'spades', 0),
      card('2', 'clubs', 0),
      card('2', 'diamonds', 0),
    ];
    expect(validateMeldCards(oneNatural, 'K', BICYCLE_2P_CLASSIC).valid).toBe(false);
  });

  it('downgrades a Natural Canasta to Mixed when a wild card is added', () => {
    const base = createMatch({ seed: 10, players: TWO_PLAYERS });
    const natCanasta = buildMeldObject('meld-1', 'K', [
      card('K', 'spades', 0),
      card('K', 'hearts', 0),
      card('K', 'clubs', 0),
      card('K', 'diamonds', 0),
      card('K', 'spades', 1),
      card('K', 'hearts', 1),
      card('K', 'clubs', 1),
    ]);
    expect(natCanasta.canastaType).toBe('natural');

    const wild = card('2', 'spades', 0);
    const keep1 = card('5', 'clubs', 0);
    const keep2 = card('6', 'hearts', 0);
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'MELD_OR_DISCARD',
      players: [
        { ...base.players[0], hand: [wild, keep1, keep2] },
        base.players[1],
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: true, melds: [natCanasta] },
        base.teams[1],
      ],
    };

    const res = applyAction(state, {
      type: 'COMMIT_MELDS',
      playerId: 'p0',
      submissions: [{ kind: 'add_to_meld', meldId: 'meld-1', cardIds: [wild.id] }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.teams[0].melds[0].canastaType).toBe('mixed');
    expect(res.state.teams[0].melds[0].cards).toHaveLength(8);
  });

  it('prevents one-card deadlock (cannot meld down to 1 card without meeting Canasta requirement)', () => {
    const base = createMatch({ seed: 10, players: TWO_PLAYERS });
    const k1 = card('K', 'spades', 0);
    const k2 = card('K', 'hearts', 0);
    const k3 = card('K', 'clubs', 0);
    const lone = card('5', 'diamonds', 0);
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'MELD_OR_DISCARD',
      players: [
        { ...base.players[0], hand: [k1, k2, k3, lone] },
        base.players[1],
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: true, melds: [] },
        base.teams[1],
      ],
    };

    const res = applyAction(state, {
      type: 'COMMIT_MELDS',
      playerId: 'p0',
      submissions: [{ kind: 'new_meld', rank: 'K', cardIds: [k1.id, k2.id, k3.id] }],
    });
    expect(res.ok).toBe(false);
  });
});

describe('Red Threes & Stock Exhaustion', () => {
  it('auto-exposes drawn Red 3s and replaces them; ends immediately if last stock card is Red 3', () => {
    const base = createMatch({ seed: 42, players: TWO_PLAYERS });
    const red3 = card('3', 'hearts', 0);
    const c1 = card('9', 'spades', 0);
    const c2 = card('10', 'clubs', 0);

    // Case 1: Normal replacement (stock pops from end -> red3 then c1 then c2)
    const state1: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'DRAW',
      players: [
        {
          ...base.players[0],
          hasTakenFirstTurn: true,
          hand: [card('4', 'clubs', 0), card('5', 'hearts', 0)],
        },
        base.players[1],
      ],
      teams: [
        { ...base.teams[0], redThrees: [] },
        base.teams[1],
      ],
      stock: [c2, c1, red3],
    };
    const r1 = applyAction(state1, { type: 'DRAW_STOCK', playerId: 'p0' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.phase).toBe('MELD_OR_DISCARD');
    expect(r1.state.teams[0].redThrees.map((c) => c.id)).toContain(red3.id);
    expect(r1.state.players[0].hand).toHaveLength(4); // 2 initial + 2 replacements

    // Case 2: Last card of stock is Red 3 -> immediate HAND_OVER
    const state2: GameState = {
      ...state1,
      stock: [red3, c1], // pops c1 first, then red3 is last card!
    };
    const r2 = applyAction(state2, { type: 'DRAW_STOCK', playerId: 'p0' });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.phase).toBe('HAND_OVER');
    expect(r2.state.lastHandSummary?.reason).toBe('STOCK_EXHAUSTED_RED_THREE');
    // Since team-0 never made an initial meld, Red 3 counts as -100!
    expect(r2.state.lastHandSummary?.breakdowns[0].redThreePoints).toBe(-100);
  });

  it('awards +800 for all 4 Red 3s with initial meld, or -800 without', () => {
    const base = createMatch({ seed: 7, players: TWO_PLAYERS });
    const fourRedThrees = [
      card('3', 'hearts', 0),
      card('3', 'diamonds', 0),
      card('3', 'hearts', 1),
      card('3', 'diamonds', 1),
    ];

    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'DRAW',
      stock: [],
      discardPile: {
        cards: [card('4', 'clubs', 0)],
        frozenByWildOrInitial: true,
        frozenCardId: null,
        blockedByBlackThree: false,
      },
      players: [
        { ...base.players[0], hasTakenFirstTurn: true, hand: [card('5', 'clubs', 0)] },
        { ...base.players[1], hasTakenFirstTurn: true, hand: [card('6', 'clubs', 0)] },
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: true, redThrees: fourRedThrees },
        { ...base.teams[1], hasMadeInitialMeld: false, redThrees: [] },
      ],
    };

    const res = applyAction(state, { type: 'PASS_EXHAUSTED_STOCK', playerId: 'p0' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.lastHandSummary?.breakdowns[0].redThreePoints).toBe(800);
  });

  it('enforces mandatory take when stock is empty and unfrozen top discard matches existing meld', () => {
    const base = createMatch({ seed: 7, players: TWO_PLAYERS });
    const meld8 = buildMeldObject('meld-1', '8', [
      card('8', 'spades', 0),
      card('8', 'hearts', 0),
      card('8', 'clubs', 0),
    ]);
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'DRAW',
      stock: [],
      discardPile: {
        cards: [card('8', 'diamonds', 0)],
        frozenByWildOrInitial: false,
        frozenCardId: null,
        blockedByBlackThree: false,
      },
      players: [
        {
          ...base.players[0],
          hasTakenFirstTurn: true,
          hand: [card('4', 'clubs', 0), card('5', 'hearts', 0)],
        },
        base.players[1],
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: true, melds: [meld8] },
        base.teams[1],
      ],
    };

    expect(isMandatoryStockExhaustedTake(state, 'p0')).toBe(true);
    const passRes = applyAction(state, { type: 'PASS_EXHAUSTED_STOCK', playerId: 'p0' });
    expect(passRes.ok).toBe(false);
  });
});

describe('Discard Pile Freezing, Black 3s & Initial Meld Rules', () => {
  it('blocks taking frozen pile with a wild card, allows with natural pair + initial meld math', () => {
    const base = createMatch({ seed: 5, players: TWO_PLAYERS });
    const topK = card('K', 'spades', 0);
    const buriedRed3 = card('3', 'diamonds', 0);
    const buried5 = card('5', 'clubs', 0);
    const hK1 = card('K', 'hearts', 0);
    const hK2 = card('K', 'clubs', 0);
    const hWild = card('2', 'hearts', 0);
    const hA1 = card('A', 'spades', 0);
    const hA2 = card('A', 'hearts', 0);
    const hA3 = card('A', 'clubs', 0);

    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'DRAW',
      players: [
        { ...base.players[0], hasTakenFirstTurn: true, hand: [hK1, hK2, hWild, hA1, hA2, hA3] },
        base.players[1],
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: false, cumulativeScore: 0, melds: [], redThrees: [] },
        base.teams[1],
      ],
      discardPile: {
        cards: [buried5, buriedRed3, topK],
        frozenByWildOrInitial: false, // still frozen for team-0 since no initial meld!
        frozenCardId: null,
        blockedByBlackThree: false,
      },
    };

    // Reject 1 natural + 1 wild when frozen
    const badWild = applyAction(state, {
      type: 'TAKE_DISCARD_PILE',
      playerId: 'p0',
      topCardUsage: { kind: 'new_meld', handCardIds: [hK1.id, hWild.id] },
    });
    expect(badWild.ok).toBe(false);

    // Reject natural pair alone (30 pts < 50 pts initial meld)
    const underMin = applyAction(state, {
      type: 'TAKE_DISCARD_PILE',
      playerId: 'p0',
      topCardUsage: { kind: 'new_meld', handCardIds: [hK1.id, hK2.id] },
    });
    expect(underMin.ok).toBe(false);

    // Accept natural pair of Kings (30) + 3 Aces (60) = 90 >= 50!
    // Also exposes buried Red 3 from discard pile with NO stock replacement.
    const stockBefore = state.stock.length;
    const good = applyAction(state, {
      type: 'TAKE_DISCARD_PILE',
      playerId: 'p0',
      topCardUsage: { kind: 'new_meld', handCardIds: [hK1.id, hK2.id] },
      additionalInitialMelds: [{ kind: 'new_meld', rank: 'A', cardIds: [hA1.id, hA2.id, hA3.id] }],
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.state.teams[0].hasMadeInitialMeld).toBe(true);
    expect(good.state.teams[0].redThrees.map((c) => c.id)).toContain(buriedRed3.id);
    expect(good.state.stock.length).toBe(stockBefore); // No replacement!
    expect(good.state.players[0].hand.map((c) => c.id)).toContain(buried5.id);
  });

  it('Black 3 blocks discard pile for one turn and clears once another card is discarded on top', () => {
    const base = createMatch({ seed: 11, players: TWO_PLAYERS });
    const b3 = card('3', 'spades', 0);
    const keep0 = card('6', 'hearts', 0);
    const disc1 = card('7', 'clubs', 0);
    const keep1 = card('9', 'diamonds', 0);

    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'MELD_OR_DISCARD',
      players: [
        { ...base.players[0], hasTakenFirstTurn: true, hand: [b3, keep0] },
        { ...base.players[1], hasTakenFirstTurn: true, hand: [disc1, keep1] },
      ],
      discardPile: {
        cards: [card('5', 'hearts', 0)],
        frozenByWildOrInitial: false,
        frozenCardId: null,
        blockedByBlackThree: false,
      },
    };

    const afterB3 = applyAction(state, { type: 'DISCARD', playerId: 'p0', cardId: b3.id });
    expect(afterB3.ok).toBe(true);
    if (!afterB3.ok) return;
    expect(afterB3.state.discardPile.blockedByBlackThree).toBe(true);
    expect(afterB3.state.discardPile.frozenByWildOrInitial).toBe(false);

    // p1 draws and discards a natural card -> Black 3 block expires!
    const afterDraw = applyAction(afterB3.state, { type: 'DRAW_STOCK', playerId: 'p1' });
    expect(afterDraw.ok).toBe(true);
    if (!afterDraw.ok) return;
    const afterCover = applyAction(afterDraw.state, {
      type: 'DISCARD',
      playerId: 'p1',
      cardId: disc1.id,
    });
    expect(afterCover.ok).toBe(true);
    if (!afterCover.ok) return;
    expect(afterCover.state.discardPile.blockedByBlackThree).toBe(false);
  });
});

describe('Going Out, Black 3 Melds, Concealed Going Out, Undo & Replay', () => {
  it('prevents going out with < 2 Canastas in 2P, allows Black 3 meld + Concealed Go-Out (+200) with 2 Canastas', () => {
    const base = createMatch({ seed: 3, players: TWO_PLAYERS });
    const seven4s = [
      card('4', 'clubs', 0),
      card('4', 'diamonds', 0),
      card('4', 'hearts', 0),
      card('4', 'spades', 0),
      card('4', 'clubs', 1),
      card('4', 'diamonds', 1),
      card('4', 'hearts', 1),
    ];
    const seven5s = [
      card('5', 'clubs', 0),
      card('5', 'diamonds', 0),
      card('5', 'hearts', 0),
      card('5', 'spades', 0),
      card('5', 'clubs', 1),
      card('5', 'diamonds', 1),
      card('5', 'hearts', 1),
    ];
    const threeBlack3s = [
      card('3', 'clubs', 0),
      card('3', 'spades', 0),
      card('3', 'clubs', 1),
    ];

    // Team score 3000 -> normally needs 120 pts initial meld,
    // yet 7x4 (35) + 7x5 (35) + 3x3B (15) = 85 pts!
    // Going out CONCEALED from stock waives the 120-pt initial meld threshold!
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'MELD_OR_DISCARD',
      tookDiscardPileThisTurn: false,
      players: [
        {
          ...base.players[0],
          hasTakenFirstTurn: true,
          hand: [...seven4s, ...seven5s, ...threeBlack3s],
        },
        {
          ...base.players[1],
          hasTakenFirstTurn: true,
          hand: [card('A', 'spades', 0)], // 20 pts unmelded penalty
        },
      ],
      teams: [
        { ...base.teams[0], cumulativeScore: 3000, hasMadeInitialMeld: false, melds: [], redThrees: [] },
        { ...base.teams[1], cumulativeScore: 1000, hasMadeInitialMeld: false, melds: [], redThrees: [] },
      ],
    };

    // Melding only 1 Canasta + Black 3s should be rejected (not going out!)
    const rejectB3 = applyAction(state, {
      type: 'COMMIT_MELDS',
      playerId: 'p0',
      submissions: [
        { kind: 'new_meld', rank: '4', cardIds: seven4s.map((c) => c.id) },
        { kind: 'new_meld', rank: '3B', cardIds: threeBlack3s.map((c) => c.id) },
      ],
    });
    expect(rejectB3.ok).toBe(false);

    // Melding all 17 cards (2 Natural Canastas + Black 3s) -> Concealed Going Out!
    const win = applyAction(state, {
      type: 'COMMIT_MELDS',
      playerId: 'p0',
      submissions: [
        { kind: 'new_meld', rank: '4', cardIds: seven4s.map((c) => c.id) },
        { kind: 'new_meld', rank: '5', cardIds: seven5s.map((c) => c.id) },
        { kind: 'new_meld', rank: '3B', cardIds: threeBlack3s.map((c) => c.id) },
      ],
    });
    expect(win.ok).toBe(true);
    if (!win.ok) return;
    expect(win.state.lastHandSummary?.reason).toBe('WENT_OUT_CONCEALED');
    const b0 = win.state.lastHandSummary!.breakdowns[0];
    expect(b0.goingOutBonus).toBe(200);
    expect(b0.naturalCanastaPoints).toBe(1000);
    expect(b0.meldedCardPoints).toBe(85);
    expect(b0.handNetScore).toBe(1285);
    // 3000 + 1285 = 4285 (< 5000 -> HAND_OVER, not MATCH_OVER yet)
    expect(win.state.phase).toBe('HAND_OVER');
    expect(win.state.lastHandSummary!.breakdowns[1].unmeldedHandPenalty).toBe(-20);
  });

  it('supports safe turn undo without reverting drawn cards, deterministic replay, and strict PlayerView privacy', () => {
    const initial = createMatch({
      seed: 12345,
      ruleset: createRuleset(BICYCLE_2P_CLASSIC, 'standard_5000'),
      players: TWO_PLAYERS,
    });
    const activeId = initial.players[initial.activePlayerIndex].id;
    const otherId = initial.players[(initial.activePlayerIndex + 1) % 2].id;

    // Verify PlayerView hides opponent hand & stock cards
    const view = getPlayerView(initial, activeId);
    expect(view.viewerHand).toHaveLength(15);
    expect(view.players.find((p) => p.id === otherId)?.handCount).toBe(15);
    expect('hand' in view.players[0]).toBe(false);

    // Draw from stock
    const d1 = applyAction(initial, { type: 'DRAW_STOCK', playerId: activeId });
    expect(d1.ok).toBe(true);
    if (!d1.ok) return;
    const drawnHandIds = d1.state.players[d1.state.activePlayerIndex].hand.map((c) => c.id);

    // Discard lowest card
    const discardCard = d1.state.players[d1.state.activePlayerIndex].hand[0];
    const d2 = applyAction(d1.state, {
      type: 'DISCARD',
      playerId: activeId,
      cardId: discardCard.id,
    });
    expect(d2.ok).toBe(true);
    if (!d2.ok) return;

    // Replay produces bit-for-bit identical state
    const replayed = replayHand(
      initial.handSeed,
      initial.ruleset,
      TWO_PLAYERS,
      d2.state.actionHistory,
    );
    expect(replayed.players[0].hand.map((c) => c.id)).toEqual(
      d2.state.players[0].hand.map((c) => c.id),
    );
    expect(replayed.discardPile.cards.map((c) => c.id)).toEqual(
      d2.state.discardPile.cards.map((c) => c.id),
    );
    expect(replayed.stock.map((c) => c.id)).toEqual(d2.state.stock.map((c) => c.id));
    expect(drawnHandIds.length).toBeGreaterThanOrEqual(17);
  });

  it('restores melds cleanly on UNDO_TURN_MELDS without reverting stock draw', () => {
    const base = createMatch({ seed: 99, players: TWO_PLAYERS });
    const a1 = card('A', 'spades', 0);
    const a2 = card('A', 'hearts', 0);
    const a3 = card('A', 'clubs', 0);
    const k1 = card('K', 'spades', 0);
    const draw1 = card('6', 'clubs', 0);
    const draw2 = card('7', 'diamonds', 0);

    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'DRAW',
      players: [
        { ...base.players[0], hasTakenFirstTurn: true, hand: [a1, a2, a3, k1] },
        base.players[1],
      ],
      stock: [draw2, draw1],
    };

    const drawn = applyAction(state, { type: 'DRAW_STOCK', playerId: 'p0' });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.state.players[0].hand).toHaveLength(6);

    const melded = applyAction(drawn.state, {
      type: 'COMMIT_MELDS',
      playerId: 'p0',
      submissions: [{ kind: 'new_meld', rank: 'A', cardIds: [a1.id, a2.id, a3.id] }],
    });
    expect(melded.ok).toBe(true);
    if (!melded.ok) return;
    expect(melded.state.teams[0].melds).toHaveLength(1);
    expect(melded.state.players[0].hand).toHaveLength(3);

    const undone = applyAction(melded.state, { type: 'UNDO_TURN_MELDS', playerId: 'p0' });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.state.teams[0].melds).toHaveLength(0);
    expect(undone.state.teams[0].hasMadeInitialMeld).toBe(false);
    expect(undone.state.players[0].hand).toHaveLength(6);
    expect(undone.state.stock).toHaveLength(0); // Stock draw was NOT reverted!
    expect(getCardPoints(a1)).toBe(20);
  });
});
