import React from 'react';
import { getCardPoints, type Card } from '../../engine';
import { PlayingCard } from './PlayingCard';

export interface CardHandProps {
  cards: Card[];
  selectedIds: Set<string>;
  stagedIds: Set<string>;
  dimmedIds?: Set<string>;
  disabled?: boolean;
  onToggleCard: (cardId: string) => void;
}

export const CardHand: React.FC<CardHandProps> = ({
  cards,
  selectedIds,
  stagedIds,
  dimmedIds,
  disabled = false,
  onToggleCard,
}) => {
  const visibleCards = cards.filter((c) => !stagedIds.has(c.id));

  // Automatically wrap into 2 balanced rows when hand grows large (> 18 cards)
  const useTwoRows = visibleCards.length > 18;
  const rows: Card[][] = useTwoRows
    ? [
        visibleCards.slice(0, Math.ceil(visibleCards.length / 2)),
        visibleCards.slice(Math.ceil(visibleCards.length / 2)),
      ]
    : [visibleCards];

  const selectedPoints = visibleCards
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + getCardPoints(c), 0);

  return (
    <div className="flex flex-col items-center gap-1.5 w-full">
      <div className="flex items-center gap-3 text-xs text-emerald-100/80">
        <span className="font-medium">
          Your Hand: <strong className="text-white">{visibleCards.length}</strong>{' '}
          card{visibleCards.length === 1 ? '' : 's'}
          {stagedIds.size > 0 && (
            <span className="ml-1.5 text-amber-300">
              (+{stagedIds.size} staged)
            </span>
          )}
        </span>
        {selectedIds.size > 0 && (
          <span className="rounded-full bg-amber-400/20 border border-amber-300/40 px-2.5 py-0.5 text-amber-200 font-medium">
            Selected: {selectedIds.size} ({selectedPoints} pts)
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 w-full overflow-x-auto pb-1 pt-4 px-4">
        {rows.map((row, rowIdx) => {
          const overlapClass =
            row.length > 15
              ? '-ml-7 sm:-ml-8'
              : row.length > 11
                ? '-ml-5 sm:-ml-6'
                : '-ml-3.5 sm:-ml-4';
          return (
            <div
              key={rowIdx}
              className="mx-auto flex w-fit items-end min-h-[100px] sm:min-h-[112px]"
            >
              {row.map((card, idx) => {
                const isSelected = selectedIds.has(card.id);
                const isDimmed = dimmedIds?.has(card.id) ?? false;
                return (
                  <div
                    key={card.id}
                    className={idx === 0 ? '' : overlapClass}
                    style={{ zIndex: isSelected ? 40 : idx + 1 }}
                  >
                    <PlayingCard
                      card={card}
                      size="md"
                      selected={isSelected}
                      dimmed={disabled || isDimmed}
                      showWildBadge
                      onClick={
                        disabled ? undefined : () => onToggleCard(card.id)
                      }
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
