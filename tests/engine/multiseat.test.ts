import { describe, expect, it } from 'vitest';
import {
  BICYCLE_3P_CUTTHROAT,
  BICYCLE_4P_CUTTHROAT,
  BICYCLE_4P_PARTNERSHIP,
  applyAction,
  buildMeldObject,
  createMatch,
  getPlayerView,
  type Card,
  type GameState,
  type PlayerConfig,
} from '../../src/engine';

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
  return { id: `d${deckIndex}-${suffix}`, deckIndex, rank, suit, color };
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

const THREE_CUTTHROAT: PlayerConfig[] = [
  { id: 'p0', name: 'South', teamId: 'team-0', kind: 'human' },
  { id: 'p1', name: 'West', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
  { id: 'p2', name: 'East', teamId: 'team-2', kind: 'bot', botDifficulty: 'normal' },
];

const FOUR_PARTNERSHIP: PlayerConfig[] = [
  { id: 'p0', name: 'South', teamId: 'team-0', kind: 'human' },
  { id: 'p1', name: 'West', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
  { id: 'p2', name: 'North', teamId: 'team-0', kind: 'human' },
  { id: 'p3', name: 'East', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
];

const FOUR_CUTTHROAT: PlayerConfig[] = [
  { id: 'p0', name: 'South', teamId: 'team-0', kind: 'human' },
  { id: 'p1', name: 'West', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
  { id: 'p2', name: 'North', teamId: 'team-2', kind: 'bot', botDifficulty: 'normal' },
  { id: 'p3', name: 'East', teamId: 'team-3', kind: 'bot', botDifficulty: 'normal' },
];

describe('Multi-Seat Setup (3P Cutthroat, 4P Partnership, 4P Cutthroat)', () => {
  it('deals 13 cards each in 3P Cutthroat across 3 independent teams', () => {
    const state = createMatch({
      seed: 101,
      ruleset: BICYCLE_3P_CUTTHROAT,
      players: THREE_CUTTHROAT,
    });
    expect(state.teams).toHaveLength(3);
    expect(state.players.every((p) => p.hand.length === 13)).toBe(true);
    expect(countAllCards(state)).toBe(108);
  });

  it('deals 11 cards each in 4P Partnership across 2 teams of 2 sitting opposite', () => {
    const state = createMatch({
      seed: 202,
      ruleset: BICYCLE_4P_PARTNERSHIP,
      players: FOUR_PARTNERSHIP,
    });
    expect(state.teams).toHaveLength(2);
    expect(state.teams[0].playerIds).toEqual(['p0', 'p2']);
    expect(state.teams[1].playerIds).toEqual(['p1', 'p3']);
    expect(state.players.every((p) => p.hand.length === 11)).toBe(true);
    expect(countAllCards(state)).toBe(108);
  });

  it('deals 11 cards each in 4P Cutthroat across 4 independent teams', () => {
    const state = createMatch({
      seed: 303,
      ruleset: BICYCLE_4P_CUTTHROAT,
      players: FOUR_CUTTHROAT,
    });
    expect(state.teams).toHaveLength(4);
    expect(state.players.every((p) => p.hand.length === 11)).toBe(true);
    expect(countAllCards(state)).toBe(108);
  });
});

describe('4-Player Partnership Binding Partner Permission', () => {
  it('blocks turn actions while PENDING, enforces DENIED (cannot go out), and resets next turn', () => {
    const base = createMatch({
      seed: 12,
      ruleset: BICYCLE_4P_PARTNERSHIP,
      players: FOUR_PARTNERSHIP,
    });
    const canasta = buildMeldObject('meld-1', 'K', [
      card('K', 'spades', 0),
      card('K', 'hearts', 0),
      card('K', 'clubs', 0),
      card('K', 'diamonds', 0),
      card('K', 'spades', 1),
      card('K', 'hearts', 1),
      card('K', 'clubs', 1),
    ]);
    const c1 = card('4', 'clubs', 0);
    const c2 = card('5', 'hearts', 0);
    const kExtra = card('K', 'diamonds', 1);

    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'MELD_OR_DISCARD',
      players: [
        { ...base.players[0], hasTakenFirstTurn: true, hand: [kExtra, c1, c2] },
        base.players[1],
        { ...base.players[2], hasTakenFirstTurn: true, hand: [card('9', 'spades', 0)] },
        base.players[3],
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: true, melds: [canasta] },
        base.teams[1],
      ],
    };

    // Ask partner (p2)
    const asked = applyAction(state, { type: 'ASK_PARTNER_GO_OUT', playerId: 'p0' });
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect(asked.state.partnerGoOut?.status).toBe('PENDING');
    expect(getPlayerView(asked.state, 'p2').legalHints.mustAnswerPartnerGoOut).toBe(true);
    expect(getPlayerView(asked.state, 'p0').legalHints.mustAnswerPartnerGoOut).toBe(false);

    // While pending, p0 cannot discard
    const blockedDiscard = applyAction(asked.state, {
      type: 'DISCARD',
      playerId: 'p0',
      cardId: c1.id,
    });
    expect(blockedDiscard.ok).toBe(false);

    // Partner p2 answers NO
    const denied = applyAction(asked.state, {
      type: 'ANSWER_PARTNER_GO_OUT',
      playerId: 'p2',
      allow: false,
    });
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.state.partnerGoOut?.status).toBe('DENIED');

    // Now p0 can still discard c1 (leaves 2 cards) and advance turn, clearing partnerGoOut
    const okDisc = applyAction(denied.state, {
      type: 'DISCARD',
      playerId: 'p0',
      cardId: c1.id,
    });
    expect(okDisc.ok).toBe(true);
    if (!okDisc.ok) return;
    expect(okDisc.state.partnerGoOut).toBeNull();
    expect(okDisc.state.activePlayerIndex).toBe(1);
  });

  it('enforces APPROVED binding go-out when possible, and falls back gracefully if impossible after pre-draw', () => {
    const base = createMatch({
      seed: 14,
      ruleset: BICYCLE_4P_PARTNERSHIP,
      players: FOUR_PARTNERSHIP,
    });
    const canasta = buildMeldObject('meld-1', 'Q', [
      card('Q', 'spades', 0),
      card('Q', 'hearts', 0),
      card('Q', 'clubs', 0),
      card('Q', 'diamonds', 0),
      card('Q', 'spades', 1),
      card('Q', 'hearts', 1),
      card('Q', 'clubs', 1),
    ]);
    const qExtra = card('Q', 'diamonds', 1);
    const stray = card('6', 'clubs', 0);

    // Case 1: p0 CAN go out (meld qExtra onto Q canasta + discard stray)
    const stateCanGoOut: GameState = {
      ...base,
      activePlayerIndex: 0,
      phase: 'MELD_OR_DISCARD',
      partnerGoOut: {
        askedByPlayerId: 'p0',
        partnerPlayerId: 'p2',
        status: 'APPROVED',
      },
      players: [
        { ...base.players[0], hasTakenFirstTurn: true, hand: [qExtra, stray] },
        base.players[1],
        base.players[2],
        base.players[3],
      ],
      teams: [
        { ...base.teams[0], hasMadeInitialMeld: true, melds: [canasta] },
        base.teams[1],
      ],
    };

    // Trying to discard stray WITHOUT melding qExtra (leaving 1 card) is REJECTED because going out is possible!
    const badDisc = applyAction(stateCanGoOut, {
      type: 'DISCARD',
      playerId: 'p0',
      cardId: stray.id,
    });
    expect(badDisc.ok).toBe(false);

    // Melding qExtra then discarding stray goes out cleanly!
    const meldOut = applyAction(stateCanGoOut, {
      type: 'COMMIT_MELDS',
      playerId: 'p0',
      submissions: [{ kind: 'add_to_meld', meldId: 'meld-1', cardIds: [qExtra.id] }],
    });
    expect(meldOut.ok).toBe(true);
    if (!meldOut.ok) return;
    const goOut = applyAction(meldOut.state, {
      type: 'DISCARD',
      playerId: 'p0',
      cardId: stray.id,
    });
    expect(goOut.ok).toBe(true);
    if (!goOut.ok) return;
    expect(goOut.state.phase).toBe('HAND_OVER');
    expect(goOut.state.lastHandSummary?.wentOutPlayerId).toBe('p0');

    // Case 2: Asked before drawing, partner approved, but hand holds 2 unmeldable strays -> graceful fallback!
    const stateImpossible: GameState = {
      ...stateCanGoOut,
      players: [
        {
          ...base.players[0],
          hasTakenFirstTurn: true,
          hand: [card('4', 'clubs', 0), card('7', 'hearts', 0)],
        },
        base.players[1],
        base.players[2],
        base.players[3],
      ],
    };
    const fallback = applyAction(stateImpossible, {
      type: 'DISCARD',
      playerId: 'p0',
      cardId: card('4', 'clubs', 0).id,
    });
    expect(fallback.ok).toBe(true);
    if (!fallback.ok) return;
    expect(fallback.state.activePlayerIndex).toBe(1);
    expect(fallback.state.partnerGoOut).toBeNull();
  });
});
