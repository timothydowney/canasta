import { describe, expect, it } from 'vitest';
import { HeuristicBotController } from '../../src/ai';
import {
  BICYCLE_2P_CLASSIC,
  BICYCLE_3P_CUTTHROAT,
  BICYCLE_4P_CUTTHROAT,
  BICYCLE_4P_PARTNERSHIP,
  applyAction,
  createMatch,
  createRuleset,
  getPlayerView,
  type BotDifficulty,
  type GameState,
  type PlayerConfig,
  type RulesetConfig,
} from '../../src/engine';

function countAllCards(state: GameState): number {
  const inHands = state.players.reduce((s, p) => s + p.hand.length, 0);
  const inMelds = state.teams.reduce(
    (s, t) => s + t.melds.reduce((ms, m) => ms + m.cards.length, 0),
    0,
  );
  const inRed3s = state.teams.reduce((s, t) => s + t.redThrees.length, 0);
  return (
    state.stock.length +
    state.discardPile.cards.length +
    inHands +
    inMelds +
    inRed3s
  );
}

function runFormatHands(
  count: number,
  baseRuleset: RulesetConfig,
  players: PlayerConfig[],
  seedOffset = 1,
) {
  const ruleset = createRuleset(baseRuleset, 'single_hand');
  let wentOutCount = 0;
  let stockExhaustedCount = 0;
  const totalScores = new Array(ruleset.teamCount).fill(0);

  for (let i = 0; i < count; i++) {
    const seed = seedOffset + i;
    let state = createMatch({ seed, ruleset, players });
    const bots = new Map(
      players.map((p, idx) => [
        p.id,
        new HeuristicBotController(p.id, p.botDifficulty ?? 'normal', seed * (17 + idx * 13)),
      ]),
    );

    let steps = 0;
    while (state.phase !== 'HAND_OVER' && state.phase !== 'MATCH_OVER') {
      expect(steps).toBeLessThan(500);
      const actorId =
        state.partnerGoOut?.status === 'PENDING'
          ? state.partnerGoOut.partnerPlayerId
          : state.players[state.activePlayerIndex].id;
      const action = bots.get(actorId)!.chooseAction(getPlayerView(state, actorId));
      const res = applyAction(state, action);
      if (!res.ok) {
        throw new Error(
          `Format ${baseRuleset.id} seed ${seed} step ${steps} (${actorId}, phase ${state.phase}) illegal action ${JSON.stringify(action)}: ${res.error}`,
        );
      }
      state = res.state;
      expect(countAllCards(state)).toBe(108);
      steps++;
    }

    const summary = state.lastHandSummary!;
    if (summary.reason === 'WENT_OUT' || summary.reason === 'WENT_OUT_CONCEALED') {
      wentOutCount++;
    } else {
      stockExhaustedCount++;
    }
    summary.breakdowns.forEach((b, idx) => {
      totalScores[idx] += b.handNetScore;
    });
  }

  return {
    wentOutCount,
    stockExhaustedCount,
    avgScores: totalScores.map((s) => s / count),
  };
}

describe('HeuristicBotController Multi-Tier & Multi-Format Benchmarks', () => {
  it('completes 250 2P Hard-vs-Easy hands with Hard outscoring Easy and 0 illegal moves', () => {
    const players: PlayerConfig[] = [
      { id: 'b0', name: 'Hard', teamId: 'team-0', kind: 'bot', botDifficulty: 'hard' },
      { id: 'b1', name: 'Easy', teamId: 'team-1', kind: 'bot', botDifficulty: 'easy' },
    ];
    const res = runFormatHands(250, BICYCLE_2P_CLASSIC, players, 1);
    expect(res.wentOutCount + res.stockExhaustedCount).toBe(250);
    expect(res.wentOutCount).toBeGreaterThan(25);
    expect(res.avgScores[0]).toBeGreaterThan(res.avgScores[1]);
  });

  it('completes 300 seeded hands across 3P Cutthroat, 4P Partnership, and 4P Cutthroat with 0 illegal moves and 108-card conservation', () => {
    const p3: PlayerConfig[] = [
      { id: 'b0', name: 'B0', teamId: 'team-0', kind: 'bot', botDifficulty: 'hard' },
      { id: 'b1', name: 'B1', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
      { id: 'b2', name: 'B2', teamId: 'team-2', kind: 'bot', botDifficulty: 'easy' },
    ];
    const p4Part: PlayerConfig[] = [
      { id: 'b0', name: 'S', teamId: 'team-0', kind: 'bot', botDifficulty: 'hard' },
      { id: 'b1', name: 'W', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
      { id: 'b2', name: 'N', teamId: 'team-0', kind: 'bot', botDifficulty: 'hard' },
      { id: 'b3', name: 'E', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
    ];
    const p4Cut: PlayerConfig[] = [
      { id: 'b0', name: 'S', teamId: 'team-0', kind: 'bot', botDifficulty: 'hard' },
      { id: 'b1', name: 'W', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
      { id: 'b2', name: 'N', teamId: 'team-2', kind: 'bot', botDifficulty: 'normal' },
      { id: 'b3', name: 'E', teamId: 'team-3', kind: 'bot', botDifficulty: 'easy' },
    ];

    const r3 = runFormatHands(100, BICYCLE_3P_CUTTHROAT, p3, 2001);
    const r4p = runFormatHands(100, BICYCLE_4P_PARTNERSHIP, p4Part, 3001);
    const r4c = runFormatHands(100, BICYCLE_4P_CUTTHROAT, p4Cut, 4001);

    expect(r3.wentOutCount + r3.stockExhaustedCount).toBe(100);
    expect(r4p.wentOutCount + r4p.stockExhaustedCount).toBe(100);
    expect(r4c.wentOutCount + r4c.stockExhaustedCount).toBe(100);
    expect(r4p.wentOutCount).toBeGreaterThan(20);
  });

  it('plays a full 5000-point 4P Partnership match to MATCH_OVER', () => {
    const diffs: BotDifficulty[] = ['hard', 'normal', 'hard', 'normal'];
    const players: PlayerConfig[] = diffs.map((d, i) => ({
      id: `b${i}`,
      name: `Bot ${i}`,
      teamId: i % 2 === 0 ? 'team-0' : 'team-1',
      kind: 'bot',
      botDifficulty: d,
    }));
    let state = createMatch({
      seed: 2026,
      ruleset: createRuleset(BICYCLE_4P_PARTNERSHIP, 'standard_5000'),
      players,
    });
    const bots = new Map(
      players.map((p, idx) => [
        p.id,
        new HeuristicBotController(p.id, p.botDifficulty ?? 'normal', 11 + idx * 7),
      ]),
    );

    let safety = 0;
    while (state.phase !== 'MATCH_OVER') {
      expect(safety++).toBeLessThan(3000);
      if (state.phase === 'HAND_OVER') {
        const next = applyAction(state, { type: 'START_NEXT_HAND' });
        expect(next.ok).toBe(true);
        if (!next.ok) break;
        state = next.state;
        continue;
      }
      const actorId =
        state.partnerGoOut?.status === 'PENDING'
          ? state.partnerGoOut.partnerPlayerId
          : state.players[state.activePlayerIndex].id;
      const action = bots.get(actorId)!.chooseAction(getPlayerView(state, actorId));
      const res = applyAction(state, action);
      expect(res.ok).toBe(true);
      if (!res.ok) break;
      state = res.state;
    }

    expect(state.phase).toBe('MATCH_OVER');
    expect(
      Math.max(...state.teams.map((t) => t.cumulativeScore)),
    ).toBeGreaterThanOrEqual(5000);
  });
});
