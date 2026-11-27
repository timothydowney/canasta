import React from 'react';
import { Download, Trophy, Play, Home } from 'lucide-react';
import type { HandSummary, TeamId, TeamState } from '../../engine';

export interface HandSummaryModalProps {
  summary: HandSummary | null;
  teams: TeamState[];
  isMatchOver: boolean;
  winnerTeamId: TeamId | null;
  winScore: number | null;
  onNextHand: () => void;
  onExitToMenu: () => void;
  onExportReplay: () => void;
}

export const HandSummaryModal: React.FC<HandSummaryModalProps> = ({
  summary,
  teams,
  isMatchOver,
  winnerTeamId,
  winScore,
  onNextHand,
  onExitToMenu,
  onExportReplay,
}) => {
  if (!summary) return null;

  const winnerName =
    winnerTeamId
      ? teams.find((t) => t.id === winnerTeamId)?.name ?? 'Winner'
      : 'Tie Game';

  const reasonLabel =
    summary.reason === 'WENT_OUT_CONCEALED'
      ? 'Concealed Going Out!'
      : summary.reason === 'WENT_OUT'
        ? 'Player Went Out'
        : summary.reason === 'STOCK_EXHAUSTED_RED_THREE'
          ? 'Last Stock Card Was a Red 3'
          : 'Stock Exhausted';

  const breakdowns = summary.breakdowns;
  const rows: Array<{
    label: string;
    values: number[];
    highlight?: boolean;
  }> = [
    {
      label: 'Melded Card Points',
      values: breakdowns.map((b) => b.meldedCardPoints),
    },
    {
      label: 'Natural Canastas (+500)',
      values: breakdowns.map((b) => b.naturalCanastaPoints),
    },
    {
      label: 'Mixed Canastas (+300)',
      values: breakdowns.map((b) => b.mixedCanastaPoints),
    },
    {
      label: 'Red 3s',
      values: breakdowns.map((b) => b.redThreePoints),
    },
    {
      label: 'Going Out Bonus',
      values: breakdowns.map((b) => b.goingOutBonus),
    },
    {
      label: 'Unmelded Cards in Hand',
      values: breakdowns.map((b) => b.unmeldedHandPenalty),
    },
    {
      label: 'Hand Net Score',
      values: breakdowns.map((b) => b.handNetScore),
      highlight: true,
    },
  ];

  const fmt = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-300/40 bg-[#0d311f] p-6 shadow-2xl">
        <div className="text-center">
          {isMatchOver && (
            <div className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full bg-amber-400/20 border border-amber-300/50 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-300">
              <Trophy className="h-4 w-4" /> Match Complete — {winnerName} Wins!
            </div>
          )}
          <h2 className="text-2xl font-extrabold text-white">
            Hand #{summary.handNumber} Summary
          </h2>
          <p className="mt-1 text-sm text-emerald-200/80">{reasonLabel}</p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-emerald-200/15 bg-black/25">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-xs uppercase tracking-wider text-emerald-200/80">
              <tr>
                <th className="px-4 py-2.5 text-left">Category</th>
                {teams.map((t) => (
                  <th key={t.id} className="px-3 py-2.5 text-right">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr
                  key={r.label}
                  className={
                    r.highlight
                      ? 'bg-amber-400/10 font-bold text-white'
                      : 'text-emerald-100/90'
                  }
                >
                  <td className="px-4 py-2">{r.label}</td>
                  {r.values.map((v, i) => (
                    <td
                      key={i}
                      className={`px-3 py-2 text-right ${
                        v < 0
                          ? 'text-rose-300'
                          : v > 0 && r.highlight
                            ? 'text-emerald-300'
                            : ''
                      }`}
                    >
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-black/45 font-extrabold text-base text-amber-200">
                <td className="px-4 py-3">
                  Match Total {winScore ? `(Target ${winScore.toLocaleString()})` : ''}
                </td>
                {breakdowns.map((b) => (
                  <td key={b.teamId} className="px-3 py-3 text-right">
                    {b.cumulativeAfterHand.toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExportReplay}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/20 bg-white/5 px-3.5 py-2 text-xs font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" /> Export Hand Replay
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onExitToMenu}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
            >
              <Home className="h-4 w-4" /> Menu
            </button>
            {!isMatchOver && (
              <button
                type="button"
                onClick={onNextHand}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 shadow-lg hover:bg-amber-300 cursor-pointer"
              >
                <Play className="h-4 w-4" /> Deal Hand #{summary.handNumber + 1}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
