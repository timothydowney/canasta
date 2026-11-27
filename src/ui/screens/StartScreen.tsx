import React, { useState } from 'react';
import {
  BookOpen,
  Bot,
  Laptop,
  LogIn,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Tv,
  User,
  Users,
  Wifi,
} from 'lucide-react';
import {
  ALL_RULESETS,
  createRuleset,
  getRulesetById,
  type BotDifficulty,
  type MatchLengthPreset,
  type PlayerConfig,
  type RulesetId,
  type TeamId,
} from '../../engine';
import type { HostDisplayMode } from '../../shared/protocol';
import type { NewMatchRequest, SavedSession } from '../../store';
import { PlayingCard } from '../components/PlayingCard';
import { RulesScoringDrawer } from '../components/RulesScoringDrawer';

export interface StartScreenProps {
  savedSummary: SavedSession | null;
  initialJoinCode?: string | null;
  remoteError?: string | null;
  onStartNewMatch: (req: NewMatchRequest) => void;
  onResumeSaved: () => void;
  onDiscardSaved: () => void;
  onHostLanRoom: (req: {
    rulesetId: RulesetId;
    matchLength: MatchLengthPreset;
    hostDisplayMode: HostDisplayMode;
    hostName?: string;
  }) => Promise<boolean>;
  onJoinLanRoom: (req: {
    roomCode: string;
    playerName: string;
  }) => Promise<boolean>;
}

interface SeatDraft {
  kind: 'human' | 'bot';
  name: string;
  botDifficulty: BotDifficulty;
}

const SEAT_DIRECTIONS: Record<number, string[]> = {
  2: ['South (Seat 1)', 'North (Seat 2)'],
  3: ['South (Seat 1)', 'West (Seat 2)', 'East (Seat 3)'],
  4: ['South (Seat 1)', 'West (Seat 2)', 'North (Seat 3)', 'East (Seat 4)'],
};

function buildDefaultSeats(
  rulesetId: RulesetId,
  preset: 'solo' | 'two_humans' | 'all_humans',
): SeatDraft[] {
  const ruleset = getRulesetById(rulesetId);
  const count = ruleset.playerCount;
  const isPartnership = rulesetId === 'bicycle-4p-partnership';

  return Array.from({ length: count }, (_, idx) => {
    if (preset === 'all_humans') {
      return {
        kind: 'human',
        name: `Player ${idx + 1}`,
        botDifficulty: 'normal',
      };
    }
    if (preset === 'two_humans') {
      // In 4P Partnership, seats 0 & 2 are partners!
      const isHuman = isPartnership ? idx === 0 || idx === 2 : idx === 0 || idx === 1;
      if (isHuman) {
        return {
          kind: 'human',
          name: idx === 0 ? 'Player 1' : 'Player 2',
          botDifficulty: 'normal',
        };
      }
      return {
        kind: 'bot',
        name: `Bot ${idx}`,
        botDifficulty: 'normal',
      };
    }
    // Solo vs Bots
    if (idx === 0) {
      return { kind: 'human', name: 'You', botDifficulty: 'normal' };
    }
    if (isPartnership && idx === 2) {
      return { kind: 'bot', name: 'Partner Bot', botDifficulty: 'normal' };
    }
    return {
      kind: 'bot',
      name: count === 2 ? 'Computer' : `Bot ${idx}`,
      botDifficulty: 'normal',
    };
  });
}

