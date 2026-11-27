import React, { useState } from 'react';
import { Crown, X } from 'lucide-react';
import { getCardPoints, type Card, type Meld } from '../../engine';
import { PlayingCard } from './PlayingCard';

export interface MeldZoneProps {
  title: string;
  melds: Meld[];
  redThrees: Card[];
  hasMadeInitialMeld: boolean;
  /** Meld IDs highlighted as valid click targets for currently selected hand cards */
  targetableMeldIds?: Set<string>;
  onSelectMeld?: (meld: Meld) => void;
  compact?: boolean;
}

export const MeldZone: React.FC<MeldZoneProps> = ({
  title,
  melds,
  redThrees,
  hasMadeInitialMeld,
  targetableMeldIds,
  onSelectMeld,
  compact = false,
}) => {
  const [inspectingMeld, setInspectingMeld] = useState<Meld | null>(null);

  const meldedPoints = melds.reduce(
    (sum, m) => sum + m.cards.reduce((s, c) => s + getCardPoints(c), 0),
    0,
  );
  const canastaCount = melds.filter((m) => m.isCanasta).length;
  const red3Magnitude = redThrees.length === 4 ? 800 : redThrees.length * 100;
  const red3Display =
    redThrees.length === 0
      ? null
      : hasMadeInitialMeld
        ? `+${red3Magnitude}`
        : `-${red3Magnitude} (until initial meld)`;

  return (
    <div className="relative rounded-xl border border-emerald-200/15 bg-black/20 px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-emerald-100">{title}</span>
          <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[11px] text-emerald-200/90">
            Melds: {meldedPoints} pts
          </span>
          <span className="rounded bg-amber-950/70 border border-amber-400/30 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">
            Canastas: {canastaCount}
          </span>
        </div>

        {/* Red 3s inline tray */}
        {redThrees.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center">
              {redThrees.map((c, idx) => (
                <div key={c.id} className={idx === 0 ? '' : '-ml-5'}>
                  <PlayingCard card={c} size="xs" />
                </div>
              ))}
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                hasMadeInitialMeld
                  ? 'bg-rose-500/25 text-rose-200 border border-rose-400/40'
                  : 'bg-amber-950/90 text-amber-200 border border-amber-400/40'
              }`}
            >
              Red 3s: {red3Display}
            </span>
          </div>
        )}
      </div>

      {melds.length === 0 ? (
        <div className="py-3 text-center text-xs italic text-emerald-100/45">
          No melds on the table yet
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          {melds.map((meld) => {
            const isTarget = targetableMeldIds?.has(meld.id) ?? false;
            const handleClick = () => {
              if (isTarget && onSelectMeld) {
                onSelectMeld(meld);
              } else {
                setInspectingMeld(meld);
              }
            };

            if (meld.isCanasta) {
              // Squared-up Canasta stack: red card on top for Natural, black card on top for Mixed
              const topIndicatorCard =
                meld.canastaType === 'natural'
                  ? meld.cards.find((c) => c.color === 'red') ?? meld.cards[0]
                  : meld.cards.find((c) => c.color === 'black') ?? meld.cards[0];

              return (
                <button
                  key={meld.id}
                  type="button"
                  onClick={handleClick}
                  className={`group relative flex flex-col items-center gap-1 rounded-lg p-1 transition ${
                    isTarget
                      ? 'bg-amber-400/20 ring-2 ring-amber-300 cursor-pointer'
                      : 'hover:bg-white/5 cursor-pointer'
                  }`}
                >
                  <div className="relative">
                    <div className="pointer-events-none absolute top-0.5 left-0.5 opacity-70">
                      <PlayingCard card={meld.cards[0]} size="sm" />
                    </div>
                    <PlayingCard card={topIndicatorCard} size="sm" />
                    <span
                      className={`absolute -top-2 -right-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold shadow ${
                        meld.canastaType === 'natural'
                          ? 'bg-rose-600 text-white'
                          : 'bg-stone-800 text-amber-300 border border-amber-400/60'
                      }`}
                    >
                      <Crown className="h-2.5 w-2.5" />
                      {meld.cards.length}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-200">
                    {meld.rank}s • {meld.canastaType === 'natural' ? 'Natural +500' : 'Mixed +300'}
                  </span>
                </button>
              );
            }

            // Regular meld (3–6 cards): fanned slightly so naturals & wilds are clear
            const previewCards = compact ? meld.cards.slice(0, 4) : meld.cards;
            return (
              <button
                key={meld.id}
                type="button"
                onClick={handleClick}
                className={`group flex flex-col items-center gap-1 rounded-lg p-1 transition ${
                  isTarget
                    ? 'bg-amber-400/20 ring-2 ring-amber-300 cursor-pointer'
                    : 'hover:bg-white/5 cursor-pointer'
                }`}
              >
                <div className="flex items-center">
                  {previewCards.map((c, idx) => (
                    <div key={c.id} className={idx === 0 ? '' : '-ml-9'}>
                      <PlayingCard card={c} size="sm" />
                    </div>
                  ))}
                </div>
                <span className="text-[11px] font-semibold text-emerald-100">
                  {meld.rank === '3B' ? 'Black 3s' : `${meld.rank}s`} ({meld.cards.length})
                  {meld.wildCount > 0 && (
                    <span className="ml-1 text-amber-300">• {meld.wildCount}W</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Inspect Meld Popover Modal */}
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
                  {inspectingMeld.rank === '3B' ? 'Black 3s' : `${inspectingMeld.rank}s`}{' '}
                  {inspectingMeld.isCanasta
                    ? inspectingMeld.canastaType === 'natural'
                      ? '— Natural Canasta (+500)'
                      : '— Mixed Canasta (+300)'
                    : 'Meld'}
                </h3>
                <p className="text-xs text-emerald-200/80">
                  {inspectingMeld.naturalCount} natural, {inspectingMeld.wildCount} wild •{' '}
                  {inspectingMeld.cards.reduce((s, c) => s + getCardPoints(c), 0)} card pts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMeld(null)}
                className="rounded-lg p-1.5 text-emerald-200 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 py-2">
              {inspectingMeld.cards.map((c) => (
                <PlayingCard key={c.id} card={c} size="md" showWildBadge />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
