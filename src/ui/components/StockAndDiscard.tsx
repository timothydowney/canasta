import React from 'react';
import { Lock, Ban, Layers } from 'lucide-react';
import type { DiscardPileView } from '../../engine';
import { PlayingCard } from './PlayingCard';

export interface StockAndDiscardProps {
  stockCount: number;
  drawCount: number;
  discardPile: DiscardPileView;
  canDrawStock: boolean;
  canTakeDiscardPile: boolean;
  mustTakeDiscardPile: boolean;
  takePileModeActive: boolean;
  onDrawStock: () => void;
  onClickDiscardPile: () => void;
}

export const StockAndDiscard: React.FC<StockAndDiscardProps> = ({
  stockCount,
  drawCount,
  discardPile,
  canDrawStock,
  canTakeDiscardPile,
  mustTakeDiscardPile,
  takePileModeActive,
  onDrawStock,
  onClickDiscardPile,
}) => {
  const { topCard, count, frozenByWildOrInitial, isFrozenForViewer, frozenCard, blockedByBlackThree } =
    discardPile;

  return (
    <div className="flex items-center justify-center gap-6 sm:gap-10">
      {/* Stock Pile */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative">
          {stockCount > 2 && (
            <div className="pointer-events-none absolute top-1 left-1 opacity-60">
              <PlayingCard faceDown backColor="red" size="md" />
            </div>
          )}
          {stockCount > 0 ? (
            <PlayingCard
              faceDown
              backColor="blue"
              size="md"
              highlight={canDrawStock}
              onClick={canDrawStock ? onDrawStock : undefined}
              className={canDrawStock ? 'ring-2 ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.35)]' : ''}
            />
          ) : (
            <div className="flex h-[101px] w-[72px] sm:h-[115px] sm:w-[82px] flex-col items-center justify-center rounded-md border-2 border-dashed border-emerald-200/30 bg-black/20 text-center text-[11px] font-medium text-emerald-200/60">
              <Layers className="mb-1 h-4 w-4" />
              Empty
            </div>
          )}
          <span className="pointer-events-none absolute -bottom-2 -right-2 rounded-full bg-stone-950/90 border border-amber-400/50 px-2 py-0.5 text-xs font-bold text-amber-200 shadow">
            {stockCount}
          </span>
        </div>
        <span className="text-xs font-medium text-emerald-100/90">
          {canDrawStock
            ? `Draw ${Math.min(drawCount, stockCount)}`
            : 'Stock'}
        </span>
      </div>

      {/* Discard Pile */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative flex items-center justify-center">
          {/* Sideways peeking freezing card */}
          {frozenByWildOrInitial && frozenCard && topCard && frozenCard.id !== topCard.id && (
            <div className="pointer-events-none absolute -left-5 z-0 opacity-95">
              <PlayingCard card={frozenCard} size="sm" rotated />
            </div>
          )}

          {topCard ? (
            <div className="relative z-10">
              <PlayingCard
                card={topCard}
                size="md"
                rotated={frozenByWildOrInitial && frozenCard?.id === topCard.id}
                highlight={canTakeDiscardPile || takePileModeActive}
                onClick={canTakeDiscardPile ? onClickDiscardPile : undefined}
                className={
                  takePileModeActive
                    ? 'ring-2 ring-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.55)]'
                    : canTakeDiscardPile
                      ? 'ring-2 ring-emerald-300/80'
                      : ''
                }
              />
              <span className="pointer-events-none absolute -bottom-2 -right-2 rounded-full bg-stone-950/90 border border-emerald-300/40 px-2 py-0.5 text-xs font-bold text-emerald-100 shadow">
                {count}
              </span>
            </div>
          ) : (
            <div className="flex h-[101px] w-[72px] sm:h-[115px] sm:w-[82px] items-center justify-center rounded-md border-2 border-dashed border-emerald-200/30 bg-black/20 text-[11px] font-medium text-emerald-200/60">
              Empty
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium text-emerald-100/90">
            {mustTakeDiscardPile
              ? 'Must Take Pile'
              : canTakeDiscardPile
                ? 'Take Discard'
                : 'Discard Pile'}
          </span>

          {blockedByBlackThree && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/90 border border-rose-400/50 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
              <Ban className="h-3 w-3" /> Blocked (Black 3)
            </span>
          )}
          {!blockedByBlackThree && frozenByWildOrInitial && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-950/90 border border-sky-400/50 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
              <Lock className="h-3 w-3" /> Frozen (Wild)
            </span>
          )}
          {!blockedByBlackThree && !frozenByWildOrInitial && isFrozenForViewer && count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/90 border border-amber-400/50 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
              <Lock className="h-3 w-3" /> Frozen (Need Initial)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
