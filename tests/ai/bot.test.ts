import { describe, expect, it } from 'vitest';
import { HeuristicBotController } from '../../src/ai';
import {
  BICYCLE_2P_CLASSIC,
  applyAction,
  createMatch,
  createRuleset,
  getPlayerView,
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

describe('HeuristicBotController & 500-Hand Soak Test', () => {
  it('completes 500 seeded 2-player Bot-vs-Bot hands with 0 illegal moves and strict 108-card conservation', () => {
    const players: PlayerConfig[] = [
      { id: 'bot-0', name: 'Normal Bot', teamId: 'team-0', kind: 'bot', botDifficulty: 'normal' },
      { id: 'bot-1', name: 'Easy Bot', teamId: 'team-1', kind: 'bot', botDifficulty: 'easy' },
    ];
    const ruleset = createRuleset(BICYCLE_2P_CLASSIC, 'single_hand');

    let wentOutCount = 0;
    let stockExhaustedCount = 0;
    let totalActions = 0;

    for (let seed = 1; seed <= 500; seed++) {
      let state = createMatch({ seed, ruleset, players });
      const bots = new Map([
        ['bot-0', new HeuristicBotController('bot-0', 'normal', seed * 17)],
        ['bot-1', new HeuristicBotController('bot-1', 'easy', seed * 31)],
      ]);

      let steps = 0;
      const MAX_STEPS = 400;

      while (state.phase !== 'HAND_OVER' && state.phase !== 'MATCH_OVER') {
        expect(steps).toBeLessThan(MAX_STEPS);
        const active = state.players[state.activePlayerIndex];
        const view = getPlayerView(state, active.id);
        const bot = bots.get(active.id)!;
        const action = bot.chooseAction(view);

        const res = applyAction(state, action);
        if (!res.ok) {
          throw new Error(
            `Seed ${seed} step ${steps} (${active.id}, phase ${state.phase}) illegal action ${JSON.stringify(action)}: ${res.error}`,
          );
        }
        state = res.state;
        expect(countAllCards(state)).toBe(108);
        steps++;
        totalActions++;
      }

      expect(state.lastHandSummary).not.toBeNull();
      const reason = state.lastHandSummary!.reason;
      if (reason === 'WENT_OUT' || reason === 'WENT_OUT_CONCEALED') {
        wentOutCount++;
      } else {
        stockExhaustedCount++;
      }
    }

    expect(wentOutCount + stockExhaustedCount).toBe(500);
    expect(wentOutCount).toBeGreaterThan(50); // Bots genuinely build Canastas and go out!
    expect(totalActions).toBeGreaterThan(5000);
  });

  it('plays a complete multi-hand 5000-point match to MATCH_OVER', () => {
    const players: PlayerConfig[] = [
      { id: 'bot-0', name: 'Bot A', teamId: 'team-0', kind: 'bot', botDifficulty: 'normal' },
      { id: 'bot-1', name: 'Bot B', teamId: 'team-1', kind: 'bot', botDifficulty: 'normal' },
    ];
    let state = createMatch({
      seed: 2026,
      ruleset: createRuleset(BICYCLE_2P_CLASSIC, 'standard_5000'),
      players,
    });
    const bots = new Map([
      ['bot-0', new HeuristicBotController('bot-0', 'normal', 11)],
      ['bot-1', new HeuristicBotController('bot-1', 'normal', 22)],
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
