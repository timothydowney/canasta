import React, { useState } from 'react';
import {
  BookOpen,
  Bot,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  BICYCLE_2P_CLASSIC,
  createRuleset,
  type BotDifficulty,
  type MatchLengthPreset,
} from '../../engine';
import type { GameMode, NewMatchRequest, SavedSession } from '../../store';
import { PlayingCard } from '../components/PlayingCard';
import { RulesScoringDrawer } from '../components/RulesScoringDrawer';

export interface StartScreenProps {
  savedSummary: SavedSession | null;
  onStartNewMatch: (req: NewMatchRequest) => void;
  onResumeSaved: () => void;
  onDiscardSaved: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  savedSummary,
  onStartNewMatch,
  onResumeSaved,
  onDiscardSaved,
}) => {
  const [mode, setMode] = useState<GameMode>('solo_bot');
  const [matchLength, setMatchLength] = useState<MatchLengthPreset>('standard_5000');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [rulesOpen, setRulesOpen] = useState(false);

  const previewRuleset = createRuleset(BICYCLE_2P_CLASSIC, matchLength);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartNewMatch({
      mode,
      matchLength,
      botDifficulty,
      player1Name: mode === 'solo_bot' && player1Name === 'Player 1' ? 'You' : player1Name,
      player2Name,
    });
  };

  return (
    <div className="min-h-dvh w-full casino-felt flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-300/35 bg-black/40 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Decorative fanned cards header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex items-center justify-center">
            <div className="-rotate-12 -mr-5">
              <PlayingCard
                card={{ id: 'deco-1', deckIndex: 0, rank: '3', suit: 'hearts', color: 'red' }}
                size="sm"
              />
            </div>
            <div className="z-10 -translate-y-1">
              <PlayingCard
                card={{ id: 'deco-2', deckIndex: 0, rank: 'JOKER', suit: 'joker', color: 'red' }}
                size="sm"
              />
            </div>
            <div className="rotate-12 -ml-5">
              <PlayingCard
                card={{ id: 'deco-3', deckIndex: 0, rank: 'A', suit: 'spades', color: 'black' }}
                size="sm"
              />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-amber-200">
            <Sparkles className="h-3 w-3" /> Bicycle Classic Rules
          </span>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
            Canasta
          </h1>
          <p className="mt-1 text-sm text-emerald-100/80">
            Classic 2-Player Table • Automatic Scoring • Pass-and-Play Ready
          </p>
        </div>

        {/* Resume Saved Match Banner */}
        {savedSummary && savedSummary.state.phase !== 'MATCH_OVER' && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/45 bg-amber-400/15 p-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Match in Progress
              </div>
              <div className="text-sm font-semibold text-white">
                Hand #{savedSummary.state.handNumber} •{' '}
                {savedSummary.state.teams[0].name}{' '}
                ({savedSummary.state.teams[0].cumulativeScore}) vs{' '}
                {savedSummary.state.teams[1].name}{' '}
                ({savedSummary.state.teams[1].cumulativeScore})
              </div>
              <div className="text-xs text-emerald-100/75">
                {savedSummary.mode === 'solo_bot' ? 'Solo vs. Computer' : '2-Player Pass-and-Play'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResumeSaved}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-stone-950 shadow hover:bg-amber-300 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Resume
              </button>
              <button
                type="button"
                onClick={onDiscardSaved}
                title="Discard saved match"
                className="rounded-xl border border-white/15 bg-black/25 p-2 text-emerald-200/75 hover:bg-black/40 hover:text-rose-300 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* New Match Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Play Mode */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
              Game Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('solo_bot')}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                  mode === 'solo_bot'
                    ? 'border-amber-400 bg-amber-400/15 shadow-lg'
                    : 'border-white/15 bg-black/25 hover:bg-black/35'
                }`}
              >
                <div className="rounded-xl bg-amber-400/20 p-2 text-amber-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Solo vs. Computer</div>
                  <div className="text-xs text-emerald-100/75 mt-0.5">
                    Play offline against the smart heuristic AI bot.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('pass_and_play')}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                  mode === 'pass_and_play'
                    ? 'border-amber-400 bg-amber-400/15 shadow-lg'
                    : 'border-white/15 bg-black/25 hover:bg-black/35'
                }`}
              >
                <div className="rounded-xl bg-emerald-400/20 p-2 text-emerald-300">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Pass-and-Play (2P)</div>
                  <div className="text-xs text-emerald-100/75 mt-0.5">
                    Share this laptop with a privacy shield between turns.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Names & Difficulty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-emerald-200/85">
                {mode === 'solo_bot' ? 'Your Name' : 'Player 1 Name'}
              </label>
              <input
                type="text"
                value={mode === 'solo_bot' && player1Name === 'Player 1' ? 'You' : player1Name}
                onChange={(e) => setPlayer1Name(e.target.value)}
                maxLength={20}
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            {mode === 'solo_bot' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-emerald-200/85">
                  Computer Difficulty
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['easy', 'normal'] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setBotDifficulty(diff)}
                      className={`rounded-xl border py-2 text-xs font-bold capitalize transition cursor-pointer ${
                        botDifficulty === diff
                          ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                          : 'border-white/15 bg-black/30 text-emerald-100/75 hover:bg-black/45'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-emerald-200/85">
                  Player 2 Name
                </label>
                <input
                  type="text"
                  value={player2Name}
                  onChange={(e) => setPlayer2Name(e.target.value)}
                  maxLength={20}
                  className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Match Length */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
              Match Length
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'standard_5000', label: 'Standard', sub: '5,000 pts' },
                  { id: 'quick_2500', label: 'Quick', sub: '2,500 pts' },
                  { id: 'single_hand', label: 'Single Hand', sub: '1 deal' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMatchLength(opt.id)}
                  className={`rounded-xl border px-3 py-2 text-center transition cursor-pointer ${
                    matchLength === opt.id
                      ? 'border-amber-400 bg-amber-400/20 text-white'
                      : 'border-white/15 bg-black/25 text-emerald-100/75 hover:bg-black/40'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[11px] text-amber-200/80">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/25 bg-white/5 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
            >
              <BookOpen className="h-4 w-4 text-amber-300" />
              Rules &amp; Scoring
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-extrabold text-stone-950 shadow-lg transition hover:bg-amber-300 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" /> Deal Cards
            </button>
          </div>
        </form>
      </div>

      <RulesScoringDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        ruleset={previewRuleset}
      />
    </div>
  );
};
