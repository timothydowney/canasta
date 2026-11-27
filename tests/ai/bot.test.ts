import { describe, expect, it } from 'vitest';
import { HeuristicBotController } from '../../src/ai';
import {
  BICYCLE_2P_CLASSIC,
  applyAction,
  createMatch,
  createRuleset,
  getPlayerView,
  type BotDifficulty,
  type GameState,
  type PlayerConfig,
} from '../../src/engine';

function countAllCards(state: GameState): number {
  const inHands = state.players.reduce((s, p) => s + p.hand.length, 0);
  const inMelds = state.teams.reduce(
    (s, t) => s + t.melds.reduce((ms, m) => ms + m.cards.length, 0),
    0,
  );
  const inRed3s = state.teams.reduce((s, t) => s + t.redThrees.length, 0);
  return state.stock.length + state.discardPile.cards.length + inHands + inMelds + inRed3s;
}

function runSimulatedHands(
  count: number,
  diff0: BotDifficulty,
  diff1: BotDifficulty,
  seedOffset = 1,
) {
  const players: PlayerConfig[] = [
    { id: 'bot-0', name: `Bot (${diff0})`, teamId: 'team-0', kind: 'bot', botDifficulty: diff0 },
    { id: 'bot-1', name: `Bot (${diff1})`, teamId: 'team-1', kind: 'bot', botDifficulty: diff1 },
  ];
  const ruleset = createRuleset(BICYCLE_2P_CLASSIC, 'single_hand');

  let wentOutCount = 0;
  let stockExhaustedCount = 0;
  let totalScore0 = 0;
  let totalScore1 = 0;
  let wins0 = 0;
  let wins1 = 0;

  for (let i = 0; i < count; i++) {
    const seed = seedOffset + i;
    let state = createMatch({ seed, ruleset, players });
    const bots = new Map([
      ['bot-0', new HeuristicBotController('bot-0', diff0, seed * 17)],
      ['bot-1', new HeuristicBotController('bot-1', diff1, seed * 31)],
    ]);

    let steps = 0;
    while (state.phase !== 'HAND_OVER' && state.phase !== 'MATCH_OVER') {
      expect(steps).toBeLessThan(400);
      const active = state.players[state.activePlayerIndex];
      const action = bots.get(active.id)!.chooseAction(getPlayerView(state, active.id));
      const res = applyAction(state, action);
      if (!res.ok) {
        throw new Error(
          `Seed ${seed} step ${steps} (${diff0} vs ${diff1}, ${active.id}, phase ${state.phase}) illegal action ${JSON.stringify(action)}: ${res.error}`,
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
    const s0 = summary.breakdowns[0].handNetScore;
    const s1 = summary.breakdowns[1].handNetScore;
    totalScore0 += s0;
    totalScore1 += s1;
    if (s0 > s1) wins0++;
    else if (s1 > s0) wins1++;
  }

  return {
    wentOutCount,
    stockExhaustedCount,
    avgScore0: totalScore0 / count,
    avgScore1: totalScore1 / count,
    wins0,
    wins1,
  };
}

describe('HeuristicBotController & Multi-Tier Benchmarks', () => {
  it('completes 500 seeded hands (Hard vs Normal & Hard vs Easy) with 0 illegal moves and strict 108-card conservation', () => {
    const hardVsEasy = runSimulatedHands(250, 'hard', 'easy', 1);
    const hardVsNormal = runSimulatedHands(250, 'hard', 'normal', 1001);

    expect(hardVsEasy.wentOutCount + hardVsEasy.stockExhaustedCount).toBe(250);
    expect(hardVsNormal.wentOutCount + hardVsNormal.stockExhaustedCount).toBe(250);
    expect(hardVsEasy.wentOutCount + hardVsNormal.wentOutCount).toBeGreaterThan(60);

    // Hard should meaningfully outperform Easy over 250 hands
    expect(hardVsEasy.avgScore0).toBeGreaterThan(hardVsEasy.avgScore1);
  });

  it('plays a complete multi-hand 5000-point Hard-vs-Hard match to MATCH_OVER', () => {
    const players: PlayerConfig[] = [
      { id: 'bot-0', name: 'Hard Bot A', teamId: 'team-0', kind: 'bot', botDifficulty: 'hard' },
      { id: 'bot-1', name: 'Hard Bot B', teamId: 'team-1', kind: 'bot', botDifficulty: 'hard' },
    ];
    let state = createMatch({
      seed: 2026,
      ruleset: createRuleset(BICYCLE_2P_CLASSIC, 'standard_5000'),
      players,
    });
    const bots = new Map([
      ['bot-0', new HeuristicBotController('bot-0', 'hard', 11)],
      ['bot-1', new HeuristicBotController('bot-1', 'hard', 22)],
    ]);

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
      const active = state.players[state.activePlayerIndex];
      const action = bots.get(active.id)!.chooseAction(getPlayerView(state, active.id));
      const res = applyAction(state, action);
      expect(res.ok).toBe(true);
      if (!res.ok) break;
      state = res.state;
    }

    expect(state.phase).toBe('MATCH_OVER');
    expect(
      Math.max(state.teams[0].cumulativeScore, state.teams[1].cumulativeScore),
    ).toBeGreaterThanOrEqual(5000);
  });
});
