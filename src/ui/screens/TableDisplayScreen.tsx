import React, { useState } from 'react';
import {
  BookOpen,
  Bot,
  Gauge,
  LogOut,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import type { GameAction, TableView } from '../../engine';
import type { RoomLobbyState } from '../../shared/protocol';
import type { BotSpeed, ToastNotice } from '../../store';
import { ActionLog } from '../components/ActionLog';
import { HandSummaryModal } from '../components/HandSummaryModal';
import { MeldZone } from '../components/MeldZone';
import { RulesScoringDrawer } from '../components/RulesScoringDrawer';
import { StockAndDiscard } from '../components/StockAndDiscard';

export interface TableDisplayScreenProps {
  lobby: RoomLobbyState;
  view: TableView;
  isHost: boolean;
  soundMuted: boolean;
  onToggleSound: () => void;
  toast: ToastNotice | null;
  onDismissToast: () => void;
  onChangeBotSpeed: (speed: BotSpeed) => void;
  onSubstituteBot: (seatIndex: number) => void;
  onDispatch: (action: GameAction) => void;
  onLeaveRoom: () => void;
}

/**
 * 10-Foot Living-Room TV / Chrome Cast-Tab Shared Table View.
 * Renders zero private hands; displays large readable Stock/Discard, all Melds,
 * live seat connection dots, active turn spotlight, and full audio.
 */
export const TableDisplayScreen: React.FC<TableDisplayScreenProps> = ({
  lobby,
  view,
  isHost,
  soundMuted,
  onToggleSound,
  toast,
  onDismissToast,
  onChangeBotSpeed,
  onSubstituteBot,
  onDispatch,
  onLeaveRoom,
}) => {
  const [rulesOpen, setRulesOpen] = useState(false);

  const activePlayer = view.players.find((p) => p.id === view.activePlayerId);
  const phaseLabel =
    view.partnerGoOut?.status === 'PENDING'
      ? 'Partner Permission Requested'
      : view.phase === 'DRAW'
        ? 'Draw Phase'
        : view.phase === 'MELD_OR_DISCARD'
          ? 'Meld or Discard'
          : view.phase === 'HAND_OVER'
            ? 'Hand Complete'
            : 'Match Complete';

  const cycleBotSpeed = () => {
    const order: BotSpeed[] = ['slow', 'normal', 'fast'];
    const next = order[(order.indexOf(lobby.botSpeed) + 1) % order.length];
    onChangeBotSpeed(next);
  };

  return (
    <div className="flex h-dvh w-full flex-col casino-felt overflow-hidden">
      {/* 10-Foot TV Top Casino Rail */}
      <header className="felt-rail flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-2.5 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black tracking-tight text-amber-300">
            CANASTA
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">
            <Sparkles className="h-3.5 w-3.5" /> {view.ruleset.shortName} • Hand #{view.handNumber}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/35 bg-emerald-950/80 px-3 py-1 font-mono text-xs font-extrabold tracking-widest text-emerald-200">
            <Wifi className="h-3.5 w-3.5 text-emerald-400" /> ROOM {lobby.roomCode}
          </span>
        </div>

        {/* Big Readable Score Strip */}
        <div className="flex flex-wrap items-center gap-3 rounded-full border border-amber-300/35 bg-black/50 px-4 py-1.5 text-sm">
          {view.teams.map((t, idx) => (
            <React.Fragment key={t.id}>
              {idx > 0 && <span className="text-emerald-500/70">|</span>}
              <span className="font-semibold text-emerald-200">
                {t.name}:{' '}
                <strong className="text-base font-black text-white">
                  {t.cumulativeScore.toLocaleString()}
                </strong>
              </span>
            </React.Fragment>
          ))}
          {view.ruleset.winScore && (
            <span className="text-xs text-amber-200/70">
              / {view.ruleset.winScore.toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isHost && (
            <button
              type="button"
              onClick={cycleBotSpeed}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
            >
              <Gauge className="h-3.5 w-3.5 text-amber-300" />
              <span className="capitalize">{lobby.botSpeed}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSound}
            className="rounded-lg border border-white/15 bg-white/5 p-2 text-emerald-100 hover:bg-white/10 cursor-pointer"
            title={soundMuted ? 'Unmute table audio' : 'Mute table audio'}
          >
            {soundMuted ? (
              <VolumeX className="h-4 w-4 text-rose-300" />
            ) : (
              <Volume2 className="h-4 w-4 text-amber-300" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/35 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/25 cursor-pointer"
          >
            <BookOpen className="h-3.5 w-3.5" /> Rules &amp; Score
          </button>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="rounded-lg border border-white/15 bg-white/5 p-2 text-emerald-100 hover:bg-white/10 cursor-pointer"
            title="Exit Room"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Big TV Floating Announcement */}
      {toast && (
        <div
          key={toast.id}
          className="toast-float-in pointer-events-none fixed bottom-8 left-1/2 z-40 w-max max-w-[90vw]"
        >
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3 text-base font-extrabold shadow-2xl backdrop-blur-md ${
              toast.kind === 'error'
                ? 'border-rose-400/80 bg-rose-950/95 text-rose-100'
                : toast.kind === 'red_three'
                  ? 'border-rose-300/80 bg-rose-900/95 text-amber-100'
                  : 'border-amber-300/75 bg-[#0f261b]/95 text-amber-200'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={onDismissToast}
              className="rounded-full p-1 hover:bg-white/15 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main 16:9 Living-Room Felt Canvas */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-between gap-2 overflow-y-auto px-5 py-2.5">
        {/* Top Row: All Player Seat Badges + Live Connection Status */}
        <section
          className={`grid gap-2.5 ${
            view.players.length === 2
              ? 'grid-cols-2'
              : view.players.length === 3
                ? 'grid-cols-3'
                : 'grid-cols-4'
          }`}
        >
          {view.players.map((p) => {
            const seatMeta = lobby.seats[p.seatIndex];
            const disconnectedHuman =
              seatMeta?.occupantKind === 'human' && !seatMeta.connected;
            return (
              <div
                key={p.id}
                className={`rounded-2xl border px-3.5 py-2 transition ${
                  p.isActive
                    ? 'border-amber-400 bg-amber-400/18 shadow-[0_0_24px_rgba(251,191,36,0.25)]'
                    : 'border-emerald-200/15 bg-black/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        disconnectedHuman
                          ? 'bg-rose-400 animate-pulse'
                          : 'bg-emerald-400'
                      }`}
                    />
                    <span className="truncate text-sm font-extrabold text-white">
                      {p.name}
                    </span>
                  </div>
                  {p.isActive && (
                    <span className="shrink-0 rounded-md bg-amber-400 px-2 py-0.5 text-xs font-black text-stone-950">
                      TURN
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-xs text-emerald-100/85">
                  <span>
                    <strong className="text-sm text-white">{p.handCount}</strong> cards in hand
                  </span>
                  {disconnectedHuman && isHost && (
                    <button
                      type="button"
                      onClick={() => onSubstituteBot(p.seatIndex)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2 py-1 text-[11px] font-bold text-stone-950 hover:bg-amber-300 cursor-pointer"
                    >
                      <Bot className="h-3 w-3" /> Take Over w/ Bot
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Center Row: Turn Spotlight + Stock/Discard + Table Log */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-7 flex flex-col items-center gap-3">
            <div className="rounded-full border border-amber-300/40 bg-black/40 px-5 py-1.5 text-sm font-bold text-amber-200">
              {activePlayer?.name}&apos;s Turn — <span className="text-white">{phaseLabel}</span>
            </div>
            <StockAndDiscard
              stockCount={view.stockCount}
              drawCount={view.ruleset.drawCount}
              discardPile={{
                ...view.discardPile,
                isFrozenForViewer: view.discardPile.frozenByWildOrInitial,
              }}
              canDrawStock={false}
              canTakeDiscardPile={false}
              mustTakeDiscardPile={false}
              takePileModeActive={false}
              onDrawStock={() => {}}
              onClickDiscardPile={() => {}}
            />
          </div>
          <div className="lg:col-span-5">
            <ActionLog entries={view.actionLog} />
          </div>
        </section>

        {/* Bottom Row: All Teams' Melds */}
        <section
          className={`grid gap-3 ${
            view.teams.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'
          }`}
        >
          {view.teams.map((team) => (
            <MeldZone
              key={team.id}
              title={`${team.name} — ${team.cumulativeScore.toLocaleString()} pts`}
              melds={team.melds}
              redThrees={team.redThrees}
              hasMadeInitialMeld={team.hasMadeInitialMeld}
            />
          ))}
        </section>
      </main>

      <RulesScoringDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        ruleset={view.ruleset}
        teams={view.teams}
      />

      <HandSummaryModal
        summary={
          view.phase === 'HAND_OVER' || view.phase === 'MATCH_OVER'
            ? view.lastHandSummary
            : null
        }
        teams={view.teams}
        isMatchOver={view.phase === 'MATCH_OVER'}
        winnerTeamId={view.winnerTeamId}
        winScore={view.ruleset.winScore}
        onNextHand={() => onDispatch({ type: 'START_NEXT_HAND' })}
        onExitToMenu={onLeaveRoom}
        onExportReplay={() => {}}
      />
    </div>
  );
};
