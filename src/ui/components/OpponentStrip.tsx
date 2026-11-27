import React, { useState } from 'react';
import { Crown, Users, X } from 'lucide-react';
import {
  getCardPoints,
  getTeamById,
  type Meld,
  type PlayerView,
  type PublicPlayerView,
} from '../../engine';
import { MeldZone } from './MeldZone';
import { PlayingCard } from './PlayingCard';

export interface OpponentStripProps {
  view: PlayerView;
}

const SEAT_LABELS_4 = ['Left (West)', 'Across (North)', 'Right (East)'];
const SEAT_LABELS_3 = ['Left', 'Right'];

export const OpponentStrip: React.FC<OpponentStripProps> = ({ view }) => {
  const [inspectingMeld, setInspectingMeld] = useState<{
    owner: string;
    meld: Meld;
  } | null>(null);

  const viewer = view.players.find((p) => p.id === view.viewerId)!;
  const count = view.players.length;

  // Order other players clockwise starting left of viewer
  const othersClockwise: PublicPlayerView[] = [];
  for (let offset = 1; offset < count; offset++) {
    const seatIdx = (viewer.seatIndex + offset) % count;
    const p = view.players.find((pl) => pl.seatIndex === seatIdx);
    if (p) othersClockwise.push(p);
  }

  const isPartnership =
    view.ruleset.teamCount === 2 && view.ruleset.playerCount === 4;
  const isTwoPlayer = view.ruleset.playerCount === 2;

  const possessive = (name: string) =>
    name === 'You' ? 'Your' : name.endsWith('s') ? `${name}'` : `${name}'s`;

  // 2-Player Classic Layout (unchanged Phase 1 look)
  if (isTwoPlayer) {
    const oppPlayer = othersClockwise[0];
    const oppTeam = getTeamById(view.teams, oppPlayer.teamId);
    const oppBackCount = Math.min(oppPlayer.handCount, 12);

    return (
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
        <div className="lg:col-span-4 flex items-center gap-3 rounded-xl border border-emerald-200/15 bg-black/20 px-3 py-2">
          <div className="flex items-center">
            {Array.from({ length: oppBackCount }).map((_, idx) => (
              <div key={idx} className={idx === 0 ? '' : '-ml-7'}>
                <PlayingCard faceDown backColor="red" size="xs" />
              </div>
            ))}
            {oppBackCount === 0 && (
              <span className="text-xs italic text-emerald-200/60">0 cards</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-white">
                {oppPlayer.name}
              </span>
              {oppPlayer.isActive && (
                <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-stone-950">
                  TURN
                </span>
              )}
            </div>
            <div className="text-xs text-emerald-200/80">
              {oppPlayer.handCount} card{oppPlayer.handCount === 1 ? '' : 's'} in hand
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <MeldZone
            title={`${possessive(oppTeam.name)} Melds`}
            melds={oppTeam.melds}
            redThrees={oppTeam.redThrees}
            hasMadeInitialMeld={oppTeam.hasMadeInitialMeld}
            compact
          />
        </div>
      </section>
    );
  }

  // 4-Player Partnership Layout: 3 compact seat badges + shared Opponents' Melds
  if (isPartnership) {
    const oppTeam = view.teams.find((t) => t.id !== view.viewerTeamId)!;

    return (
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
        <div className="lg:col-span-5 grid grid-cols-3 gap-1.5">
          {othersClockwise.map((p, idx) => {
            const isPartner = p.teamId === view.viewerTeamId;
            return (
              <div
                key={p.id}
                className={`rounded-xl border px-2.5 py-2 ${
                  p.isActive
                    ? 'border-amber-400 bg-amber-400/15'
                    : isPartner
                      ? 'border-emerald-300/35 bg-emerald-950/55'
                      : 'border-emerald-200/15 bg-black/25'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200/70">
                    {SEAT_LABELS_4[idx].split(' ')[0]}
                  </span>
                  {isPartner && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-400/20 px-1 py-0.5 text-[9px] font-bold text-emerald-200">
                      <Users className="h-2.5 w-2.5" /> Partner
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  <span className="truncate text-xs font-bold text-white">
                    {p.name}
                  </span>
                  {p.isActive && (
                    <span className="shrink-0 rounded bg-amber-400 px-1 py-[1px] text-[9px] font-extrabold text-stone-950">
                      TURN
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-100/80">
                  <div className="flex">
                    {Array.from({ length: Math.min(p.handCount, 4) }).map(
                      (_, ci) => (
                        <div
                          key={ci}
                          className={`h-4 w-3 rounded-[2px] border border-white/40 ${
                            isPartner ? 'bg-blue-900' : 'bg-rose-900'
                          } ${ci === 0 ? '' : '-ml-1.5'}`}
                        />
                      ),
                    )}
                  </div>
                  <span className="font-semibold">{p.handCount}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-7">
          <MeldZone
            title={`Opponents' Melds (${oppTeam.name})`}
            melds={oppTeam.melds}
            redThrees={oppTeam.redThrees}
            hasMadeInitialMeld={oppTeam.hasMadeInitialMeld}
            compact
          />
        </div>
      </section>
    );
  }

  // 3-Player & 4-Player Cutthroat Layout: 2- or 3-column compact opponent strip with clickable meld pills!
  const gridCols = othersClockwise.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3';
  const labels = othersClockwise.length === 2 ? SEAT_LABELS_3 : SEAT_LABELS_4;

  return (
    <section className={`grid ${gridCols} gap-2`}>
      {othersClockwise.map((opp, idx) => {
        const oppTeam = getTeamById(view.teams, opp.teamId);
        const meldPts = oppTeam.melds.reduce(
          (sum, m) => sum + m.cards.reduce((s, c) => s + getCardPoints(c), 0),
          0,
        );
        const canastas = oppTeam.melds.filter((m) => m.isCanasta).length;

        return (
          <div
            key={opp.id}
            className={`rounded-xl border px-3 py-2 ${
              opp.isActive
                ? 'border-amber-400 bg-amber-400/12'
                : 'border-emerald-200/15 bg-black/25'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-semibold uppercase text-emerald-300/70">
                  {labels[idx].split(' ')[0]}
                </span>
                <span className="truncate text-xs font-bold text-white">
                  {opp.name}
                </span>
                {opp.isActive && (
                  <span className="shrink-0 rounded bg-amber-400 px-1.5 py-[1px] text-[9px] font-extrabold text-stone-950">
                    TURN
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] font-bold text-amber-200">
                {oppTeam.cumulativeScore.toLocaleString()} pts
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-emerald-100/80">
              <span className="rounded bg-black/35 px-1.5 py-0.5">
                Hand: <strong className="text-white">{opp.handCount}</strong>
              </span>
              <span className="rounded bg-black/35 px-1.5 py-0.5">
                Melds: {meldPts}
              </span>
              {canastas > 0 && (
                <span className="rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 font-bold text-amber-200">
                  Canastas: {canastas}
                </span>
              )}
              {oppTeam.redThrees.length > 0 && (
                <span className="rounded bg-rose-500/25 border border-rose-400/40 px-1.5 py-0.5 font-bold text-rose-200">
                  Red 3s: {oppTeam.redThrees.length}
                </span>
              )}
            </div>

            {/* Clickable meld pills */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {oppTeam.melds.length === 0 ? (
                <span className="text-[10px] italic text-emerald-100/40">
                  No melds yet
                </span>
              ) : (
                oppTeam.melds.map((meld) => (
                  <button
                    key={meld.id}
                    type="button"
                    onClick={() =>
                      setInspectingMeld({ owner: opp.name, meld })
                    }
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                      meld.canastaType === 'natural'
                        ? 'bg-rose-600/85 text-white hover:bg-rose-500'
                        : meld.canastaType === 'mixed'
                          ? 'bg-stone-800 border border-amber-400/60 text-amber-200 hover:bg-stone-700'
                          : 'bg-emerald-950/90 border border-emerald-300/25 text-emerald-100 hover:bg-emerald-900'
                    }`}
                  >
                    {meld.isCanasta && <Crown className="h-2.5 w-2.5" />}
                    {meld.rank === '3B' ? '3B' : `${meld.rank}s`} ({meld.cards.length})
                    {meld.wildCount > 0 && !meld.isCanasta && (
                      <span className="text-amber-300">•{meld.wildCount}W</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}

      {/* Inspect Cutthroat Meld Modal */}
      {inspectingMeld && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setInspectingMeld(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-amber-300/30 bg-[#0d3521] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  {inspectingMeld.owner}&apos;s{' '}
                  {inspectingMeld.meld.rank === '3B'
                    ? 'Black 3s'
                    : `${inspectingMeld.meld.rank}s`}{' '}
                  {inspectingMeld.meld.isCanasta
                    ? inspectingMeld.meld.canastaType === 'natural'
                      ? '— Natural Canasta (+500)'
                      : '— Mixed Canasta (+300)'
                    : 'Meld'}
                </h3>
                <p className="text-xs text-emerald-200/80">
                  {inspectingMeld.meld.naturalCount} natural,{' '}
                  {inspectingMeld.meld.wildCount} wild •{' '}
                  {inspectingMeld.meld.cards.reduce(
                    (s, c) => s + getCardPoints(c),
                    0,
                  )}{' '}
                  card pts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMeld(null)}
                className="rounded-lg p-1.5 text-emerald-200 hover:bg-white/10 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 py-2">
              {inspectingMeld.meld.cards.map((c) => (
                <PlayingCard key={c.id} card={c} size="md" showWildBadge />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