function teamForSeat(rulesetId: RulesetId, seatIndex: number): TeamId {
  if (rulesetId === 'bicycle-4p-partnership') {
    return seatIndex % 2 === 0 ? 'team-0' : 'team-1';
  }
  return `team-${seatIndex}` as TeamId;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  savedSummary,
  initialJoinCode,
  remoteError,
  onStartNewMatch,
  onResumeSaved,
  onDiscardSaved,
  onHostLanRoom,
  onJoinLanRoom,
}) => {
  const [section, setSection] = useState<'local' | 'host_lan' | 'join_lan'>(
    initialJoinCode ? 'join_lan' : 'local',
  );
  const [rulesetId, setRulesetId] = useState<RulesetId>('bicycle-2p-classic');
  const [matchLength, setMatchLength] = useState<MatchLengthPreset>('standard_5000');
  const [seats, setSeats] = useState<SeatDraft[]>(() =>
    buildDefaultSeats('bicycle-2p-classic', 'solo'),
  );
  const [hostDisplayMode, setHostDisplayMode] =
    useState<HostDisplayMode>('table_display');
  const [hostName, setHostName] = useState('Host');
  const [joinCode, setJoinCode] = useState(
    (initialJoinCode ?? '').toUpperCase().slice(0, 4),
  );
  const [joinName, setJoinName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const selectedRuleset = getRulesetById(rulesetId);
  const previewRuleset = createRuleset(selectedRuleset, matchLength);
  const humanCount = seats.filter((s) => s.kind === 'human').length;

  const handleFormatChange = (nextId: RulesetId) => {
    setRulesetId(nextId);
    setSeats(buildDefaultSeats(nextId, 'solo'));
  };

  const applyPreset = (preset: 'solo' | 'two_humans' | 'all_humans') => {
    setSeats(buildDefaultSeats(rulesetId, preset));
  };

  const updateSeat = (idx: number, patch: Partial<SeatDraft>) => {
    setSeats((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const next = { ...s, ...patch };
        if (patch.kind === 'bot' && (s.name === 'You' || s.name.startsWith('Player '))) {
          next.name =
            rulesetId === 'bicycle-4p-partnership' && idx === 2
              ? 'Partner Bot'
              : selectedRuleset.playerCount === 2
                ? 'Computer'
                : `Bot ${idx + 1}`;
        }
        if (patch.kind === 'human' && (s.name.startsWith('Bot') || s.name === 'Computer' || s.name === 'Partner Bot')) {
          next.name = `Player ${idx + 1}`;
        }
        return next;
      }),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (humanCount === 0) return;

    const players: PlayerConfig[] = seats.map((s, idx) => {
      const baseName = s.name.trim() || (s.kind === 'human' ? `Player ${idx + 1}` : `Bot ${idx + 1}`);
      const displayName =
        s.kind === 'bot' && !baseName.includes('(')
          ? `${baseName} (${s.botDifficulty[0].toUpperCase()}${s.botDifficulty.slice(1)})`
          : baseName;
      return {
        id: `p${idx}`,
        name: displayName,
        teamId: teamForSeat(rulesetId, idx),
        kind: s.kind,
        botDifficulty: s.kind === 'bot' ? s.botDifficulty : undefined,
      };
    });

    const stripDiff = (n: string) => n.replace(/\s*\((Easy|Normal|Hard)\)$/, '');
    const teamNames =
      rulesetId === 'bicycle-4p-partnership'
        ? [
            `${stripDiff(players[0].name)} & ${stripDiff(players[2].name)}`,
            `${stripDiff(players[1].name)} & ${stripDiff(players[3].name)}`,
          ]
        : players.map((p) => stripDiff(p.name));

    onStartNewMatch({
      rulesetId,
      matchLength,
      players,
      teamNames,
    });
  };

  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onHostLanRoom({
      rulesetId,
      matchLength,
      hostDisplayMode,
      hostName: hostDisplayMode === 'player' ? hostName : undefined,
    });
    setBusy(false);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length < 4) return;
    setBusy(true);
    await onJoinLanRoom({
      roomCode: joinCode.trim().toUpperCase(),
      playerName: joinName.trim() || 'Player',
    });
    setBusy(false);
  };

  const seatLabels = SEAT_DIRECTIONS[selectedRuleset.playerCount];

  return (
    <div className="min-h-dvh w-full casino-felt flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl rounded-3xl border border-amber-300/35 bg-black/40 p-5 sm:p-7 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex items-center justify-center">
            <div className="-rotate-12 -mr-5">
              <PlayingCard
                card={{ id: 'deco-1', deckIndex: 0, rank: '3', suit: 'hearts', color: 'red' }}
                size="xs"
              />
            </div>
            <div className="z-10 -translate-y-1">
              <PlayingCard
                card={{ id: 'deco-2', deckIndex: 0, rank: 'JOKER', suit: 'joker', color: 'red' }}
                size="xs"
              />
            </div>
            <div className="rotate-12 -ml-5">
              <PlayingCard
                card={{ id: 'deco-3', deckIndex: 0, rank: 'A', suit: 'spades', color: 'black' }}
                size="xs"
              />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-amber-200">
            <Sparkles className="h-3 w-3" /> Official Bicycle Rules
          </span>
          <h1 className="mt-1.5 text-3xl sm:text-4xl font-black tracking-tight text-white">
            Canasta
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-emerald-100/80">
            2P Classic • 3P Cutthroat • 4P Partnership • 4P Cutthroat • LAN Phone-Hands
          </p>
        </div>

        {/* Top Mode Tabs: Play Local | Host LAN Room | Join Room */}
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/35 p-1">
          <button
            type="button"
            onClick={() => setSection('local')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition cursor-pointer ${
              section === 'local'
                ? 'bg-amber-400 text-stone-950 shadow'
                : 'text-emerald-100/80 hover:text-white'
            }`}
          >
            <Laptop className="h-3.5 w-3.5" /> Play Local
          </button>
          <button
            type="button"
            onClick={() => setSection('host_lan')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition cursor-pointer ${
              section === 'host_lan'
                ? 'bg-amber-400 text-stone-950 shadow'
                : 'text-emerald-100/80 hover:text-white'
            }`}
          >
            <Wifi className="h-3.5 w-3.5" /> Host LAN Room
          </button>
          <button
            type="button"
            onClick={() => setSection('join_lan')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition cursor-pointer ${
              section === 'join_lan'
                ? 'bg-amber-400 text-stone-950 shadow'
                : 'text-emerald-100/80 hover:text-white'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" /> Join Room
          </button>
        </div>

        {remoteError && section !== 'local' && (
          <div className="mt-4 rounded-xl border border-rose-400/50 bg-rose-950/75 px-4 py-2.5 text-xs font-semibold text-rose-100">
            {remoteError}
          </div>
        )}

        {/* Resume Saved Match Banner (Local Tab) */}
        {section === 'local' &&
          savedSummary &&
          savedSummary.state.phase !== 'MATCH_OVER' && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/45 bg-amber-400/15 p-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Match in Progress — {savedSummary.state.ruleset.shortName}
              </div>
              <div className="truncate text-xs sm:text-sm font-semibold text-white">
                Hand #{savedSummary.state.handNumber} •{' '}
                {savedSummary.state.teams
                  .map((t) => `${t.name} (${t.cumulativeScore})`)
                  .join(' vs ')}
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

        {section === 'local' && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Format Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
              Table Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_RULESETS.map((rs) => (
                <button
                  key={rs.id}
                  type="button"
                  onClick={() => handleFormatChange(rs.id)}
                  className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                    rulesetId === rs.id
                      ? 'border-amber-400 bg-amber-400/20 shadow'
                      : 'border-white/15 bg-black/25 hover:bg-black/40'
                  }`}
                >
                  <div className="text-xs font-extrabold text-white">
                    {rs.shortName}
                  </div>
                  <div className="mt-0.5 text-[10px] text-emerald-100/75">
                    {rs.dealSize} cards • Draw {rs.drawCount} • {rs.canastasRequiredToGoOut}C out
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Seat Configurator */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-amber-200/90">
                Seats ({humanCount >= 2 ? 'Pass-and-Play Privacy Shield Active' : 'Solo vs. Computer'})
              </label>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => applyPreset('solo')}
                  className="rounded-lg border border-white/15 bg-black/30 px-2.5 py-1 font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
                >
                  Solo vs. Bots
                </button>
                {selectedRuleset.playerCount >= 3 && (
                  <button
                    type="button"
                    onClick={() => applyPreset('two_humans')}
                    className="rounded-lg border border-white/15 bg-black/30 px-2.5 py-1 font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
                  >
                    {rulesetId === 'bicycle-4p-partnership'
                      ? '2 Partners + 2 Bots'
                      : '2 Humans + Bots'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => applyPreset('all_humans')}
                  className="rounded-lg border border-white/15 bg-black/30 px-2.5 py-1 font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
                >
                  All Humans
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {seats.map((seat, idx) => {
                const isTeam0 =
                  rulesetId === 'bicycle-4p-partnership' && idx % 2 === 0;
                const isTeam1 =
                  rulesetId === 'bicycle-4p-partnership' && idx % 2 === 1;
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-2.5 ${
                      isTeam0
                        ? 'border-emerald-300/35 bg-emerald-950/35'
                        : isTeam1
                          ? 'border-amber-300/25 bg-black/30'
                          : 'border-white/15 bg-black/25'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-emerald-200/85">
                        {seatLabels[idx]}
                      </span>
                      {rulesetId === 'bicycle-4p-partnership' && (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            isTeam0
                              ? 'bg-emerald-400/20 text-emerald-200'
                              : 'bg-amber-400/20 text-amber-200'
                          }`}
                        >
                          <Users className="h-2.5 w-2.5" />
                          {isTeam0 ? 'Team 1' : 'Team 2'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={seat.name}
                        onChange={(e) => updateSeat(idx, { name: e.target.value })}
                        maxLength={16}
                        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                      />

                      <div className="flex rounded-lg border border-white/15 bg-black/40 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => updateSeat(idx, { kind: 'human' })}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold transition cursor-pointer ${
                            seat.kind === 'human'
                              ? 'bg-emerald-400 text-stone-950'
                              : 'text-emerald-100/70 hover:text-white'
                          }`}
                        >
                          <User className="h-3 w-3" /> Human
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSeat(idx, { kind: 'bot' })}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold transition cursor-pointer ${
                            seat.kind === 'bot'
                              ? 'bg-amber-400 text-stone-950'
                              : 'text-emerald-100/70 hover:text-white'
                          }`}
                        >
                          <Bot className="h-3 w-3" /> Bot
                        </button>
                      </div>
                    </div>

                    {seat.kind === 'bot' && (
                      <div className="mt-1.5 grid grid-cols-3 gap-1">
                        {(['easy', 'normal', 'hard'] as const).map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => updateSeat(idx, { botDifficulty: diff })}
                            className={`rounded-md border py-1 text-[10px] font-bold capitalize transition cursor-pointer ${
                              seat.botDifficulty === diff
                                ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                                : 'border-white/10 bg-black/25 text-emerald-100/65 hover:text-white'
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {humanCount === 0 && (
              <p className="mt-1 text-xs font-semibold text-rose-300">
                Select at least one Human seat to play.
              </p>
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
                  className={`rounded-xl border px-3 py-1.5 text-center transition cursor-pointer ${
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

          {/* Submit */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
              disabled={humanCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-extrabold text-stone-950 shadow-lg transition hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" /> Deal Cards
            </button>
          </div>
        </form>
        )}

        {/* Host LAN Room Form */}
        {section === 'host_lan' && (
          <form onSubmit={handleHostSubmit} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
                Table Format
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_RULESETS.map((rs) => (
                  <button
                    key={rs.id}
                    type="button"
                    onClick={() => handleFormatChange(rs.id)}
                    className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                      rulesetId === rs.id
                        ? 'border-amber-400 bg-amber-400/20 shadow'
                        : 'border-white/15 bg-black/25 hover:bg-black/40'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-white">{rs.shortName}</div>
                    <div className="mt-0.5 text-[10px] text-emerald-100/75">
                      {rs.dealSize} cards • Draw {rs.drawCount}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
                This Screen&apos;s Role
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setHostDisplayMode('table_display')}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                    hostDisplayMode === 'table_display'
                      ? 'border-amber-400 bg-amber-400/15'
                      : 'border-white/15 bg-black/25 hover:bg-black/35'
                  }`}
                >
                  <div className="rounded-xl bg-amber-400/20 p-2 text-amber-300">
                    <Tv className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">
                      Shared TV / Table Display
                    </div>
                    <div className="mt-0.5 text-xs text-emerald-100/75">
                      Jackbox-style! Cast this tab to your TV; everyone plays privately on their phones.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setHostDisplayMode('player')}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                    hostDisplayMode === 'player'
                      ? 'border-amber-400 bg-amber-400/15'
                      : 'border-white/15 bg-black/25 hover:bg-black/35'
                  }`}
                >
                  <div className="rounded-xl bg-emerald-400/20 p-2 text-emerald-300">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">
                      Play on This Device
                    </div>
                    <div className="mt-0.5 text-xs text-emerald-100/75">
                      Take Seat 1 on this laptop while others join on their own laptops or phones.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {hostDisplayMode === 'player' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-emerald-200/85">
                  Your Name
                </label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  maxLength={16}
                  className="w-full max-w-xs rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}

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
                    className={`rounded-xl border px-3 py-1.5 text-center transition cursor-pointer ${
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-extrabold text-stone-950 shadow-lg transition hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
              >
                <Wifi className="h-4 w-4" /> Create Room &amp; Show QR Code
              </button>
            </div>
          </form>
        )}

        {/* Join Existing LAN Room Form */}
        {section === 'join_lan' && (
          <form onSubmit={handleJoinSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
                  4-Letter Room Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
                  }
                  placeholder="e.g. K7QM"
                  maxLength={4}
                  required
                  className="w-full rounded-xl border border-amber-300/40 bg-black/40 px-4 py-3 font-mono text-2xl font-black tracking-[0.25em] text-amber-200 uppercase focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/90">
                  Your Name
                </label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={16}
                  required
                  className="w-full rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-base font-semibold text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={busy || joinCode.trim().length < 4}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-sm font-extrabold text-stone-950 shadow-lg transition hover:bg-emerald-300 disabled:opacity-40 cursor-pointer"
              >
                <LogIn className="h-4 w-4" /> Join Table
              </button>
            </div>
          </form>
        )}
      </div>

      <RulesScoringDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        ruleset={previewRuleset}
      />
    </div>
  );
};
