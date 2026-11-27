import React, { useMemo } from 'react';
import { getCardLabel, getCardPoints, type Card, type Rank } from '../../engine';
import { PlayingCard } from './PlayingCard';

export interface MobileCardHandProps {
  cards: Card[];
  selectedIds: Set<string>;
  stagedIds: Set<string>;
  newCardIds?: Set<string>;
  dimmedIds?: Set<string>;
  disabled?: boolean;
  onToggleCard: (cardId: string) => void;
}

/**
 * Touch-first mobile hand layout:
 * Clusters cards by rank (small breathing gap between different ranks, tight
 * readable overlap within matching pairs/sets) across balanced rows so every
 * card's rank & suit index is crisp and easy to tap on 390px portrait screens
 * AND spreads gracefully in landscape orientation.
 */
export const MobileCardHand: React.FC<MobileCardHandProps> = ({
  cards,
  selectedIds,
  stagedIds,
  newCardIds,
  dimmedIds,
  disabled = false,
  onToggleCard,
}) => {
  const visibleCards = useMemo(
    () => cards.filter((c) => !stagedIds.has(c.id)),
    [cards, stagedIds],
  );

  // Preserve sorted order while grouping consecutive matching ranks (wilds grouped cleanly too)
  const groups = useMemo(() => {
    const result: Array<{ rank: Rank; cards: Card[] }> = [];
    for (const card of visibleCards) {
      const last = result[result.length - 1];
      if (last && last.rank === card.rank) {
        last.cards.push(card);
      } else {
        result.push({ rank: card.rank, cards: [card] });
      }
    }
    return result;
  }, [visibleCards]);

  const selectedPoints = visibleCards
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + getCardPoints(c), 0);

  const newlyAcquiredVisible = newCardIds
    ? visibleCards.filter((c) => newCardIds.has(c.id))
    : [];

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Slim status line */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-emerald-100/85">
        <span>
          <strong className="text-white">{visibleCards.length}</strong> card
          {visibleCards.length === 1 ? '' : 's'}
          {stagedIds.size > 0 && (
            <span className="ml-1 text-amber-300">(+{stagedIds.size} staged)</span>
          )}
        </span>
        {newlyAcquiredVisible.length > 0 && (
          <span className="rounded-full border border-emerald-300/50 bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
            {newlyAcquiredVisible.length <= 3
              ? `Drew: ${newlyAcquiredVisible.map(getCardLabel).join(', ')}`
              : `Picked up ${newlyAcquiredVisible.length}`}
          </span>
        )}
        {selectedIds.size > 0 && (
          <span className="rounded-full border border-amber-300/50 bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-200">
            {selectedIds.size} selected ({selectedPoints} pts)
          </span>
        )}
      </div>

      {/* Rank-grouped wrapping card canvas */}
      <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-4 px-1 pt-3 pb-2">
        {groups.map((group) => (
          <div
            key={`${group.rank}-${group.cards[0].id}`}
            className="flex items-end"
          >
            {group.cards.map((card, idx) => {
              const isSelected = selectedIds.has(card.id);
              const isDimmed = dimmedIds?.has(card.id) ?? false;
              const isNew = newCardIds?.has(card.id) ?? false;
              // Leave generous left index showing (~30px) within a rank cluster
              const overlap =
                group.cards.length >= 4
                  ? '-ml-9'
                  : group.cards.length === 3
                    ? '-ml-8'
                    : '-ml-7';
              return (
                <div
                  key={card.id}
                  className={`relative ${idx === 0 ? '' : overlap} hover:!z-50`}
                  style={{ zIndex: isSelected ? 40 : idx + 1 }}
                >
                  <PlayingCard
                    card={card}
                    size="md"
                    selected={isSelected}
                    isNew={isNew}
                    dimmed={disabled || isDimmed}
                    showWildBadge
                    onClick={disabled ? undefined : () => onToggleCard(card.id)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
